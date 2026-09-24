import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyNamePlan} from '../skills/manga-director/machine.mjs';
import {joinEpisodeFiles,PAGE_FORMAT} from '../contracts/name-plan/page.mjs';

export async function validateChangedNamePlans(root,paths){
  const modern=paths.filter(path=>/\/manga\/[^/]+\/(episode\.json|pages\/[^/]+\.json)$/.test(path));
  const candidates=paths.filter(path=>/\/manga\/[^/]+\/(name-\d+|name-plan)\.json$/.test(path));
  if(!candidates.length&&!modern.length)return [];
  const catalog=JSON.parse(await readFile(join(root,'library.json'),'utf8')),results=[];
  const indexed=new Map();
  for(const filename of modern){
    const work=catalog.works.find(work=>filename.startsWith(`${work.root}/manga/`));
    if(!work)throw Error(`作品rootにないネーム: ${filename}`);
    const parts=filename.slice(`${work.root}/manga/`.length).split('/');
    if(parts.length<2||parts.length>3)throw Error('ページネームのパスが不正です');
    const [episodeId]=parts,key=`${work.id}:${episodeId}`;
    const entry=indexed.get(key)??{work,episodeId,pageIds:new Set(),indexChanged:false};
    if(parts.length===2&&parts[1]==='episode.json')entry.indexChanged=true;
    else if(parts.length===3&&parts[1]==='pages')entry.pageIds.add(parts[2].slice(0,-5));
    else throw Error('ページネームのパスが不正です');
    indexed.set(key,entry);
  }
  for(const {work,episodeId,pageIds,indexChanged} of indexed.values()){
    const folder=join(root,work.root,'manga',episodeId),manifest=JSON.parse(await readFile(join(folder,'episode.json'),'utf8'));
    if(manifest.format!==PAGE_FORMAT||manifest.workId!==work.id||manifest.episodeId!==episodeId)throw Error('話の索引・作品IDが不正です');
    const selected=indexChanged?manifest.pageIds:[...pageIds];
    if(selected.some(id=>!manifest.pageIds.includes(id)))throw Error('変更ページが話の索引にありません');
    const pages={};
    for(const id of selected)pages[id]=JSON.parse(await readFile(join(folder,'pages',`${id}.json`),'utf8'));
    joinEpisodeFiles(manifest,pages);
    results.push({format:PAGE_FORMAT,workId:work.id,episodeId,pages:selected.length});
  }
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
