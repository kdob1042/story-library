import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {FORMAT,POLICY_VERSION} from '../contracts/name-plan/schema.mjs';
import {sourceDescriptor} from '../contracts/name-plan/source.mjs';
import {loadDirectorContext,verifyNamePlan} from '../skills/manga-director/machine.mjs';

const workRoot=fileURLToPath(new URL('../templates/work/',import.meta.url));

test('app-free Manga Director machine path builds the exact source contract and validates a plan',async()=>{
  const context=await loadDirectorContext({workRoot,workId:'template-work',episodeId:'P01',repo:'kdob1042/story-library',branch:'dev'});
  const atoms=context.atoms;
  const panels=atoms.map((atom,index)=>({
    id:`p${index+1}`,atomIds:[atom.id],contextAtomIds:[],beatIds:['b1'],characterIds:[],
    role:'standard',shot:'medium',shotIntent:'原稿の場面を描く',prompt:'No text. Follow the source scene.',
    silentReason:'',protect:['本文の意味'],gaze:'neutral',
  }));
  const tree=panels.length===1?{type:'leaf',panelId:panels[0].id}:{type:'row',children:panels.map(panel=>({type:'leaf',panelId:panel.id})),weights:panels.map(()=>1)};
  const plan={
    workGoal:{readerQuestion:'何が起きるか',emotionalArc:['導入'],payoff:'場面を理解する'},
    coverage:atoms.map(atom=>({atomId:atom.id,presentation:atom.kind==='dialogue'?'dialogue':atom.kind==='reference'?'reference':'visual',reason:'原文を保持'})),
    beats:[{id:'b1',atomIds:atoms.map(atom=>atom.id),function:'setup',tempo:'normal',readerBefore:'未読',readerAfter:'場面を理解'}],
    panels,
    pages:[{id:'page1',purpose:'導入',entryBeatId:'b1',exit:{kind:'pause',note:'次へ',payoffBeatIds:[]},tree}],
  };
  const file={
    format:FORMAT,title:'fixture',stage:'name-only',readingDirection:'rtl',
    source:await sourceDescriptor(context.project,context.snapshot,atoms),
    policyVersion:POLICY_VERSION,provenance:{producer:'fixture',model:'',editedBy:[]},plan,
  };
  delete file.source.commit;
  const result=await verifyNamePlan({workRoot,workId:'template-work',episodeId:'P01',raw:file});
  assert.equal(result.panels,panels.length);
  assert.equal(result.pages,1);
  assert.deepEqual(result.characters,[]);
});

test('app-free verification rejects a different work and invented character',async()=>{
  const context=await loadDirectorContext({workRoot,workId:'template-work',episodeId:'P01'});
  const atoms=context.atoms;
  const atom=atoms[0];
  const plan={
    workGoal:{readerQuestion:'x',emotionalArc:['x'],payoff:'x'},
    coverage:atoms.map(value=>({atomId:value.id,presentation:'visual',reason:'x'})),
    beats:[{id:'b1',atomIds:atoms.map(value=>value.id),function:'setup',tempo:'normal',readerBefore:'x',readerAfter:'x'}],
    panels:[{id:'p1',atomIds:atoms.map(value=>value.id),contextAtomIds:[],beatIds:['b1'],characterIds:['invented'],role:'standard',shot:'medium',shotIntent:'x',prompt:'x',silentReason:'',protect:[],gaze:'neutral'}],
    pages:[{id:'page1',purpose:'x',entryBeatId:'b1',exit:{kind:'pause',note:'x',payoffBeatIds:[]},tree:{type:'leaf',panelId:'p1'}}],
  };
  const file={format:FORMAT,title:'x',stage:'name-only',readingDirection:'rtl',source:await sourceDescriptor(context.project,context.snapshot,atoms),policyVersion:POLICY_VERSION,provenance:{producer:'fixture',model:'',editedBy:[]},plan};
  await assert.rejects(()=>verifyNamePlan({workRoot,workId:'template-work',episodeId:'P01',raw:{...file,source:{...file.source,workId:'other'}}}),/workId/);
  await assert.rejects(()=>verifyNamePlan({workRoot,workId:'template-work',episodeId:'P01',raw:file}),/人物|未登録/);
  assert.ok(atom);
});
