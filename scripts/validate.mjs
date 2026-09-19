import { resolve } from 'node:path';
import { validateRepository } from '../contracts/library/validate.mjs';

const root = resolve(process.argv[2] ?? '.');
const result = await validateRepository(root);
const pending = result.catalog.works.filter(work => work.importStatus.startsWith('pending'));
console.log(`catalog ${result.catalog.format}: ${result.catalog.works.length} works`);
for (const work of result.catalog.works) {
  console.log(`- ${work.id}  authority=${work.authority}  status=${work.importStatus}  origin=${work.origin.repository}`);
}
console.log(`source-map entries: ${result.sourceMap.entries.length}`);
console.log(`imported/verified local trees: ${result.imported.length}`);
if (pending.length) {
  console.log(`pending origin works remain canonical until M8: ${pending.map(work => work.id).join(', ')}`);
}
