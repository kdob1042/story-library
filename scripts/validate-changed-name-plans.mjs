import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyNamePlan} from '../skills/manga-director/machine.mjs';

export async function validateChangedNamePlans(root,paths){
  const candidates=paths.filter(path=>/\/manga\/[^/]+\/(name-\d+|name-plan)\.json$/.test(path));
  if(!candidates.length)return [];
  const catalog=JSON.parse(await readFile(join(root,'library.json'),'utf8')),results=[];
  for(const filename of candidates){
    const work=catalog.works.find(work=>filename.startsWith(`${work.root}/manga/`));
    if(!work)throw Error(`作品rootにないネーム: ${filename}`);
    const relative=filename.slice(`${work.root}/manga/`.length),[episodeId,name]=relative.split('/');
    if(relative.split('/').length!==2)throw Error('ネームの保存場所が不正です');
    const raw=await readFile(join(root,filename),'utf8'),file=JSON.parse(raw);
    if(file.source?.kind!=='embedded')throw Error(`${filename}: 更新するネームは原文入りの番号付き形式で書き出してください`);
    if(name!==`name-${String(file.source.number).padStart(3,'0')}.json`)throw Error('ネーム番号とファイル名が異なります');
    results.push(await verifyNamePlan({workId:work.id,episodeId,raw}));
  }
  return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [base,head='HEAD']=process.argv.slice(2);
  if(!base||!/^[\w./-]+$/.test(base)||!/^[\w./-]+$/.test(head))throw Error('base/headを指定してください');
  const paths=execFileSync('git',['diff','--name-only','--diff-filter=ACMR','-z',base,head,'--'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const results=await validateChangedNamePlans(process.cwd(),paths);
  console.log(`変更ネーム ${results.length}件を検証しました`);
}
