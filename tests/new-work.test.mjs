import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNewWork, readTemplateTree } from '../contracts/library/new-work.mjs';
import { readManuscript } from '../contracts/adapters/read.mjs';
import { LibraryValidationError } from '../contracts/library/errors.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const catalog = JSON.parse(await readFile(join(repoRoot, 'library.json'), 'utf8'));
const sourceMap = JSON.parse(await readFile(join(repoRoot, 'migrations/source-map.json'), 'utf8'));

test('work template is a valid story-source/v1 tree', async () => {
  const files = await readTemplateTree();
  const manifest = JSON.parse(files.get('work.json'));
  const model = readManuscript(manifest, Object.fromEntries(
    [...files.entries()].filter(([path]) => path !== 'work.json' && path !== 'publication.yaml')
  ));
  assert.equal(model.format, 'story-source/v1');
  assert.deepEqual(model.readingOrder, ['P01-01']);
  assert.equal(model.characters.length, 0);
});

test('new-work copies the template, keeps IDs, and stays private', async () => {
  const libraryRoot = await mkdtemp(join(tmpdir(), 'story-library-new-'));
  await mkdir(join(libraryRoot, 'migrations'), { recursive: true });
  await writeFile(join(libraryRoot, 'library.json'), JSON.stringify(catalog, null, 2));
  await writeFile(join(libraryRoot, 'migrations/source-map.json'), JSON.stringify(sourceMap, null, 2));
  const result = await createNewWork({
    catalog,
    sourceMap,
    libraryRoot,
    workId: 'fixture-new',
    title: '新作フィクスチャ',
  });
  assert.equal(result.wrote, true);
  assert.equal(result.work.importStatus, 'imported');
  assert.equal(result.work.authority, 'origin');
  assert.equal(result.catalog.works.at(-1).origin.repository, 'kdob1042/story-library');
  assert.match(await readFile(join(libraryRoot, 'works/fixture-new/manuscript/p01/p01-01.md'), 'utf8'), /ここに本文を書きます/);
  const publication = JSON.parse(await readFile(join(libraryRoot, 'works/fixture-new/publication.yaml'), 'utf8'));
  assert.equal(publication.workId, 'fixture-new');
  assert.equal(publication.formats.novel.visibility, 'private');
  assert.deepEqual(result.sourceMap.entries.at(-1).ids.scene, { 'P01-01': 'P01-01' });
});

test('new-work refuses a duplicate or invalid workId', async () => {
  await assert.rejects(
    () => createNewWork({ catalog, sourceMap, libraryRoot: repoRoot, workId: 'kamiya-kawai', title: '重複' }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'DUPLICATE_ID')
  );
  await assert.rejects(
    () => createNewWork({ catalog, sourceMap, libraryRoot: repoRoot, workId: 'Kamiya', title: '不正' }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'INVALID_ID')
  );
});
