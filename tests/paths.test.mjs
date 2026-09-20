import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinWorkPath, legacyManifestEntryPath, manifestEntryPath, safeWorkRelativePath } from '../contracts/library/paths.mjs';

test('manuscript paths resolve from the work root, not source/', () => {
  assert.equal(joinWorkPath('works/kamiya-kawai', 'manuscript/p01/p01-01.md'), 'works/kamiya-kawai/manuscript/p01/p01-01.md');
  assert.equal(manifestEntryPath('works/kamiya-kawai'), 'works/kamiya-kawai/work.json');
  assert.equal(legacyManifestEntryPath('works/kamiya-kawai'), 'works/kamiya-kawai/source/manifest.json');
  assert.equal(safeWorkRelativePath('work.json'), 'work.json');
});

test('work-root sandbox rejects traversal', () => {
  assert.throws(() => safeWorkRelativePath('../library.json'));
  assert.throws(() => safeWorkRelativePath('/etc/passwd'));
  assert.throws(() => safeWorkRelativePath('works/other/manuscript/a.md'.replace('works/other/', '../../')));
  assert.throws(() => joinWorkPath('works/not valid', 'manuscript/a.md'));
});
