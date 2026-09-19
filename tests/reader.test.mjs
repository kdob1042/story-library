import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReader, mangaLink, parseMangaUrls} from '../scripts/build-reader.mjs';
const root = new URL('..', import.meta.url).pathname;

test('private reader builds all works, preserves order, and isolates assets', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-reader-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  fs.cpSync(path.join(root, 'fixtures/works'), path.join(temp, 'works'), {recursive: true});
  const works = ['fixture-story', 'fixture-novel'].map(id => ({id, title:id, root:`works/${id}`, formats:['novel'], manuscriptFormat:id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1', readAdapters:[id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1'], authority:'library', origin:{repository:'fixture/source'}, importStatus:'verified'}));
  fs.writeFileSync(path.join(temp, 'library.json'), JSON.stringify({format:'story-library/v1', authorityUntil:'M8', works}));
  assert.throws(() => buildReader({repoRoot:temp, workId:'fixture-story'}), /Private snapshot/);
  const result = buildReader({
    repoRoot:temp,
    privatePreview:true,
    mangaUrls:{'fixture-novel':'https://manga.example/works/fixture-novel/?a=1&b=2'},
  });
  assert.deepEqual(result.catalog.episodes[0].scene_ids, ['P01-01', 'P01-02']);
  assert.deepEqual(result.libraryIndex.works.map(work => work.id), ['fixture-story', 'fixture-novel']);
  assert.equal(result.libraryIndex.defaultWorkId, 'fixture-story');
  assert.equal(result.libraryIndex.works[1].mangaUrl, 'https://manga.example/works/fixture-novel/?a=1&b=2');
  assert.ok(fs.existsSync(path.join(result.dist, 'index.html')));
  assert.ok(fs.existsSync(path.join(result.dist, 'data/library-index.json')));
  assert.ok(fs.existsSync(path.join(result.dist, 'works/fixture-story/data/reader-index.json')));
  assert.ok(fs.existsSync(path.join(result.dist, 'works/fixture-novel/data/reader-index.json')));
  assert.ok(!fs.existsSync(path.join(result.dist, 'works/fixture-story/data/source')));
  assert.ok(!fs.existsSync(path.join(result.dist, 'works/fixture-novel/data/source')));
  assert.match(fs.readFileSync(path.join(result.dist, 'index.html'), 'utf8'), /id="workSelect"/);
  assert.match(fs.readFileSync(path.join(result.dist, 'index.html'), 'utf8'), /data\/library-index\.json/);
  const selected = buildReader({repoRoot:temp, workId:'fixture-novel', privatePreview:true});
  assert.equal(selected.libraryIndex.defaultWorkId, 'fixture-novel');
  assert.ok(selected.catalog.episodes.every(ep => ep.scene_ids.length === 1));
});

test('manga links reject script, plaintext and credential URLs', () => {
  assert.equal(mangaLink(''), '');
  for (const url of ['javascript:alert(1)', 'http://example.test', 'https://user:pass@example.test']) assert.throws(() => mangaLink(url));
  assert.deepEqual(parseMangaUrls('{"fixture-story":"https://manga.example/story"}'), {"fixture-story":"https://manga.example/story"});
  assert.throws(() => parseMangaUrls('{not-json}'), /valid JSON/);
});
