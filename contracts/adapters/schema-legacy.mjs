import { LibraryValidationError, issue } from '../library/errors.mjs';
import {
  asRecords,
  buildSections,
  checkSafeDeclaredPath,
  checkStableId,
  headingOk,
  requireObject,
} from './common.mjs';

/**
 * Read-only adapter for manga-mac schema 1/4 manifests.
 * Keeps episode IDs, scene IDs, scene_ids order, and declared paths.
 * Structured character declarations take precedence over schema-4 captions.
 */
export function readSchemaLegacy(manifest, files = null) {
  const issues = [];
  if (!requireObject(manifest, '$', ['schema_version', 'episodes', 'scenes'], ['work', 'settings', 'references'], issues)) {
    throw new LibraryValidationError(issues);
  }
  if (![1, 4].includes(manifest.schema_version)) {
    issue(issues, '$.schema_version', 'UNSUPPORTED_FORMAT', `原稿schema ${manifest.schema_version} は未対応です`);
  }

  const usedIds = new Set();
  const usedPaths = new Map();
  const scenes = [];
  const sceneById = new Map();

  asRecords(manifest.scenes, '$.scenes', issues).forEach((scene, index) => {
    const path = `$.scenes[${index}]`;
    if (!requireObject(scene, path, ['id', 'path'], ['tags', 'design_path'], issues)) return;
    if (!checkStableId(scene.id, `${path}.id`, issues, usedIds)) return;
    const declared = checkSafeDeclaredPath(scene.path, `${path}.path`, issues, usedPaths);
    if (scene.design_path) checkSafeDeclaredPath(scene.design_path, `${path}.design_path`, issues, usedPaths);
    const record = {
      id: scene.id,
      path: declared,
      ...(scene.tags === undefined ? {} : { tags: [...scene.tags] }),
    };
    scenes.push(record);
    sceneById.set(scene.id, record);
  });

  const episodes = [];
  asRecords(manifest.episodes, '$.episodes', issues).forEach((episode, index) => {
    const path = `$.episodes[${index}]`;
    if (!requireObject(episode, path, ['id', 'scene_ids'], ['title'], issues)) return;
    if (!checkStableId(episode.id, `${path}.id`, issues, usedIds)) return;
    if (!Array.isArray(episode.scene_ids) || new Set(episode.scene_ids).size !== episode.scene_ids.length) {
      issue(issues, `${path}.scene_ids`, 'INVALID_SCENES', '話の場面順が不正です');
      return;
    }
    episode.scene_ids.forEach((sceneId, sceneIndex) => {
      if (!sceneById.has(sceneId)) {
        issue(issues, `${path}.scene_ids[${sceneIndex}]`, 'UNKNOWN_SCENE', '話が未知の場面IDを参照しています');
      }
    });
    episodes.push({
      id: episode.id,
      title: episode.title ?? episode.id,
      sceneIds: [...episode.scene_ids],
    });
  });

  const settings = [];
  asRecords(manifest.settings ?? [], '$.settings', issues).forEach((setting, index) => {
    const path = `$.settings[${index}]`;
    if (!requireObject(setting, path, ['id', 'path'], [], issues)) return;
    if (!checkStableId(setting.id, `${path}.id`, issues, usedIds)) return;
    settings.push({
      id: setting.id,
      path: checkSafeDeclaredPath(setting.path, `${path}.path`, issues, usedPaths),
    });
  });

  const characters = readStructuredCharacters(manifest, issues, usedIds, usedPaths);

  if (files) checkDeclaredFiles(files, [...usedPaths.keys()], scenes, settings, issues);
  if (issues.length) throw new LibraryValidationError(issues);

  return {
    format: `schema-${manifest.schema_version}`,
    work: typeof manifest.work === 'string' ? { title: manifest.work } : { title: manifest.work?.title ?? '' },
    episodes: episodes.map(episode => ({
      ...episode,
      scenes: episode.sceneIds.map(id => sceneById.get(id)).filter(Boolean),
    })),
    sections: buildSections({episodes}),
    scenes: episodes.flatMap(episode => episode.sceneIds.map(id => ({ ...sceneById.get(id), episodeId: episode.id }))),
    settings,
    characters,
    readingOrder: episodes.flatMap(episode => episode.sceneIds),
    references: characters.filter(character => character.image).map(character => ({
      id: character.id,
      name: character.name,
      path: character.image,
    })),
  };
}

function readStructuredCharacters(manifest, issues, usedIds, usedPaths) {
  const declared = manifest.references?.characters;
  if (declared === undefined) return [];
  if (!Array.isArray(declared)) {
    issue(issues, '$.references.characters', 'INVALID_ARRAY', 'references.charactersは配列です');
    return [];
  }
  const names = new Set();
  return declared.map((item, index) => {
    const path = `$.references.characters[${index}]`;
    if (!requireObject(item, path, ['name', 'image'], ['id', 'description'], issues)) return null;
    const id = item.id ?? `name:${item.name}`;
    if (item.id) checkStableId(item.id, `${path}.id`, issues, usedIds);
    if (names.has(item.name)) issue(issues, `${path}.name`, 'DUPLICATE_ID', '参照画像の人物名が重複しています');
    else names.add(item.name);
    return {
      id,
      name: item.name,
      image: checkSafeDeclaredPath(item.image, `${path}.image`, issues, usedPaths),
      ...(item.description === undefined ? {} : { description: item.description }),
    };
  }).filter(Boolean);
}

function checkDeclaredFiles(files, declared, scenes, settings, issues) {
  const actual = files instanceof Map ? files : new Map(Object.entries(files));
  for (const path of declared) {
    if (path && !actual.has(path)) issue(issues, path, 'MISSING_FILE', 'manifestで宣言されたファイルがありません');
  }
  for (const path of [...scenes.map(item => item.path), ...settings.map(item => item.path)]) {
    if (!path || !actual.has(path)) continue;
    const content = actual.get(path);
    if (typeof content === 'string' && !headingOk(content)) {
      issue(issues, path, 'MISSING_HEADING', '先頭行に「# タイトル」形式の見出しが必要です');
    }
  }
}
