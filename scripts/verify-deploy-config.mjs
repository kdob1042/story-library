import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJsonc(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(source);
}

const production = readJsonc('wrangler.jsonc');
const preview = readJsonc('wrangler.dev.jsonc');
const errors = [];

for (const [label, config] of [['production', production], ['preview', preview]]) {
  if (config.workers_dev !== true) errors.push(label + ': workers_dev must remain true for Access-protected workers.dev');
  if (config.main !== './worker.mjs') errors.push(label + ': main must point to ./worker.mjs');
  if (config.assets?.directory !== './dist/reader') errors.push(label + ': assets.directory must be ./dist/reader');
  if (config.assets?.binding !== 'ASSETS') errors.push(label + ': assets.binding must be ASSETS');
  if (config.assets?.run_worker_first !== true) errors.push(label + ': assets.run_worker_first must remain true');
  if (config.assets?.not_found_handling !== '404-page') errors.push(label + ': not_found_handling must be 404-page');
  if ('routes' in config || 'route' in config) errors.push(label + ': dashboard-managed routes must not be committed');
}
if (production.name !== 'story-library-reader') errors.push('production: Worker name must be story-library-reader');
if (preview.name !== 'story-library-reader-dev') errors.push('preview: Worker name must be story-library-reader-dev');
if (production.name === preview.name) errors.push('production and preview Worker names must be different');

if (errors.length) {
  console.error('Reader deployment config failed:');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
console.log('Reader deployment config passed: production and preview are isolated.');
