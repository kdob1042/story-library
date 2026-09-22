import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyNamePlan} from '../skills/manga-director/machine.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const [workId,episodeId,explicitPath]=process.argv.slice(2);
if(!workId||!episodeId){
  console.error('usage: node scripts/validate-name-plan.mjs <workId> <episodeId> [name-plan.json]');
  process.exit(2);
}
const catalog=JSON.parse(await readFile(path.join(root,'library.json'),'utf8'));
const work=catalog.works.find(item=>item.id===workId);
if(!work)throw Error(`library.jsonに作品 ${workId} がありません`);
const workRoot=path.join(root,work.root);
const planPath=explicitPath?path.resolve(explicitPath):path.join(workRoot,'manga',episodeId,'name-plan.json');
const result=await verifyNamePlan({workRoot,workId,episodeId,raw:await readFile(planPath,'utf8')});
console.log(JSON.stringify(result,null,2));
