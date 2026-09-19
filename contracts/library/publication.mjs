import { VISIBILITIES, WORK_FORMATS, WORK_ID } from './ids.mjs';
import { LibraryValidationError, checkObject, issue, isObject } from './errors.mjs';

const EPISODE_REQUIRED = ['id'];
const EPISODE_OPTIONAL = ['releaseAt', 'visibility', 'approvedRevision'];

function parseJsonCompatibleYaml(text, path, issues) {
  if (typeof text !== 'string' || !text.trim()) {
    issue(issues, path, 'INVALID_PUBLICATION', 'publication.yamlが空です');
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) {
      issue(issues, path, 'INVALID_PUBLICATION', 'publication.yamlはJSON互換YAMLオブジェクトです');
      return null;
    }
    return parsed;
  } catch {
    issue(issues, path, 'INVALID_PUBLICATION', '初期契約のpublication.yamlはJSON互換YAMLのみ受け付けます');
    return null;
  }
}

function checkEpisode(episode, path, issues, used) {
  if (!checkObject(episode, path, EPISODE_REQUIRED, EPISODE_OPTIONAL, issues)) return;
  if (typeof episode.id !== 'string' || !episode.id.trim()) {
    issue(issues, `${path}.id`, 'INVALID_ID', '話IDが不正です');
  } else if (used.has(episode.id)) {
    issue(issues, `${path}.id`, 'DUPLICATE_ID', '公開設定の話IDが重複しています');
  } else {
    used.add(episode.id);
  }
  if (episode.visibility !== undefined && !VISIBILITIES.includes(episode.visibility)) {
    issue(issues, `${path}.visibility`, 'INVALID_VISIBILITY', '公開状態が不正です');
  }
  if (episode.releaseAt !== undefined && (typeof episode.releaseAt !== 'string' || Number.isNaN(Date.parse(episode.releaseAt)))) {
    issue(issues, `${path}.releaseAt`, 'INVALID_RELEASE_AT', 'releaseAtはタイムゾーン付き日時です');
  }
  if (episode.approvedRevision !== undefined && (typeof episode.approvedRevision !== 'string' || !episode.approvedRevision.trim())) {
    issue(issues, `${path}.approvedRevision`, 'INVALID_REVISION', 'approvedRevisionが不正です');
  }
}

export function validatePublication(input, { workId, text } = {}) {
  const issues = [];
  const publication = typeof text === 'string' ? parseJsonCompatibleYaml(text, '$', issues) : input;
  if (!publication) throw new LibraryValidationError(issues);
  if (!checkObject(publication, '$', ['workId', 'timezone', 'formats'], ['notes'], issues)) {
    throw new LibraryValidationError(issues);
  }
  if (!WORK_ID.test(publication.workId)) {
    issue(issues, '$.workId', 'INVALID_ID', 'workIdが不正です');
  }
  if (workId && publication.workId !== workId) {
    issue(issues, '$.workId', 'WORK_MISMATCH', 'publication.workIdがcatalogと一致しません');
  }
  if (publication.timezone !== 'Asia/Tokyo') {
    issue(issues, '$.timezone', 'INVALID_TIMEZONE', 'timezoneの標準は Asia/Tokyo です');
  }
  if (!isObject(publication.formats)) {
    issue(issues, '$.formats', 'OBJECT_REQUIRED', 'formatsはオブジェクトです');
  } else {
    for (const key of Object.keys(publication.formats)) {
      if (!WORK_FORMATS.includes(key)) issue(issues, `$.formats.${key}`, 'UNKNOWN_FIELD', '未知の形式です');
    }
    for (const format of WORK_FORMATS) {
      const record = publication.formats[format];
      const path = `$.formats.${format}`;
      if (!checkObject(record ?? {}, path, ['visibility'], ['episodes', 'visibilityNote'], issues) || !record) continue;
      if (!VISIBILITIES.includes(record.visibility)) {
        issue(issues, `${path}.visibility`, 'INVALID_VISIBILITY', '公開状態が不正です');
      }
      if (record.episodes !== undefined) {
        if (!Array.isArray(record.episodes)) {
          issue(issues, `${path}.episodes`, 'INVALID_EPISODES', 'episodesは配列です');
        } else {
          const used = new Set();
          record.episodes.forEach((episode, index) => checkEpisode(episode, `${path}.episodes[${index}]`, issues, used));
        }
      }
    }
  }
  if (issues.length) throw new LibraryValidationError(issues);
  return publication;
}

export function defaultPublication(workId) {
  return {
    workId,
    timezone: 'Asia/Tokyo',
    formats: {
      novel: { visibility: 'private', episodes: [] },
      manga: { visibility: 'private', episodes: [] },
    },
    notes: '初期状態は非公開。原稿の取り込みだけで公開範囲を変えない。',
  };
}
