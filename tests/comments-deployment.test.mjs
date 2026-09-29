import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareComments} from '../scripts/prepare-comments.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const account = 'a'.repeat(32);
const env = {WORKERS_CI: '1', WORKERS_CI_BRANCH: 'dev', CLOUDFLARE_API_TOKEN: 'fixture-only'};
function fixture(t, binding = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comments-deploy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), JSON.stringify({
    name: 'story-library', account_id: account, keep_vars: true,
    vars: {EXISTING_SETTING: 'preserve'},
    d1_databases: [{binding: 'COMMENTS_DB', database_name: 'story-library-comments', migrations_dir: 'migrations/comments', ...binding}],
    assets: {binding: 'ASSETS'},
  }));
  return root;
}
const database = {name: 'story-library-comments', uuid: id};
const ok = result => new Response(JSON.stringify({success: true, result}));

test('local builds do not access credentials, files or network', async () => {
  assert.deepEqual(await prepareComments({env: {}, root: '/missing', request: () => assert.fail()}), {skipped: true});
});
test('unknown branches and missing credentials fail before account requests', async t => {
  const root = fixture(t);
  await assert.rejects(prepareComments({root, env: {...env, WORKERS_CI_BRANCH: 'other'}, request: () => assert.fail()}), /main or dev/);
  await assert.rejects(prepareComments({root, env: {...env, CLOUDFLARE_API_TOKEN: ''}, request: () => assert.fail()}), /token is unavailable/);
});
test('an authorization failure never creates a database or applies migrations', async t => {
  const root = fixture(t);
  const before = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  let requests = 0;
  await assert.rejects(prepareComments({root, env, run: () => assert.fail(), request: async () => {
    requests++; return new Response(JSON.stringify({success: false}), {status: 403});
  }}), /HTTP 403/);
  assert.equal(requests, 1);
  assert.equal(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'), before);
});
test('existing database is reused and checked after migrations without inserting comments', async t => {
  const root = fixture(t);
  const steps = [];
  const result = await prepareComments({root, env, request: async (url, options) => {
    steps.push(options.method || 'GET');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/query')) {
      assert.match(JSON.parse(options.body).sql, /WHERE 0$/);
      assert.equal(steps.at(-2), 'migrate');
      return ok([]);
    }
    return ok([database]);
  }, run: (args, options) => {
    steps.push('migrate');
    assert.deepEqual(args.slice(0, 7), ['--yes', 'wrangler', 'd1', 'migrations', 'apply', 'story-library-comments', '--remote']);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc')));
    assert.equal(config.d1_databases[0].database_id, id);
    assert.equal(config.vars.EXISTING_SETTING, 'preserve');
    assert.equal(config.keep_vars, true);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, account);
    assert.equal(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8').includes(env.CLOUDFLARE_API_TOKEN), false);
  }});
  assert.deepEqual(steps, ['GET', 'migrate', 'POST']);
  assert.equal(result.databaseId, id);
});
test('first build creates only the named database and propagates migration failures', async t => {
  const root = fixture(t);
  let calls = 0;
  await assert.rejects(prepareComments({root, env, request: async (url, options) => {
    calls++;
    if (calls === 1) return ok([]);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {name: 'story-library-comments'});
    return ok(database);
  }, run: () => {throw new Error('migration failed');}}), /migration failed/);
  assert.equal(calls, 2);
});
test('a missing pinned database, mismatched identity or account cannot be replaced', async t => {
  const root = fixture(t, {database_id: id});
  await assert.rejects(prepareComments({root, env, request: async () => ok([]), run: () => assert.fail()}), /refusing to replace/);
  await assert.rejects(prepareComments({root, env, request: async () => ok([{...database, uuid: '22222222-2222-4222-8222-222222222222'}]), run: () => assert.fail()}), /ID changed/);
  await assert.rejects(prepareComments({root, env: {...env, CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32)}, request: () => assert.fail()}), /account does not match/);
});
