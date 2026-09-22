import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateManifest} from '../../contracts/story-source/validate.mjs';
import {parseNameFile, validatePlan} from '../../contracts/name-plan/schema.mjs';
import {atomize, bindSource, sourceCharacterIds} from '../../contracts/name-plan/source.mjs';
import {compileNameLayout} from '../../contracts/name-plan/layout.mjs';

const ZERO_COMMIT='0'.repeat(40);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
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
  const references=[];
  for(const character of manifest.characters){
    if(!character.image)continue;
    const bytes=await readFile(path.join(root,character.image));
    references.push({
      id:character.id,characterId:character.id,name:character.name,path:character.image,
      alt:character.description||character.name,
      ...(character.description?{description:character.description}:{}),
      hash:sha256(bytes),
    });
  }
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
  const context=await loadDirectorContext({
    workRoot,workId,episodeId,repo:file.source.repo,branch:file.source.branch,
    commit:file.source.commit??ZERO_COMMIT,sceneIds:file.source.scenes.map(scene=>scene.id),
  });
  const bound=await bindSource(file,context.project);
  const primaryScenes=new Set(context.episode.scenes.map(scene=>scene.id));
  if(bound.atoms.some(atom=>!primaryScenes.has(atom.source.sceneId)))throw Error('漫画化対象のatomが指定話の外にあります。前後話はcontextAtomIdsだけで参照してください');
  validatePlan(file.plan,bound.atoms,sourceCharacterIds(context.snapshot),bound.contextAtoms);
  const compiled=compileNameLayout(file.plan);
  return {
    format:file.format,workId,episodeId,atoms:bound.atoms.length,panels:file.plan.panels.length,pages:file.plan.pages.length,
    characters:sourceCharacterIds(context.snapshot),compilerVersion:compiled.compilerVersion,
    diagnostics:compiled.diagnostics,
  };
}
