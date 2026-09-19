import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPublication, validatePublication } from '../contracts/library/publication.mjs';
import { LibraryValidationError } from '../contracts/library/errors.mjs';

test('default publication is private for both formats', () => {
  const publication = validatePublication(defaultPublication('kamiya-kawai'), { workId: 'kamiya-kawai' });
  assert.equal(publication.formats.novel.visibility, 'private');
  assert.equal(publication.formats.manga.visibility, 'private');
});

test('publication workId must match the catalog work', () => {
  assert.throws(
    () => validatePublication(defaultPublication('other-work'), { workId: 'kamiya-kawai' }),
    error => error instanceof LibraryValidationError && error.issues.some(issue => issue.code === 'WORK_MISMATCH')
  );
});
