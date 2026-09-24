import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateRepository } from '../contracts/library/validate.mjs';
import { verifyNamePlan } from '../skills/manga-director/machine.mjs';

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

// Check every saved name-plan through the same source binding as manga-mac.
for (const { work } of result.imported) {
  const workRoot = join(root, work.root);
  const mangaRoot = join(workRoot, 'manga');
  const episodes = await readdir(mangaRoot, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const episode of episodes.filter(entry => entry.isDirectory())) {
    const folder = join(mangaRoot, episode.name);
    if (!(await readdir(folder)).includes('name-plan.json')) continue;
    const raw = await readFile(join(folder, 'name-plan.json'), 'utf8');
    const verified = await verifyNamePlan({ workRoot, workId: work.id, episodeId: episode.name, raw });
    console.log(`name-plan ${work.id}/${episode.name}: ${verified.panels} panels, ${verified.pages} pages`);
  }
}
