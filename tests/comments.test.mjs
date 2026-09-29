import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {commentsEnvironment} from './helpers/comments-env.mjs';

test('published build and real Worker/D1 enforce one comment per reader per P1 episode', async t => {
  const env = await commentsEnvironment();
  t.after(() => env.dispose());
  const endpoint = (episode = 'C01-E01', work = 'fixture-novel') => `https://story.example/api/comments?work=${work}&episode=${episode}`;
  const get = (cookie, episode, work) => env.mf.dispatchFetch(endpoint(episode, work), {headers: cookie ? {Cookie: cookie} : {}});
  const initial = await get();
  assert.equal(initial.status, 200);
  const cookie = initial.headers.get('Set-Cookie').split(';')[0];
  assert.match(initial.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.match(initial.headers.get('Cache-Control'), /no-store/);
  const post = (episode, reader = cookie, body = 'エピソードへの感想です。', extra = {}) => env.mf.dispatchFetch(endpoint(episode), {
    method: 'POST', headers: {Cookie: reader, Origin: 'https://story.example', 'Content-Type': 'application/json'},
    body: JSON.stringify({name: '読者A', body}), ...extra,
  });
  const simultaneous = await Promise.all([post('C01-E01'), post('C01-E01')]);
  assert.deepEqual(simultaneous.map(response => response.status).sort(), [201, 409]);
  assert.equal((await post('C01-E02')).status, 201);
  assert.equal((await post('C01-E03')).status, 201);
  const secondCookie = (await get()).headers.get('Set-Cookie').split(';')[0];
  assert.equal((await post('C01-E01', secondCookie, '<img src=x onerror=alert(1)>')).status, 201);
  const listed = await (await get(cookie)).json();
  assert.equal(listed.comments.length, 2);
  assert.equal(listed.submitted, true);
  assert.equal(listed.comments[0].body, '<img src=x onerror=alert(1)>');
  assert.equal('reader_key' in listed.comments[0], false);
  assert.equal((await get(cookie, 'C01-E01', 'fixture-story')).status, 404);
  assert.equal((await get(cookie, 'P01', 'fixture-story')).status, 404);
  assert.equal((await get(cookie, 'P01-01', 'fixture-story')).status, 200);

  await t.test('invalid, cross-origin, missing-cookie and unpublished requests cannot write', async () => {
    assert.equal((await post('C01-E01', secondCookie, '   ')).status, 400);
    assert.equal((await post('C01-E01', secondCookie, 'x'.repeat(1001))).status, 400);
    assert.equal((await post('C01-E01', secondCookie, 'x'.repeat(9000))).status, 400);
    assert.equal((await post('C01-E01', '')).status, 403);
    assert.equal((await post('C01-E01', cookie, 'a', {headers: {Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json'}})).status, 403);
    assert.equal((await post('C01-E01', cookie, 'a', {headers: {Cookie: cookie, 'Content-Type': 'application/json'}})).status, 403);
    assert.equal((await post('C01-E01', cookie, 'a', {headers: {Cookie: cookie, Origin: 'https://story.example', 'Content-Type': 'text/plain'}})).status, 415);
    assert.equal((await post('C99-E99')).status, 404);
    assert.equal((await env.mf.dispatchFetch(endpoint().replace('story.example', 'dev-story.example'))).status, 404);
    assert.equal((await env.mf.dispatchFetch(endpoint(), {method: 'DELETE'})).status, 405);
  });

  await t.test('pagination includes older comments and preserves the posting limit', async () => {
    for (let index = 0; index < 51; index++) {
      await env.db.prepare('INSERT INTO episode_comments (work_id, episode_id, reader_key, name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('fixture-novel', 'C01-E01', `fixture-${index}`, '人工読者', '人工コメント', new Date().toISOString()).run();
    }
    const page = await (await get(cookie)).json();
    assert.equal(page.comments.length, 50);
    assert.equal(page.submitted, true);
    const older = await (await env.mf.dispatchFetch(endpoint() + '&before=' + page.nextCursor, {headers: {Cookie: cookie}})).json();
    assert.equal(older.comments.length, 3);
    assert.equal(older.nextCursor, null);
    assert.equal(older.submitted, true);
  });

  await t.test('private build and withdrawn episodes reject reads and posts without deleting stored comments', async () => {
    const html = fs.readFileSync(path.join(env.dist, 'index.html'), 'utf8');
    assert.match(html, /id="episodeComments"/);
    env.build(false);
    assert.doesNotMatch(fs.readFileSync(path.join(env.dist, 'index.html'), 'utf8'), /id="episodeComments"/);
    assert.equal((await get(cookie)).status, 404);
    assert.equal((await post('C01-E01')).status, 404);
    env.build();
    const publicationPath = path.join(env.temp, 'works/fixture-novel/publication.yaml');
    const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'));
    publication.formats.novel.episodes[0].approved = false;
    fs.writeFileSync(publicationPath, JSON.stringify(publication));
    env.build();
    assert.equal((await get(cookie)).status, 404);
    assert.equal((await post('C01-E01')).status, 404);
    assert.equal((await env.db.prepare('SELECT count(*) AS n FROM episode_comments WHERE work_id = ? AND episode_id = ?').bind('fixture-novel', 'C01-E01').first()).n, 53);
  });
});
