import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyNamePlan} from '../skills/manga-director/machine.mjs';
import {joinEpisodeFiles,PAGE_FORMAT} from '../contracts/name-plan/page.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const [workId,episodeId,explicitPath]=process.argv.slice(2);
if(!workId||!episodeId||!explicitPath){
  console.error('usage: node scripts/validate-name-plan.mjs <workId> <episodeId> <episode.json or legacy name.json>');
  process.exit(2);
}
const catalog=JSON.parse(await readFile(path.join(root,'library.json'),'utf8'));
const work=catalog.works.find(item=>item.id===workId);
if(!work)throw Error(`library.jsonに作品 ${workId} がありません`);
const workRoot=path.join(root,work.root);
const planPath=explicitPath?path.resolve(explicitPath):path.join(workRoot,'manga',episodeId,'name-plan.json');
const raw=await readFile(planPath,'utf8'),file=JSON.parse(raw);
let result;
if(file.format===PAGE_FORMAT){
  const pages={};for(const id of file.pageIds)pages[id]=JSON.parse(await readFile(path.join(path.dirname(planPath),'pages',`${id}.json`),'utf8'));
  const episode=joinEpisodeFiles(file,pages);
  if(episode.workId!==workId||episode.episodeId!==episodeId)throw Error('話の作品・話IDが異なります');
  result={format:PAGE_FORMAT,workId,episodeId,pages:episode.pages.length,panels:episode.pages.flatMap(page=>page.panels).length};
}else result=await verifyNamePlan({workRoot,workId,episodeId,raw});
console.log(JSON.stringify(result,null,2));
