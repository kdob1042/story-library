import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReader, mangaLink} from '../scripts/build-reader.mjs';
const root = new URL('..', import.meta.url).pathname;

test('private reader preserves fixture order and isolates works; optional manga link is escaped', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-reader-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  fs.cpSync(path.join(root, 'fixtures/works'), path.join(temp, 'works'), {recursive: true});
  const works = ['fixture-story', 'fixture-novel'].map(id => ({id, title:id, root:`works/${id}`, formats:['novel'], manuscriptFormat:id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1', readAdapters:[id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1'], authority:'library', origin:{repository:'fixture/source'}, importStatus:'verified'}));
  fs.writeFileSync(path.join(temp, 'library.json'), JSON.stringify({format:'story-library/v1', authorityUntil:'M8', works}));
  assert.throws(() => buildReader({repoRoot:temp, workId:'fixture-story'}), /Private snapshot/);
  const a = buildReader({repoRoot:temp, workId:'fixture-story', privatePreview:true});
  assert.deepEqual(a.catalog.episodes[0].scene_ids, ['P01-01', 'P01-02']);
  assert.ok(!fs.readFileSync(path.join(a.dist, 'index.html'), 'utf8').includes('漫画版を読む'));
  assert.ok(!fs.existsSync(path.join(a.dist, 'data/source')));
  assert.ok(!fs.existsSync(path.join(a.dist, 'works')));
  const b = buildReader({repoRoot:temp, workId:'fixture-novel', privatePreview:true, mangaUrl:'https://manga.example/works/fixture-novel/?a=1&b=2'});
  assert.ok(b.catalog.episodes.every(ep => ep.scene_ids.length === 1));
  assert.match(fs.readFileSync(path.join(b.dist, 'index.html'), 'utf8'), /a=1&amp;b=2/);
  assert.ok(fs.existsSync(path.join(a.dist, 'index.html')));
});

test('manga links reject script, plaintext and credential URLs', () => {
  assert.equal(mangaLink(''), '');
  for (const url of ['javascript:alert(1)', 'http://example.test', 'https://user:pass@example.test']) assert.throws(() => mangaLink(url));
});
