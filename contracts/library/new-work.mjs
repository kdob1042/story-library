import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManuscript } from '../adapters/read.mjs';
import { validateCatalog } from './catalog.mjs';
import { LibraryValidationError } from './errors.mjs';
import { WORK_ID } from './ids.mjs';
import { defaultPublication, validatePublication } from './publication.mjs';
import { validateSourceMap } from './source-map.mjs';

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../templates/work');

export async function readTemplateTree(templateRoot = TEMPLATE_ROOT) {
  const { readdir } = await import('node:fs/promises');
  const files = new Map();
  async function walk(relative) {
    const dirents = await readdir(join(templateRoot, relative), { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name === '.gitkeep') continue;
      const next = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) await walk(next);
      else files.set(next, await readFile(join(templateRoot, next), 'utf8'));
    }
  }
  await walk('');
  return files;
}

export function applyTemplate(files, { workId, title }) {
  const next = new Map();
  for (const [path, content] of files) {
    let text = content.replaceAll('WORK_ID', workId);
    if (path === 'work.json') {
      const manifest = JSON.parse(text);
      manifest.work.title = title;
      text = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    if (path === 'publication.yaml') {
      const publication = defaultPublication(workId);
      publication.notes = '初期状態は非公開。フォルダ作成やcatalog登録だけでは公開しない。';
      validatePublication(publication, { workId });
      text = `${JSON.stringify(publication, null, 2)}\n`;
    }
    next.set(path, text);
  }
  return next;
}

export async function planNewWork({ catalog, sourceMap, workId, title }) {
  if (!WORK_ID.test(workId)) {
    throw new LibraryValidationError([{ path: 'workId', code: 'INVALID_ID', message: 'workIdは英小文字・数字・ハイフンです' }]);
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 200) {
    throw new LibraryValidationError([{ path: 'title', code: 'INVALID_TEXT', message: '作品タイトルが不正です' }]);
  }
  const normalized = validateCatalog(catalog);
  if (normalized.works.some(work => work.id === workId)) {
    throw new LibraryValidationError([{ path: workId, code: 'DUPLICATE_ID', message: '同じworkIdがcatalogにあります' }]);
  }
  const files = applyTemplate(await readTemplateTree(), { workId, title });
  const manifest = JSON.parse(files.get('work.json'));
  const model = readManuscript(manifest, Object.fromEntries(
    [...files.entries()].filter(([path]) => path !== 'work.json' && path !== 'publication.yaml')
  ), { expectedFormat: 'story-source/v1' });
  const work = {
    id: workId,
    title,
    root: `works/${workId}`,
    formats: ['novel', 'manga'],
    manuscriptFormat: 'story-source/v1',
    readAdapters: ['story-source/v1'],
    authority: 'origin',
    origin: {
      repository: 'kdob1042/story-library',
      ref: 'main',
      manifestPath: `works/${workId}/work.json`,
      accessible: true,
    },
    importStatus: 'imported',
    notes: 'story-library の雛形から作成。旧repoからの移行ではない。初期非公開。',
  };
  const nextCatalog = structuredClone(catalog);
  nextCatalog.works.push(work);
  const nextMap = structuredClone(sourceMap);
  nextMap.entries.push({
    workId,
    status: 'copied',
    origin: { repository: 'kdob1042/story-library', ref: 'main', path: `templates/work` },
    target: { root: `works/${workId}`, path: '.' },
    ids: {
      episode: Object.fromEntries(model.episodes.map(item => [item.id, item.id])),
      scene: Object.fromEntries(model.scenes.map(item => [item.id, item.id])),
      setting: Object.fromEntries(model.settings.map(item => [item.id, item.id])),
      character: {},
      chapter: {},
    },
    notes: '新作。旧原稿repoの削除や公開範囲変更を伴わない。',
  });
  validateCatalog(nextCatalog);
  validateSourceMap(nextMap, { catalogWorkIds: new Set(nextCatalog.works.map(item => item.id)) });
  return { work, files, model, catalog: nextCatalog, sourceMap: nextMap };
}

export async function createNewWork(options) {
  const plan = await planNewWork(options);
  if (options.dryRun) return { ...plan, wrote: false };
  const target = join(options.libraryRoot, plan.work.root);
  for (const [path, content] of plan.files) {
    const dest = join(target, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content);
  }
  await mkdir(join(target, 'assets'), { recursive: true });
  if (options.writeCatalog !== false) {
    await writeFile(join(options.libraryRoot, 'library.json'), `${JSON.stringify(plan.catalog, null, 2)}\n`);
    await writeFile(join(options.libraryRoot, 'migrations/source-map.json'), `${JSON.stringify(plan.sourceMap, null, 2)}\n`);
  }
  return { ...plan, wrote: true };
}
