import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDirectorContext,writeEmbeddedNamePlan} from '../skills/manga-director/machine.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const [command,workId,episodeId,contextPath,draftPath,number,...flags]=process.argv.slice(2);
if(!['prepare','write'].includes(command)||!workId||!episodeId||!contextPath)throw Error('usage: name-plan.mjs prepare <workId> <episodeId> <context.json> | write <workId> <episodeId> <context.json> <draft.json> <number> [--replace]');
const catalog=JSON.parse(await readFile(path.join(root,'library.json'),'utf8'));
const work=catalog.works.find(work=>work.id===workId);
if(!work)throw Error('library.jsonに作品がありません');
const workRoot=path.join(root,work.root);
if(command==='prepare'){
  const context=await loadDirectorContext({workRoot,workId,episodeId});
  await writeFile(contextPath,JSON.stringify(context,null,2)+'\n');
  console.log(`保存した原文から ${context.atoms.length} atomを用意しました`);
}else{
  const context=JSON.parse(await readFile(contextPath,'utf8'));
  if(context.snapshot?.workId!==workId||context.snapshot?.episodeId!==episodeId)throw Error('contextの作品・話が異なります');
  const draft=JSON.parse(await readFile(draftPath,'utf8'));
  const result=await writeEmbeddedNamePlan({context,draft,number:Number(number),workRoot,replace:flags.includes('--replace')});
  console.log(result.filename);
}
