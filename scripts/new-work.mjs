import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createNewWork } from '../contracts/library/new-work.mjs';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1];
}

const workId = arg('--work-id');
const title = arg('--title');
if (!workId || !title) {
  console.error('usage: node scripts/new-work.mjs --work-id <id> --title <title> [--library .] [--dry-run]');
  process.exit(1);
}

const libraryRoot = resolve(arg('--library', '.'));
const result = await createNewWork({
  catalog: JSON.parse(await readFile(resolve(libraryRoot, 'library.json'), 'utf8')),
  sourceMap: JSON.parse(await readFile(resolve(libraryRoot, 'migrations/source-map.json'), 'utf8')),
  libraryRoot,
  workId,
  title,
  dryRun: process.argv.includes('--dry-run'),
});

console.log(`${result.wrote ? 'created' : 'dry-run'} ${workId}`);
console.log(`root=${result.work.root} format=story-source/v1 visibility=private`);
console.log('new works do not create a Worker, domain, or public listing');
