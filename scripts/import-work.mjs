import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importWork } from '../contracts/library/import-work.mjs';

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1];
}

const workId = arg('--work-id');
const originRoot = arg('--from');
if (!workId || !originRoot) {
  console.error('usage: node scripts/import-work.mjs --work-id <id> --from <origin-checkout> [--library .] [--repo owner/name] [--ref main] [--commit sha] [--dry-run] [--replace]');
  process.exit(1);
}

const libraryRoot = resolve(arg('--library', '.'));
const catalog = JSON.parse(await readFile(resolve(libraryRoot, 'library.json'), 'utf8'));
const sourceMap = JSON.parse(await readFile(resolve(libraryRoot, 'migrations/source-map.json'), 'utf8'));
const result = await importWork({
  catalog,
  sourceMap,
  libraryRoot,
  workId,
  originRoot: resolve(originRoot),
  originRepository: arg('--repo'),
  originRef: arg('--ref'),
  commit: arg('--commit'),
  dryRun: process.argv.includes('--dry-run'),
  replaceImport: process.argv.includes('--replace'),
});

console.log(`${result.wrote ? 'copied' : 'dry-run'} ${workId}`);
console.log(`origin remains canonical; files=${result.plan.copies.length}`);
console.log(`readingOrder=${result.model.readingOrder.join(',')}`);
console.log('did not delete, archive, or change the origin repository');

