import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../contracts/library/catalog.mjs';
import { LibraryValidationError } from '../contracts/library/errors.mjs';
import { validateLibraryDocuments, validateRepository } from '../contracts/library/validate.mjs';
import { validateSourceMap } from '../contracts/library/source-map.mjs';

const catalog = JSON.parse(await readFile(new URL('../library.json', import.meta.url), 'utf8'));
const sourceMap = JSON.parse(await readFile(new URL('../migrations/source-map.json', import.meta.url), 'utf8'));

test('repository catalog and source-map keep origin as authority', async () => {
  const result = await validateRepository(new URL('..', import.meta.url).pathname);
  assert.equal(result.catalog.works.length, 2);
  assert.deepEqual(result.catalog.works.map(work => work.id), ['kamiya-kawai', 'investor-life']);
  assert.ok(result.catalog.works.every(work => work.authority === 'origin'));
  assert.ok(result.catalog.works.every(work => work.importStatus.startsWith('pending')));
  assert.equal(result.imported.length, 0);
  assert.equal(result.sourceMap.authority, 'origin');
});

test('catalog rejects a premature cutover to the library', () => {
  const next = structuredClone(catalog);
  next.works[0].authority = 'library';
  assert.throws(() => validateCatalog(next), error => (
    error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'PREMATURE_CUTOVER')
  ));
});

test('source-map rejects rewritten fixed IDs', () => {
  const next = structuredClone(sourceMap);
  next.entries[0].ids.episode = { P01: 'E01' };
  assert.throws(() => validateSourceMap(next), error => (
    error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'ID_REWRITTEN')
  ));
});

test('catalog and source-map origin repositories must match', async () => {
  const next = structuredClone(sourceMap);
  next.entries[0].origin.repository = 'other/repo';
  await assert.rejects(
    () => validateLibraryDocuments({ catalog, sourceMap: next }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'ORIGIN_MISMATCH')
  );
});
