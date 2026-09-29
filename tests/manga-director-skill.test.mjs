import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'skills/manga-director');
const read=name=>readFile(path.join(dir,name),'utf8');
test('AGENTS routes manga work to one chat-owned skill',async()=>{
 const agents=await readFile(path.join(root,'AGENTS.md'),'utf8');
 assert.match(agents,/skills\/manga-director\/SKILL\.md/);
 assert.match(agents,/@Manga Director/);
 const skill=await read('SKILL.md');
 assert.match(skill,/チャットAI自身が実行主体/);
 assert.match(skill,/最大3回/);
});
test('chat invocation has a short trigger and safe save boundary',async()=>{
 const skill=await read('SKILL.md');
 assert.match(skill,/@Manga Director <作品名またはworkId> <episodeId>/);
 assert.match(skill,/保存指定がなければGitHubは変更せず/);
 assert.match(skill,/単なる「ネーム化」はdirection_only/);
 assert.match(skill,/works\/<workId>\/manga\/<episodeId>\/episode\.json/);
});
test('all relative skill links resolve',async()=>{
 for(const name of ['SKILL.md','story-analysis.md','paneling.md','review.md','handoff.md']){
  const content=await read(name);
  for(const m of content.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)){
   if(m[1].startsWith('https:'))continue;
   await access(path.resolve(dir,m[1]));
  }
 }
});
test('planning, criticism and manuscript changes have separate boundaries',async()=>{
 assert.match(await read('paneling.md'),/workGoal → beat → panel → page/);
 assert.match(await read('review.md'),/direction_only/);
 assert.match(await read('review.md'),/script_change/);
 assert.match(await read('review.md'),/却下/);
 assert.match(await read('review.md'),/隠れた思考過程/);
});
test('handoff uses stable episode IDs and paired manuscript/plan without commit self-reference',async()=>{
 const handoff=await read('handoff.md');
 assert.match(handoff,/manga\/<episodeId>\/pages\/<pageId>\.json/);
 assert.match(handoff,/循環/);
 assert.match(handoff,/同じPR/);
 assert.match(handoff,/検証専用/);
 assert.match(handoff,/未検証/);
});
