#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'story-library-comments';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the existing Cloudflare build may provision the production comment store.
// Local reader builds and public GitHub fixture tests never contact an account.
export async function prepareComments({
  env = process.env, root = ROOT, request = fetch,
  run = (args, options) => execFileSync('npx', args, options),
} = {}) {
  if (!env.WORKERS_CI && !env.WORKERS_CI_BRANCH) return {skipped: true};
  if (!['main', 'dev'].includes(env.WORKERS_CI_BRANCH)) {
    throw new Error('Comments setup requires a main or dev Workers build');
  }
  const file = path.join(root, 'wrangler.jsonc');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.name !== 'story-library') throw new Error('Unexpected Worker');
  const binding = config.d1_databases?.find(item => item.binding === 'COMMENTS_DB');
  if (binding?.database_name !== NAME || binding.migrations_dir !== 'migrations/comments') {
    throw new Error('Unexpected comment database configuration');
  }
  const account = config.account_id;
  if (!/^[0-9a-f]{32}$/.test(account || '')) throw new Error('Missing Cloudflare account ID');
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== account) {
    throw new Error('Cloudflare account does not match the configured Worker');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Workers build token is unavailable; select a build API token with Account / D1 / Edit');
  }
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database';
  async function api(suffix, options = {}) {
    const response = await request(base + suffix, {
      ...options,
      headers: {Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json'},
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    let result;
    try { result = await response.json(); } catch { /* Do not print upstream HTML or credentials. */ }
    if (!response.ok || result?.success !== true) {
      throw new Error('D1 setup failed (HTTP ' + response.status +
        '); verify the Workers build token has Account / D1 / Edit');
    }
    return result.result;
  }
  const databases = await api('?name=' + encodeURIComponent(NAME) + '&per_page=100');
  if (!Array.isArray(databases)) throw new Error('Invalid D1 database list');
  const matches = databases.filter(database => database.name === NAME);
  if (matches.length > 1) throw new Error('Ambiguous comment database name');
  let database = matches[0];
  if (!database) {
    if (binding.database_id) throw new Error('Configured comment database is missing; refusing to replace it');
    database = await api('', {method: 'POST', body: JSON.stringify({name: NAME})});
  }
  if (database?.name !== NAME || !UUID.test(database?.uuid || '')) throw new Error('Invalid comment database identity');
  if (binding.database_id && binding.database_id !== database.uuid) {
    throw new Error('Comment database ID changed; refusing to replace it');
  }
  binding.database_id = database.uuid;
  // Only the disposable build checkout is updated. Credentials never enter the file.
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  run(['--yes', 'wrangler', 'd1', 'migrations', 'apply', NAME, '--remote', '--config', file], {
    cwd: root, env: {...env, CI: 'true', CLOUDFLARE_ACCOUNT_ID: account}, stdio: 'inherit',
  });
  // Verify the required columns exist without reading or creating reader comments.
  await api('/' + database.uuid + '/query', {
    method: 'POST',
    body: JSON.stringify({sql: 'SELECT id, work_id, episode_id, reader_key, name, body, created_at FROM episode_comments WHERE 0'}),
  });
  return {databaseId: database.uuid};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await prepareComments();
    console.log(result.skipped ? 'Comments setup skipped outside Workers Builds.' : 'Comments database migrated and verified.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
