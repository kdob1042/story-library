import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {validateManifest} from '../../contracts/story-source/validate.mjs';
import {parseNameFile, validatePlan, FORMAT, POLICY_VERSION} from '../../contracts/name-plan/schema.mjs';
import {atomize, bindSource, sourceCharacterIds, embeddedSourceDescriptor, hasEmbeddedSource, selectAtoms} from '../../contracts/name-plan/source.mjs';
import {compileNameLayout} from '../../contracts/name-plan/layout.mjs';

const ZERO_COMMIT='0'.repeat(40);
const text=filename=>readFile(filename,'utf8');

function allScenes(manifest){
  return manifest.episodes.flatMap(episode=>episode.scenes.map(scene=>({...scene,episodeId:episode.id,episodeTitle:episode.title})));
}

export async function loadDirectorContext({workRoot,workId,episodeId,repo='kdob1042/story-library',branch='dev',commit=ZERO_COMMIT,sceneIds=null}){
  if(!workRoot||!workId||!episodeId)throw Error('workRoot/workId/episodeIdが必要です');
  const root=path.resolve(workRoot);
  const manifest=validateManifest(JSON.parse(await text(path.join(root,'work.json'))));
  const episode=manifest.episodes.find(item=>item.id===episodeId);
  if(!episode)throw Error(`話 ${episodeId} がwork.jsonにありません`);
  const declarations=allScenes(manifest),requested=sceneIds?.length?[...sceneIds]:episode.scenes.map(scene=>scene.id);
  if(new Set(requested).size!==requested.length)throw Error('検査するscene IDが重複しています');
  const requestedSet=new Set(requested),scenes=[];
  for(const scene of declarations.filter(item=>requestedSet.has(item.id))){
    scenes.push({...scene,text:await text(path.join(root,scene.path)),design:''});
  }
  if(scenes.length!==requested.length)throw Error('name-planが参照するscene IDがwork.jsonにありません');
  const settings=[];
  for(const setting of manifest.settings)settings.push({...setting,text:await text(path.join(root,setting.path))});
  const references=[]; // Image files are imported separately by character ID in the app.
  const snapshot={
    id:`director:${workId}:${episodeId}`,repo,sha:commit,workId,episodeId,episodeIds:[episodeId],
    manifest,scenes,settings,references,characters:manifest.characters,
    protocol:{version:1,format:'story-source/v1',manifest_schema_version:'story-source/v1'},
    sync:{source_commit:commit,source_branch:branch,manifest_path:`${path.basename(root)}/work.json`},
  };
  const project={workId,active:snapshot.id,snapshots:[snapshot],characters:[],panels:[],jobs:[],artworks:[],history:[],sourceApplication:{version:1,units:[]},layout:{version:1,pages:[],knownPanelIds:[]}};
  return {root,manifest,episode,snapshot,project,atoms:atomize(snapshot,episode.scenes.map(scene=>scene.id))};
}

export async function verifyNamePlan({workRoot,workId,episodeId,raw}){
  const file=parseNameFile(typeof raw==='string'?raw:JSON.stringify(raw));
  if(file.source.workId!==workId)throw Error(`name-planのworkIdが対象 ${workId} と一致しません`);
  if(hasEmbeddedSource(file)&&file.source.episodeId!==episodeId)throw Error('ネームの話IDが異なります');
  const context=hasEmbeddedSource(file)?{project:{workId}}:await loadDirectorContext({
    workRoot,workId,episodeId,repo:file.source.repo,branch:file.source.branch,
    commit:file.source.commit??ZERO_COMMIT,sceneIds:file.source.scenes.map(scene=>scene.id),
  });
  const bound=await bindSource(file,context.project);
  if(!hasEmbeddedSource(file)){
    const primaryScenes=new Set(context.episode.scenes.map(scene=>scene.id));
    if(bound.atoms.some(atom=>!primaryScenes.has(atom.source.sceneId)))throw Error('対象の原文が指定話の外にあります');
  }
  validatePlan(file.plan,bound.atoms,sourceCharacterIds(bound.snapshot),bound.contextAtoms);
  const compiled=compileNameLayout(file.plan);
  return {
    format:file.format,workId,episodeId,atoms:bound.atoms.length,panels:file.plan.panels.length,pages:file.plan.pages.length,
    characters:sourceCharacterIds(bound.snapshot),compilerVersion:compiled.compilerVersion,
    diagnostics:compiled.diagnostics,
  };
}

// The AI supplies only the direction. Original text and IDs come from the frozen context.
export async function createEmbeddedNamePlan(context,draft,number){
  if(!Number.isSafeInteger(number)||number<1||number>999999)throw Error('ネーム番号は1〜999999で指定してください');
  const {snapshot,project}=context;
  const atoms=selectAtoms(atomize(snapshot),draft.plan.coverage.map(entry=>entry.atomId));
  const file={format:FORMAT,title:draft.title,stage:'name-only',readingDirection:'rtl',
    source:embeddedSourceDescriptor(project,snapshot,atoms,draft.plan,{episodeId:snapshot.episodeId,number}),
    policyVersion:POLICY_VERSION,provenance:draft.provenance,plan:draft.plan};
  await verifyNamePlan({workId:snapshot.workId,episodeId:snapshot.episodeId,raw:file});
  return file;
}
export async function writeEmbeddedNamePlan({context,draft,number,workRoot,replace=false}){
  const file=await createEmbeddedNamePlan(context,draft,number);
  const folder=path.join(workRoot,'manga',file.source.episodeId);
  await mkdir(folder,{recursive:true});
  const filename=path.join(folder,`name-${String(number).padStart(3,'0')}.json`);
  // wx prevents accidental overwrite of an existing numbered part.
  await writeFile(filename,JSON.stringify(file,null,2)+'\n',{flag:replace?'w':'wx'});
  return {filename,file};
}
