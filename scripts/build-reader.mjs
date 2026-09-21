#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateCatalog} from '../contracts/library/catalog.mjs';
import {readManuscript} from '../contracts/adapters/read.mjs';
import {safeWorkRelativePath} from '../contracts/library/paths.mjs';
import {validatePublication} from '../contracts/library/publication.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

function readPublication(repoRoot, work) {
  const publicationPath = path.join(repoRoot, work.root, 'publication.yaml');
  let value;
  try {
    value = JSON.parse(fs.readFileSync(publicationPath, 'utf8'));
  } catch (error) {
    throw new Error('Invalid publication.yaml for ' + work.id + ': ' + error.message);
  }
  if (!value || value.workId !== work.id || !value.formats || typeof value.formats !== 'object') {
    throw new Error('Invalid publication.yaml for ' + work.id);
  }
  return validatePublication(value, {workId: work.id});
}

function selectEpisodeIds(repoRoot, work, source, mode) {
  const allEpisodeIds = new Set(source.episodes.map(episode => episode.id));
  if (mode === 'private') return allEpisodeIds;

  const publication = readPublication(repoRoot, work);
  const format = publication.formats.novel;
  if (!format || format.visibility !== 'public') return new Set();

  const visible = new Set();
  const entries = Array.isArray(format.episodes) ? format.episodes : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid publication episode for ' + work.id);
    const episodeId = entry.id;
    if (!allEpisodeIds.has(episodeId)) throw new Error('Unknown published episode ' + work.id + '/' + episodeId);
    const releaseAt = entry.releaseAt == null ? null : Date.parse(entry.releaseAt);
    if (releaseAt !== null && Number.isNaN(releaseAt)) throw new Error('Invalid releaseAt for ' + work.id + '/' + episodeId);
    if (entry.visibility === 'public' && entry.approved === true && entry.transferred === true
      && (releaseAt === null || releaseAt <= Date.now())) {
      visible.add(episodeId);
    }
  }
  return visible;
}

export function displaySceneId(scene) {
  if (scene?.displayNumber) return scene.displayNumber;
  const match = String(scene?.path || '').match(/(?:^|\/)p(\d+)\/p\d+-(\d+)\.md$/i);
  if (!match) return scene?.id ?? '';
  return `P${Number(match[1])}-${Number(match[2])}`;
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mangaHref(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('MANGA_URL must be an HTTPS work URL without credentials');
  }
  return url.href;
}

export function mangaLink(value) {
  const href = mangaHref(value);
  if (!href) return '';
  return `<a href="${escape(href)}" rel="noreferrer" class="text-sm underline">漫画版を読む ↗</a>`;
}

export function parseMangaUrls(value = {}) {
  if (!value) return {};
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('MANGA_URLS_JSON must be valid JSON');
    }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('MANGA_URLS_JSON must be an object keyed by workId');
  }
  const result = {};
  for (const [workId, url] of Object.entries(parsed)) {
    if (!WORK_ID_PATTERN.test(workId)) throw new Error(`Invalid workId in MANGA_URLS_JSON: ${workId}`);
    result[workId] = mangaHref(url);
  }
  return result;
}

export function emailSubscriptionMarkup(enabled = false) {
  if (!enabled) return '';
  return [
    '<section id="emailSubscribeCard" class="mt-12 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 font-gothic shadow-sm">',
    '  <h2 class="text-base font-semibold text-emerald-950">新しい話の更新通知</h2>',
    '  <p class="mt-2 text-sm leading-6 text-stone-700">公開された新しい話をメールでお知らせします。登録後に届く確認メールから購読を確定してください。</p>',
    '  <form id="emailSubscribeForm" class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">',
    '    <label class="grid gap-1.5 text-xs font-medium text-stone-700">作品',
    '      <select id="emailWorkSelect" class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"></select>',
    '    </label>',
    '    <label class="grid gap-1.5 text-xs font-medium text-stone-700">メールアドレス',
    '      <input id="emailSubscribeAddress" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200">',
    '    </label>',
    '    <button type="submit" class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">仮登録する</button>',
    '  </form>',
    '  <p id="emailSubscribeStatus" class="mt-3 text-xs leading-5 text-stone-600" aria-live="polite"></p>',
    '</section>',
  ].join('\n');
}

function buildWorkSnapshot(repoRoot, work, {mode = 'private'} = {}) {
  const root = fs.realpathSync(path.join(repoRoot, work.root));
  const readPath = relative => {
    safeWorkRelativePath(relative);
    const target = fs.realpathSync(path.join(root, relative));
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('File escapes work root');
    return target;
  };

  const entryPath = fs.existsSync(path.join(root, 'work.json')) ? 'work.json' : 'source/manifest.json';
  const manifest = JSON.parse(fs.readFileSync(readPath(entryPath), 'utf8'));
  const source = readManuscript(manifest);
  const visibleEpisodeIds = selectEpisodeIds(repoRoot, work, source, mode);
  const visibleEpisodes = source.episodes.filter(episode => visibleEpisodeIds.has(episode.id));
  const visibleScenes = source.scenes.filter(scene => visibleEpisodeIds.has(scene.episodeId ?? scene.id));
  const visibleSettings = mode === 'private' ? source.settings : [];
  const title = (relative, fallback) => fs.readFileSync(readPath(relative), 'utf8')
    .split(/\r?\n/, 1)[0]
    .replace(/^#+\s*/, '')
    .replace(/^［[^］]+］\s*/, '') || fallback;
  const scenes = visibleScenes.map(scene => ({...scene, title: title(scene.path, scene.id), displayId: displaySceneId(scene)}));
  const episodes = visibleEpisodes.map((episode, i) => ({
    ...episode,
    episodeNumber: i + 1,
    scene_ids: scenes.filter(scene => scene.episodeId === episode.id).map(scene => scene.id),
  }));
  const visibleSceneIds = new Set(visibleScenes.map(scene => scene.id));
  const sourceSections = Array.isArray(source.sections) && source.sections.length > 0
    ? source.sections
    : visibleEpisodes.map(episode => ({
        id: episode.id,
        title: episode.title,
        sceneIds: episode.sceneIds ?? episode.scenes?.map(scene => scene.id) ?? [episode.id],
      }));
  const sections = sourceSections.map(section => ({
    id: section.id,
    title: section.title,
    scene_ids: (section.sceneIds ?? []).filter(id => visibleSceneIds.has(id)),
  })).filter(section => section.scene_ids.length > 0);
  const settings = visibleSettings.map(setting => ({...setting, title: title(setting.path, setting.id)}));
  const historyPath = path.join(root, 'history/CHANGELOG.md');
  const catalog = {
    schema_version: 2,
    workId: work.id,
    work: source.work,
    episodes,
    sections,
    scenes,
    settings,
    characters: mode === 'private' ? source.characters : [],
    revisions: [],
    hasHistory: mode === 'private' && fs.existsSync(historyPath),
  };

  const files = new Set([...scenes, ...settings].map(item => item.path));
  // Include only images referenced by the selected manuscript/settings or declared characters.
  if (mode === 'private') for (const character of source.characters) if (character.image) files.add(character.image);
  for (const relative of [...files]) {
    if (!relative.endsWith('.md')) continue;
    const markdown = fs.readFileSync(readPath(relative), 'utf8');
    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|data:)/i.test(match[1])) continue;
      const asset = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      if (!asset.startsWith('assets/')) throw new Error('Image must stay in selected work assets');
      safeWorkRelativePath(asset);
      files.add(asset);
    }
  }
  if (catalog.hasHistory) files.add('history/CHANGELOG.md');
  const inputs = [...files].map(relative => [relative, readPath(relative)]);
  return {work, catalog, inputs};
}

// Private preview and gated production builds share one reader generator.
export function buildReader({
  repoRoot = ROOT,
  workId,
  privatePreview = false,
  published = false,
  mangaUrl = '',
  mangaUrls = {},
  outputDir = path.join(repoRoot, 'dist', 'reader'),
} = {}) {
  const mode = privatePreview ? 'private' : published ? 'published' : null;
  if (privatePreview && published) throw new Error('Conflicting reader build modes');
  if (!mode) throw new Error('Private snapshot requires --private; use --published for a gated production build');
  const library = validateCatalog(JSON.parse(fs.readFileSync(path.join(repoRoot, 'library.json'), 'utf8')));
  if (!library.works.length) throw new Error('No works are available in library.json');
  const requestedWork = workId ? library.works.find(item => item.id === workId) : null;
  if (workId && !requestedWork) throw new Error('Unknown workId');

  const normalizedMangaUrls = parseMangaUrls(mangaUrls);
  if (mangaUrl) normalizedMangaUrls[requestedWork?.id ?? library.works[0].id] = mangaHref(mangaUrl);
  const snapshots = library.works.map(work => buildWorkSnapshot(repoRoot, work, {mode}));
  const availableSnapshots = mode === 'published'
    ? snapshots.filter(snapshot => snapshot.catalog.episodes.length > 0)
    : snapshots;
  const defaultSnapshot = (requestedWork && availableSnapshots.find(snapshot => snapshot.work.id === requestedWork.id))
    ?? availableSnapshots[0];
  const libraryIndex = {
    schema_version: 1,
    defaultWorkId: defaultSnapshot?.work.id ?? null,
    works: availableSnapshots.map(({work, catalog}) => ({
      id: work.id,
      title: catalog.work.title || work.title,
      basePath: 'works/' + work.id,
      mangaUrl: normalizedMangaUrls[work.id] || '',
    })),
  };
  const html = fs.readFileSync(path.join(ROOT, 'reader/index.html'), 'utf8')
    .replaceAll('__WORK_TITLE__', escape(defaultSnapshot?.catalog.work.title || defaultSnapshot?.work.title || '小説ライブラリ'))
    .replace('__MANGA_LINK__', '<a id="mangaLink" href="#" target="_blank" rel="noreferrer" class="text-sm underline hidden"></a>')
    .replace('__EMAIL_SUBSCRIBE__', emailSubscriptionMarkup(mode === 'published' && availableSnapshots.length > 0));

  fs.rmSync(outputDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(outputDir, 'data'), {recursive: true});
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'data/library-index.json'), JSON.stringify(libraryIndex));
  fs.writeFileSync(path.join(outputDir, 'data/email-works.json'), JSON.stringify({
    schema_version: 1,
    published: mode === 'published',
    works: availableSnapshots.map(({work, catalog}) => ({
      id: work.id,
      title: catalog.work.title || work.title,
      episodes: catalog.episodes.map(episode => ({id: episode.id, title: episode.title})),
    })),
  }));
  fs.writeFileSync(path.join(outputDir, '_headers'), '/*\n  Cache-Control: private, no-store\n  X-Robots-Tag: noindex, nofollow\n');

  for (const {work, catalog, inputs} of availableSnapshots) {
    const dist = path.join(outputDir, 'works', work.id);
    fs.mkdirSync(path.join(dist, 'data'), {recursive: true});
    fs.writeFileSync(path.join(dist, 'data/reader-index.json'), JSON.stringify(catalog));
    for (const [relative, absolute] of inputs) {
      const target = path.join(dist, 'data', relative);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(absolute, target);
    }
  }

  return {
    dist: outputDir,
    catalog: defaultSnapshot?.catalog ?? null,
    catalogs: availableSnapshots.map(snapshot => snapshot.catalog),
    libraryIndex,
  };
}

export function resolveBuildMode(args, env = {}) {
  const privatePreview = args.includes('--private');
  const published = args.includes('--published');
  if (privatePreview && published) throw new Error('Conflicting reader build modes');
  const branch = env.WORKERS_CI_BRANCH;
  if (branch === 'main') {
    if (privatePreview) throw new Error('main cannot build private manuscripts');
    return {published: true};
  }
  if (branch === 'dev') {
    if (published) throw new Error('dev must use preview mode');
    return {privatePreview: true};
  }
  if (branch || env.WORKERS_CI) throw new Error('Only main and dev may build on Workers Builds');
  if (!privatePreview && !published) throw new Error('Local builds require --private or --published');
  return {privatePreview, published};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const workIdIndex = args.indexOf('--work-id');
  const workId = workIdIndex >= 0 ? args[workIdIndex + 1] : undefined;
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--work-id') {
        if (!WORK_ID_PATTERN.test(args[++i] || '')) throw new Error('Missing or invalid --work-id');
      } else if (!['--private', '--published'].includes(args[i])) throw new Error('Unknown option: ' + args[i]);
    }
    const mode = resolveBuildMode(args, process.env);
    const result = buildReader({
      workId,
      ...mode,
      mangaUrl: process.env.MANGA_URL || '',
      mangaUrls: process.env.MANGA_URLS_JSON || {},
    });
    console.log(`${mode.published ? 'Published' : 'Private'} reader built: ${result.dist}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
