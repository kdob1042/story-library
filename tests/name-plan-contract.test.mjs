import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'contracts/name-plan');
const gitBlobSha=content=>createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`)
  .update(content)
  .digest('hex');

test('vendored name-plan contract is byte-identical to its pinned manga-mac source',async()=>{
  const lock=JSON.parse(await readFile(path.join(dir,'lock.json'),'utf8'));
  assert.equal(lock.format,'manga-mac/name-plan/v2');
  assert.match(lock.commit,/^[0-9a-f]{40}$/);
  for(const [name,expected] of Object.entries(lock.files)){
    const content=await readFile(path.join(dir,name));
    assert.equal(gitBlobSha(content),expected,name);
  }
});

test('Manga Director handoff resolves the local machine contract without manga-mac runtime',async()=>{
  const handoff=await readFile(path.join(root,'skills/manga-director/handoff.md'),'utf8');
  assert.match(handoff,/contracts\/name-plan\/schema\.mjs/);
  assert.match(handoff,/manga-macアプリへ往復させない/);
  const schema=await import('../contracts/name-plan/schema.mjs');
  assert.equal(schema.FORMAT,'manga-mac/name-plan/v2');
  assert.equal(schema.fileSchema.properties.stage.const,'name-only');
});
