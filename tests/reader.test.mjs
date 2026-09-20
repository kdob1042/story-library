import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReader, displaySceneId, mangaLink, parseMangaUrls, resolveBuildMode} from '../scripts/build-reader.mjs';
const root = new URL('..', import.meta.url).pathname;


test('display scene IDs follow manuscript paths without changing stable IDs', () => {
  assert.equal(displaySceneId({id:'C01-E01', path:'manuscript/p01/p01-01.md'}), 'P1-1');
  assert.equal(displaySceneId({id:'C04-E13', path:'manuscript/p04/p04-04.md'}), 'P4-4');
  assert.equal(displaySceneId({id:'P01-01', path:'scenes/p01-01.md'}), 'P01-01');
  assert.equal(displaySceneId({id:'X', path:'manuscript/p01/p01-01.md', displayNumber:'P9-9'}), 'P9-9');
});

test('private reader builds all works, preserves order, and isolates assets', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'private-reader-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  fs.cpSync(path.join(root, 'fixtures/works'), path.join(temp, 'works'), {recursive: true});
  fs.writeFileSync(path.join(temp, 'works/fixture-story/market-data.json'), JSON.stringify({
    schemaVersion: 1,
    asOf: '2026-09-19',
    fx: {usdJpy: 156.9},
    items: [{
      id: 'fixture',
      name: 'Fixture',
      ticker: 'FIX',
      currentPrice: 100,
      currentCurrency: 'USD',
      convertedValueJpy: 123456,
    }],
  }));
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
  assert.equal(result.catalog.marketData.items[0].ticker, 'FIX');
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

  
test('published reader follows publication.yaml and omits private material', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'published-reader-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  fs.cpSync(path.join(root, 'fixtures/works'), path.join(temp, 'works'), {recursive: true});
  const works = [
    {id: 'fixture-story', title: 'fixture-story', root: 'works/fixture-story', formats: ['novel'], manuscriptFormat: 'story-source/v1', readAdapters: ['story-source/v1'], authority: 'library', origin: {repository: 'fixture/source'}, importStatus: 'verified'},
    {id: 'fixture-novel', title: 'fixture-novel', root: 'works/fixture-novel', formats: ['novel'], manuscriptFormat: 'novel-source/v1', readAdapters: ['novel-source/v1'], authority: 'library', origin: {repository: 'fixture/source'}, importStatus: 'verified'},
  ];
  fs.writeFileSync(path.join(temp, 'library.json'), JSON.stringify({format: 'story-library/v1', authorityUntil: 'M8', works}));
  fs.writeFileSync(path.join(temp, 'works/fixture-story/publication.yaml'), JSON.stringify({
    workId: 'fixture-story',
    timezone: 'Asia/Tokyo',
    formats: {
      manga: {visibility: 'private', episodes: []},
      novel: {
        visibility: 'public',
        episodes: [{id: 'P01', visibility: 'public', approved: true, transferred: true}],
      },
    },
  }));
  const result = buildReader({repoRoot: temp, published: true});
  assert.deepEqual(result.libraryIndex.works.map(work => work.id), ['fixture-story']);
  assert.equal(result.catalog.episodes.length, 1);
  assert.deepEqual(result.catalog.episodes[0].scene_ids, ['P01-01', 'P01-02']);
  assert.equal(result.catalog.settings.length, 0);
  assert.deepEqual(result.catalog.characters, []);
  assert.equal(result.catalog.hasHistory, false);
  assert.ok(!fs.existsSync(path.join(result.dist, 'works/fixture-novel')));
  const publicationPath = path.join(temp, 'works/fixture-story/publication.yaml');
  const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'));
  const episode = publication.formats.novel.episodes[0];
  for (const override of [
    {approved:false}, {transferred:false}, {visibility:'private'},
    {releaseAt:'2999-01-01T00:00:00+09:00'},
  ]) {
    publication.formats.novel.episodes = [{...episode, ...override}];
    fs.writeFileSync(publicationPath, JSON.stringify(publication));
    const empty = buildReader({repoRoot:temp, published:true});
    assert.deepEqual(empty.libraryIndex.works, []);
    assert.equal(empty.libraryIndex.defaultWorkId, null);
    assert.ok(!fs.existsSync(path.join(empty.dist, 'works')));
    assert.match(fs.readFileSync(path.join(empty.dist, 'index.html'), 'utf8'), /現在公開中の作品はありません/);
  }
  for (const override of [{approved:'true'}, {id:'missing'}, {releaseAt:'bad-date'}, {state:'published'}]) {
    publication.formats.novel.episodes = [{...episode, ...override}];
    fs.writeFileSync(publicationPath, JSON.stringify(publication));
    assert.throws(() => buildReader({repoRoot:temp, published:true}));
  }
});

test('Workers Builds selects modes and rejects contradictory or unknown branches', () => {
  assert.deepEqual(resolveBuildMode([], {WORKERS_CI_BRANCH:'main'}), {published:true});
  assert.deepEqual(resolveBuildMode([], {WORKERS_CI_BRANCH:'dev'}), {privatePreview:true});
  assert.throws(() => resolveBuildMode(['--private'], {WORKERS_CI_BRANCH:'main'}));
  assert.throws(() => resolveBuildMode(['--published'], {WORKERS_CI_BRANCH:'dev'}));
  assert.throws(() => resolveBuildMode([], {WORKERS_CI_BRANCH:'feature/test'}));
  assert.throws(() => resolveBuildMode(['--private'], {WORKERS_CI:'1'}));
  assert.throws(() => resolveBuildMode(['--private', '--published']));
  assert.throws(() => resolveBuildMode([]));
  assert.equal(resolveBuildMode(['--private']).privatePreview, true);
  assert.equal(resolveBuildMode(['--published']).published, true);
  assert.throws(() => buildReader({privatePreview:true, published:true}), /Conflicting/);
});
