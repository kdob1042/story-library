import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectFormat, readManuscript } from '../contracts/adapters/read.mjs';
import { LibraryValidationError } from '../contracts/library/errors.mjs';
import { readWorkFilesFromDisk, validateImportedWork } from '../contracts/library/validate.mjs';

const root = new URL('..', import.meta.url).pathname;

function storyWork() {
  return {
    id: 'fixture-story',
    root: 'fixtures/works/fixture-story',
    manuscriptFormat: 'story-source/v1',
    importStatus: 'imported',
  };
}

test('story-source/v1 fixture keeps scene IDs, order and character image', async () => {
  const files = await readWorkFilesFromDisk(root, 'fixtures/works/fixture-story');
  const result = await validateImportedWork(root, { ...storyWork(), root: 'works/fixture-story' }, files);
  assert.equal(result.manuscript.format, 'story-source/v1');
  assert.deepEqual(result.manuscript.readingOrder, ['P01-01', 'P01-02']);
  assert.equal(result.manuscript.characters[0].id, 'ref_a');
  assert.equal(result.manuscript.characters[0].image, 'assets/ref.png');
  assert.match(files.get('manuscript/p01/p01-01.md'), /人工フィクスチャの本文です/);
  assert.equal(result.publication.formats.novel.visibility, 'private');
});

test('novel-source/v1 fixture keeps chapter/episode IDs and reading order', async () => {
  const files = await readWorkFilesFromDisk(root, 'fixtures/works/fixture-novel');
  const manifest = JSON.parse(files.get('source/manifest.json'));
  const model = readManuscript(manifest, Object.fromEntries(
    [...files.entries()].filter(([path]) => path !== 'source/manifest.json' && path !== 'publication.yaml')
  ));
  assert.equal(model.format, 'novel-source/v1');
  assert.deepEqual(model.readingOrder, ['C01-E01', 'C01-E02']);
  assert.deepEqual(model.chapters[0].episodeIds, ['C01-E01', 'C01-E02']);
  assert.equal(files.get('manuscript/p01/p01-01.md'), await readFile(new URL('../fixtures/works/fixture-novel/manuscript/p01/p01-01.md', import.meta.url), 'utf8'));
});

test('schema 4 adapter keeps scene_ids order and does not invent IDs', () => {
  const manifest = {
    schema_version: 4,
    work: '旧作品',
    episodes: [{ id: 'P01', title: '第一話', scene_ids: ['S2', 'S1'] }],
    scenes: [
      { id: 'S1', path: 'manuscript/one.md' },
      { id: 'S2', path: 'manuscript/two.md' },
    ],
    settings: [{ id: 'VISUAL', path: 'settings/visual.md' }],
    references: { characters: [{ id: 'yu', name: '勇', image: 'assets/yu.png' }] },
  };
  const files = {
    'manuscript/one.md': '# 一\n本文1\n',
    'manuscript/two.md': '# 二\n本文2\n',
    'settings/visual.md': '# 視覚\n設定\n',
    'assets/yu.png': new Uint8Array([1, 2, 3]),
  };
  const model = readManuscript(manifest, files);
  assert.equal(detectFormat(manifest), 'schema-4');
  assert.deepEqual(model.readingOrder, ['S2', 'S1']);
  assert.equal(model.characters[0].id, 'yu');
  assert.equal(model.episodes[0].scenes[0].id, 'S2');
});

test('adapters do not mutate the stored manifest or body text', () => {
  const manifest = {
    format: 'novel-source/v1',
    work: { title: '保持' },
    chapters: [{ id: 'C01', title: '章', episodes: [{ id: 'C01-E01', title: '話', path: 'manuscript/a.md' }] }],
    settings: [],
  };
  const body = '# 見出し\n原文のまま\n';
  const files = { 'manuscript/a.md': body };
  const snapshot = structuredClone(manifest);
  readManuscript(manifest, files);
  assert.deepEqual(manifest, snapshot);
  assert.equal(files['manuscript/a.md'], body);
});

test('unsafe paths and unknown formats are rejected', () => {
  assert.throws(
    () => readManuscript({
      format: 'novel-source/v1',
      work: { title: 'x' },
      chapters: [{ id: 'C01', title: '章', episodes: [{ id: 'C01-E01', title: '話', path: '../secret.md' }] }],
    }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'INVALID_PATH')
  );
  assert.throws(
    () => readManuscript({ schema_version: 5, episodes: [], scenes: [] }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'UNSUPPORTED_FORMAT')
  );
});
