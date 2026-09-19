import { INVESTOR_LIFE_SOURCE_FORMAT, NOVEL_SOURCE_FORMAT } from '../library/ids.mjs';
import { LibraryValidationError, issue } from '../library/errors.mjs';
import {
  asRecords,
  checkSafeDeclaredPath,
  checkStableId,
  headingOk,
  requireObject,
} from './common.mjs';

/**
 * Read-only adapter for novel-template's novel-source/v1.
 * Chapter order and episode IDs are preserved.  The adapter never rewrites
 * stored files or invents new IDs.
 */
export function readNovelSource(manifest, files = null) {
  return readNovelSourceFormat(manifest, files, NOVEL_SOURCE_FORMAT);
}

/**
 * Read investor-life's existing source format without rewriting its manifest
 * format to novel-source/v1. The structure is compatible, but the adapter
 * remains explicit so a string replacement cannot masquerade as migration.
 */
export function readInvestorLifeSource(manifest, files = null) {
  return readNovelSourceFormat(manifest, files, INVESTOR_LIFE_SOURCE_FORMAT);
}

function readNovelSourceFormat(manifest, files, expectedFormat) {
  const issues = [];
  if (!requireObject(manifest, '$', ['format', 'work', 'chapters'], ['settings'], issues)) {
    throw new LibraryValidationError(issues);
  }
  if (manifest.format !== expectedFormat) {
    issue(issues, '$.format', 'UNSUPPORTED_FORMAT', `形式は${expectedFormat}である必要があります`);
  }
  if (!requireObject(manifest.work, '$.work', ['title'], ['slug', 'kicker', 'description'], issues)) {
    throw new LibraryValidationError(issues);
  }
  if (typeof manifest.work.title !== 'string' || !manifest.work.title.trim()) {
    issue(issues, '$.work.title', 'INVALID_TEXT', '作品タイトルが不正です');
  }

  const usedIds = new Set();
  const usedPaths = new Map();
  const chapters = asRecords(manifest.chapters, '$.chapters', issues);
  const episodes = [];
  const settings = [];

  chapters.forEach((chapter, chapterIndex) => {
    const chapterPath = `$.chapters[${chapterIndex}]`;
    if (!requireObject(chapter, chapterPath, ['id', 'title', 'episodes'], [], issues)) return;
    if (typeof chapter.title !== 'string' || !chapter.title.trim()) {
      issue(issues, `${chapterPath}.title`, 'INVALID_TEXT', '章タイトルが不正です');
    }
    checkStableId(chapter.id, `${chapterPath}.id`, issues, usedIds);
    const chapterEpisodes = asRecords(chapter.episodes, `${chapterPath}.episodes`, issues);
    chapterEpisodes.forEach((episode, episodeIndex) => {
      const episodePath = `${chapterPath}.episodes[${episodeIndex}]`;
      if (!requireObject(episode, episodePath, ['id', 'title', 'path'], [], issues)) return;
      if (typeof episode.title !== 'string' || !episode.title.trim()) {
        issue(issues, `${episodePath}.title`, 'INVALID_TEXT', '話タイトルが不正です');
      }
      if (!checkStableId(episode.id, `${episodePath}.id`, issues, usedIds)) return;
      const path = checkSafeDeclaredPath(episode.path, `${episodePath}.path`, issues, usedPaths);
      episodes.push({
        id: episode.id,
        title: episode.title,
        path,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndex: chapterIndex + 1,
        episodeIndex: episodeIndex + 1,
        readingOrder: episodes.length + 1,
      });
    });
  });

  asRecords(manifest.settings ?? [], '$.settings', issues).forEach((setting, index) => {
    const path = `$.settings[${index}]`;
    if (!requireObject(setting, path, ['id', 'path'], [], issues)) return;
    if (!checkStableId(setting.id, `${path}.id`, issues, usedIds)) return;
    settings.push({
      id: setting.id,
      path: checkSafeDeclaredPath(setting.path, `${path}.path`, issues, usedPaths),
    });
  });

  if (files) checkDeclaredFiles(files, [...usedPaths.keys()], episodes, settings, issues);
  if (issues.length) throw new LibraryValidationError(issues);

  return {
    format: expectedFormat,
    work: { ...manifest.work },
    chapters: chapters.map(chapter => ({
      id: chapter.id,
      title: chapter.title,
      episodeIds: (chapter.episodes ?? []).map(episode => episode.id),
    })),
    episodes,
    scenes: episodes.map(episode => ({
      id: episode.id,
      path: episode.path,
      episodeId: episode.id,
      chapterId: episode.chapterId,
    })),
    settings,
    characters: [],
    readingOrder: episodes.map(episode => episode.id),
  };
}

function checkDeclaredFiles(files, declared, episodes, settings, issues) {
  const actual = files instanceof Map ? files : new Map(Object.entries(files));
  for (const path of declared) {
    if (path && !actual.has(path)) issue(issues, path, 'MISSING_FILE', 'manifestで宣言されたファイルがありません');
  }
  for (const path of [...episodes.map(item => item.path), ...settings.map(item => item.path)]) {
    if (!path || !actual.has(path)) continue;
    const content = actual.get(path);
    if (typeof content === 'string' && !headingOk(content)) {
      issue(issues, path, 'MISSING_HEADING', '先頭行に「# タイトル」形式の見出しが必要です');
    }
  }
}
