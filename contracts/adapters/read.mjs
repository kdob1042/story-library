import { STORY_SOURCE_FORMAT } from '../library/ids.mjs';
import { LibraryValidationError, issue } from '../library/errors.mjs';
import { manifestToSourceModel, validateSourceTree } from '../story-source/validate.mjs';
import { readNovelSource } from './novel-source.mjs';
import { readSchemaLegacy } from './schema-legacy.mjs';

function detectFormat(manifest) {
  if (manifest?.format === STORY_SOURCE_FORMAT) return STORY_SOURCE_FORMAT;
  if (manifest?.format === 'novel-source/v1') return 'novel-source/v1';
  if (manifest?.schema_version === 1) return 'schema-1';
  if (manifest?.schema_version === 4) return 'schema-4';
  return manifest?.format ?? (manifest?.schema_version == null ? 'unknown' : `schema-${manifest.schema_version}`);
}

/**
 * Read a manuscript manifest without rewriting it.  story-source/v1 is the
 * canonical nested form; other formats are projected through read adapters
 * that keep fixed IDs and declared reading order.
 */
export function readManuscript(manifest, files = null, { expectedFormat = null } = {}) {
  const format = detectFormat(manifest);
  if (expectedFormat && format !== expectedFormat) {
    throw new LibraryValidationError([
      { path: '$.format', code: 'FORMAT_MISMATCH', message: `期待した形式 ${expectedFormat} と実際の ${format} が異なります` },
    ]);
  }

  if (format === STORY_SOURCE_FORMAT) {
    const tree = files ? validateSourceTree(manifest, files) : { manifest: manifestToSourceModel(manifest) };
    const model = files ? manifestToSourceModel(tree.manifest) : tree.manifest;
    return {
      format: STORY_SOURCE_FORMAT,
      work: model.work,
      episodes: model.episodes,
      scenes: model.scenes,
      settings: model.settings,
      characters: model.characters,
      readingOrder: model.scenes.map(scene => scene.id),
    };
  }

  if (format === 'novel-source/v1') return readNovelSource(manifest, files);
  if (format === 'schema-1' || format === 'schema-4') return readSchemaLegacy(manifest, files);

  const issues = [];
  issue(issues, '$.format', 'UNSUPPORTED_FORMAT', `原稿形式 ${format} は未対応です`);
  throw new LibraryValidationError(issues);
}

export { detectFormat };
