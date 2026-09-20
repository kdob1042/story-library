import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importWork, isImportableOriginPath, mapOriginPath, planImportLayout } from '../contracts/library/import-work.mjs';
import { LibraryValidationError } from '../contracts/library/errors.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const catalog = JSON.parse(await readFile(join(repoRoot, 'library.json'), 'utf8'));
const sourceMap = JSON.parse(await readFile(join(repoRoot, 'migrations/source-map.json'), 'utf8'));

// Import fixtures explicitly represent the pre-cutover state.
catalog.works.forEach(work => { work.authority = 'origin'; work.importStatus = 'pending-import'; });
catalog.works[0].manuscriptFormat = 'schema-4';
sourceMap.authority = 'origin';

test('nested source/ trees flatten so paths resolve from the work root', () => {
  const layout = planImportLayout(['source/manifest.json', 'source/manuscript/p01/p01-01.md']);
  assert.equal(layout.flattenSourceTree, true);
  assert.equal(mapOriginPath('source/manuscript/p01/p01-01.md', layout), 'manuscript/p01/p01-01.md');
  assert.equal(mapOriginPath('source/manifest.json', layout), 'work.json');
  assert.equal(mapOriginPath('source/archive/old.md', layout), 'history/archive/old.md');
  assert.equal(isImportableOriginPath('source/manuscript/p01/p01-01.md', layout), true);
  assert.equal(isImportableOriginPath('source/src/reader.js', layout), false);
});

async function seedLibrary() {
  const root = await mkdtemp(join(tmpdir(), 'story-library-import-'));
  await mkdir(join(root, 'migrations'), { recursive: true });
  await writeFile(join(root, 'library.json'), JSON.stringify(catalog, null, 2));
  await writeFile(join(root, 'migrations/source-map.json'), JSON.stringify(sourceMap, null, 2));
  return root;
}

async function seedSchemaOrigin() {
  const origin = await mkdtemp(join(tmpdir(), 'origin-schema-'));
  const manifest = {
    schema_version: 4,
    work: '神谷と河合',
    episodes: [{ id: 'P01', title: '第一話', scene_ids: ['S01'] }],
    scenes: [{ id: 'S01', path: 'manuscript/p01.md' }],
    settings: [{ id: 'VISUAL', path: 'settings/visual.md' }],
    references: { characters: [{ id: 'yu', name: '勇', image: 'assets/yu.png' }] },
  };
  await mkdir(join(origin, 'manuscript'), { recursive: true });
  await mkdir(join(origin, 'settings'), { recursive: true });
  await mkdir(join(origin, 'assets'), { recursive: true });
  await writeFile(join(origin, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(origin, 'manuscript/p01.md'), '# 場面\n原文のまま\n');
  await writeFile(join(origin, 'settings/visual.md'), '# 視覚\n設定\n');
  await writeFile(join(origin, 'assets/yu.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(origin, 'package.json'), '{"name":"should-skip"}');
  await writeFile(join(origin, 'INDEX.md'), '# 索引\n');
  await mkdir(join(origin, 'src'), { recursive: true });
  await writeFile(join(origin, 'src/reader.js'), 'should not be copied');
  return { origin, body: '# 場面\n原文のまま\n' };
}

test('import copies bytes, keeps fixed IDs, and leaves origin as authority', async () => {
  const libraryRoot = await seedLibrary();
  const { origin, body } = await seedSchemaOrigin();
  const originBefore = await readFile(join(origin, 'manuscript/p01.md'), 'utf8');
  const result = await importWork({
    catalog,
    sourceMap,
    libraryRoot,
    workId: 'kamiya-kawai',
    originRoot: origin,
    originRepository: 'kdob1042/Kamiya-Kawai',
    originRef: 'main',
    commit: '5621918052faf05fc0bac245ad70d6c4f7ca1561',
  });
  assert.equal(result.wrote, true);
  assert.deepEqual(result.model.readingOrder, ['S01']);
  assert.equal(result.model.characters[0].id, 'yu');
  assert.equal(result.catalog.works[0].authority, 'origin');
  assert.equal(result.catalog.works[0].importStatus, 'imported');
  assert.equal(result.sourceMap.entries[0].ids.scene.S01, 'S01');
  assert.equal(await readFile(join(libraryRoot, 'works/kamiya-kawai/manuscript/p01.md'), 'utf8'), body);
  assert.equal(await readFile(join(origin, 'manuscript/p01.md'), 'utf8'), originBefore);
  const copiedCatalog = JSON.parse(await readFile(join(libraryRoot, 'library.json'), 'utf8'));
  assert.equal(copiedCatalog.works[0].authority, 'origin');
  assert.ok(!(await existsIgnore(join(libraryRoot, 'works/kamiya-kawai/package.json'))));
  assert.ok(!(await existsIgnore(join(libraryRoot, 'works/kamiya-kawai/INDEX.md'))));
  assert.ok(!(await existsIgnore(join(libraryRoot, 'works/kamiya-kawai/src/reader.js'))));
});

test('import refuses to rewrite IDs or run without an explicit replace', async () => {
  const libraryRoot = await seedLibrary();
  const { origin } = await seedSchemaOrigin();
  await importWork({
    catalog,
    sourceMap,
    libraryRoot,
    workId: 'kamiya-kawai',
    originRoot: origin,
    commit: '5621918052faf05fc0bac245ad70d6c4f7ca1561',
  });
  const importedCatalog = JSON.parse(await readFile(join(libraryRoot, 'library.json'), 'utf8'));
  const importedMap = JSON.parse(await readFile(join(libraryRoot, 'migrations/source-map.json'), 'utf8'));
  await assert.rejects(
    () => importWork({
      catalog: importedCatalog,
      sourceMap: importedMap,
      libraryRoot,
      workId: 'kamiya-kawai',
      originRoot: origin,
    }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'TARGET_EXISTS')
  );
});

test('dry-run does not write the work tree', async () => {
  const libraryRoot = await seedLibrary();
  const { origin } = await seedSchemaOrigin();
  const result = await importWork({
    catalog,
    sourceMap,
    libraryRoot,
    workId: 'kamiya-kawai',
    originRoot: origin,
    dryRun: true,
  });
  assert.equal(result.wrote, false);
  await assert.rejects(() => readFile(join(libraryRoot, 'works/kamiya-kawai/work.json')));
});

async function existsIgnore(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

