import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

function createEmailEnvironment() {
  const store = new Map();
  const calls = [];
  let confirmationBody = null;
  const index = {
    published: true,
    works: [{
      id: 'investor-life',
      title: '投資家の人生',
      episodes: [{id: 'C01-E01', title: '第一話'}],
    }],
  };
  const env = {
    EMAIL_PUBLIC_ORIGIN: 'https://story.example',
    EMAIL_FROM: 'Story Library <story@example.com>',
    EMAIL_SIGNING_SECRET: 'a'.repeat(48),
    EMAIL_DISPATCH_TOKEN: 'dispatch-secret',
    RESEND_API_KEY: 're_test',
    RESEND_WORKS_JSON: JSON.stringify({
      'investor-life': {segmentId: 'segment-1234', topicId: 'topic-1234'},
    }),
    NOTIFICATION_STATE: {
      async get(key) { return store.get(key) || null; },
      async put(key, value) { store.set(key, value); },
    },
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify(index), {status: 200, headers: {'Content-Type': 'application/json'}});
      },
    },
  };
  return {env, calls, getConfirmationBody: () => confirmationBody, setConfirmationBody: value => { confirmationBody = value; }};
}

test('worker requires the public origin and handles double opt-in plus dedupe', async () => {
  const {env, calls, getConfirmationBody, setConfirmationBody} = createEmailEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({target, init});
    const body = init.body ? JSON.parse(init.body) : null;
    if (target.endsWith('/emails')) {
      setConfirmationBody(body);
      return new Response(JSON.stringify({id: 'email-1'}), {status: 200});
    }
    if (target.endsWith('/contacts') || target.includes('/contacts/')) {
      return new Response(JSON.stringify({id: 'contact-1'}), {status: 200});
    }
    if (target.endsWith('/broadcasts')) {
      return new Response(JSON.stringify({id: 'broadcast-1'}), {status: 200});
    }
    throw new Error('unexpected fetch: ' + target);
  };

  try {
    const subscribed = await worker.fetch(new Request('https://story.example/api/email/subscribe', {
      method: 'POST',
      headers: {Origin: 'https://story.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1'},
      body: JSON.stringify({email: 'reader@example.com', workId: 'investor-life', format: 'novel'}),
    }), env);
    assert.equal(subscribed.status, 202);

    const confirmationBody = getConfirmationBody();
    const confirmationUrl = new URL(confirmationBody.html.match(/href="([^"]+)"/)[1]);
    const confirmed = await worker.fetch(new Request(confirmationUrl), env);
    assert.equal(confirmed.status, 200);

    const notification = {
      eventId: 'investor-life:novel:C01-E01:manifest-1234',
      workId: 'investor-life',
      format: 'novel',
      episodeId: 'C01-E01',
    };
    const first = await worker.fetch(new Request('https://story.example/api/email/notify', {
      method: 'POST',
      headers: {Authorization: 'Bearer dispatch-secret', 'Content-Type': 'application/json'},
      body: JSON.stringify(notification),
    }), env);
    const second = await worker.fetch(new Request('https://story.example/api/email/notify', {
      method: 'POST',
      headers: {Authorization: 'Bearer dispatch-secret', 'Content-Type': 'application/json'},
      body: JSON.stringify(notification),
    }), env);
    assert.equal(first.status, 202);
    assert.equal(second.status, 200);
    assert.equal(calls.filter(call => call.target.endsWith('/broadcasts')).length, 1);

    const dev = await worker.fetch(new Request('https://dev-story.example/api/email/subscribe', {
      method: 'POST',
      body: JSON.stringify({email: 'reader@example.com', workId: 'investor-life', format: 'novel'}),
    }), env);
    assert.equal(dev.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
