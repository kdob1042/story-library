import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadDirectorContext,createEmbeddedNamePlan,writeEmbeddedNamePlan,verifyNamePlan} from '../skills/manga-director/machine.mjs';
import {validateChangedNamePlans} from '../scripts/validate-changed-name-plans.mjs';
export function direction(atoms){return {title:'人工ネーム',provenance:{producer:'fixture',model:'',editedBy:[]},plan:{
 workGoal:{readerQuestion:'どうなる',emotionalArc:['期待'],payoff:'反応'},coverage:atoms.map(a=>({atomId:a.id,presentation:a.kind==='dialogue'?'dialogue':a.kind==='reference'?'reference':'visual',reason:'原文を保持'})),
 beats:[{id:'b1',atomIds:atoms.map(a=>a.id),function:'setup',tempo:'normal',readerBefore:'未読',readerAfter:'理解'}],
 panels:[{id:'p1',atomIds:atoms.map(a=>a.id),contextAtomIds:[],beatIds:['b1'],characterIds:[],role:'standard',shot:'medium',shotIntent:'原稿を描く',prompt:'No text',silentReason:'',protect:[],gaze:'neutral'}],
 pages:[{id:'page1',purpose:'導入',entryBeatId:'b1',exit:{kind:'pause',note:'次へ',payoffBeatIds:[]},tree:{type:'leaf',panelId:'p1'}}]}};}

test('frozen original produces partial numbered names without current manuscript or images',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'director-embedded-'));
 try{
  const workRoot=path.join(root,'works','example');await cp(new URL('../templates/work/',import.meta.url),workRoot,{recursive:true});
  const manifestPath=path.join(workRoot,'work.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.characters=[{id:'yumi',name:'由美',image:'assets/missing.png'}];await writeFile(manifestPath,JSON.stringify(manifest));
  const scene=manifest.episodes[0].scenes[0];await writeFile(path.join(workRoot,scene.path),'# 原文\n\n「前半😀」\n\n「後半」');
  const context=await loadDirectorContext({workRoot,workId:'example',episodeId:'P01'});
  await rm(path.join(workRoot,scene.path));
  const first=await writeEmbeddedNamePlan({context,draft:direction(context.atoms.slice(0,1)),number:1,workRoot});
  const second=await writeEmbeddedNamePlan({context,draft:direction(context.atoms.slice(1)),number:2,workRoot});
  assert.match(first.filename,/name-001.json$/);assert.match(second.filename,/name-002.json$/);
  assert.equal(first.file.source.scenes[0].text,context.snapshot.scenes[0].text);
  assert.equal(first.file.source.referencesHash,undefined);assert.equal(first.file.source.settingsHash,undefined);
  await assert.rejects(writeEmbeddedNamePlan({context,draft:direction(context.atoms),number:1,workRoot}),/EEXIST/);
  await verifyNamePlan({workId:'example',episodeId:'P01',raw:first.file});
  await writeFile(path.join(root,'library.json'),JSON.stringify({works:[{id:'example',root:'works/example'}]}));
  const files=['works/example/manga/P01/name-001.json','works/example/manga/P01/name-002.json'];
  assert.equal((await validateChangedNamePlans(root,files)).length,2);
  await writeFile(first.filename,'{broken');
  assert.deepEqual(await validateChangedNamePlans(root,['works/example/manuscript/P01.md']),[]);
  assert.equal((await validateChangedNamePlans(root,[files[1]])).length,1);
  await assert.rejects(validateChangedNamePlans(root,[files[0]]));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('producer rejects invented primary atoms',async()=>{
 const context=await loadDirectorContext({workRoot:new URL('../templates/work/',import.meta.url).pathname,workId:'example',episodeId:'P01'});
 const draft=direction(context.atoms);draft.plan.coverage[0].atomId='invented';
 await assert.rejects(createEmbeddedNamePlan(context,draft,1));
});
