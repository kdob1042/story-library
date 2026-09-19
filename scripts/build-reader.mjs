#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateCatalog} from '../contracts/library/catalog.mjs';
import {readManuscript} from '../contracts/adapters/read.mjs';
import {safeWorkRelativePath} from '../contracts/library/paths.mjs';

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
  return value;
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
    const episodeId = entry.episodeId ?? entry.id;
    if (!allEpisodeIds.has(episodeId)) throw new Error('Unknown published episode ' + work.id + '/' + episodeId);
    const releaseAt = entry.releaseAt == null ? null : Date.parse(entry.releaseAt);
    if (releaseAt !== null && Number.isNaN(releaseAt)) throw new Error('Invalid releaseAt for ' + work.id + '/' + episodeId);
    const state = entry.state ?? (entry.published === true ? 'published' : 'draft');
    if (state === 'published' && entry.approved === true && entry.transferred === true
      && (releaseAt === null || releaseAt <= Date.now())) {
      visible.add(episodeId);
    }
  }
  return visible;
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

function buildWorkSnapshot(repoRoot, work, {mode = 'private'} = {}) {
  const root = fs.realpathSync(path.join(repoRoot, work.root));
  const readPath = relative => {
    safeWorkRelativePath(relative);
    const target = fs.realpathSync(path.join(root, relative));
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('File escapes work root');
    return target;
  };

  const manifest = JSON.parse(fs.readFileSync(readPath('source/manifest.json'), 'utf8'));
  const source = readManuscript(manifest);
  const visibleEpisodeIds = selectEpisodeIds(repoRoot, work, source, mode);
  const visibleEpisodes = source.episodes.filter(episode => visibleEpisodeIds.has(episode.id));
  const visibleScenes = source.scenes.filter(scene => visibleEpisodeIds.has(scene.episodeId ?? scene.id));
  const visibleSettings = mode === 'private' ? source.settings : [];
  const title = (relative, fallback) => fs.readFileSync(readPath(relative), 'utf8')
    .split(/\r?\n/, 1)[0]
    .replace(/^#+\s*/, '')
    .replace(/^［[^］]+］\s*/, '') || fallback;
  const scenes = visibleScenes.map(scene => ({...scene, title: title(scene.path, scene.id)}));
  const episodes = visibleEpisodes.map((episode, i) => ({
    ...episode,
    episodeNumber: i + 1,
    scene_ids: scenes.filter(scene => scene.episodeId === episode.id).map(scene => scene.id),
  }));
  const settings = visibleSettings.map(setting => ({...setting, title: title(setting.path, setting.id)}));
  const historyPath = path.join(root, 'history/CHANGELOG.md');
  const catalog = {
    schema_version: 2,
    workId: work.id,
    work: source.work,
    episodes,
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
  if (!availableSnapshots.length) throw new Error('No published reader episodes are available');
  const defaultSnapshot = (requestedWork && availableSnapshots.find(snapshot => snapshot.work.id === requestedWork.id))
    ?? availableSnapshots[0];
  const libraryIndex = {
    schema_version: 1,
    defaultWorkId: defaultSnapshot.work.id,
    works: availableSnapshots.map(({work, catalog}) => ({
      id: work.id,
      title: catalog.work.title || work.title,
      basePath: 'works/' + work.id,
      mangaUrl: normalizedMangaUrls[work.id] || '',
    })),
  };
  const html = fs.readFileSync(path.join(ROOT, 'reader/index.html'), 'utf8')
    .replaceAll('__WORK_TITLE__', escape(defaultSnapshot.catalog.work.title || defaultSnapshot.work.title))
    .replace('__MANGA_LINK__', '<a id="mangaLink" href="#" target="_blank" rel="noreferrer" class="text-sm underline hidden"></a>');

  fs.rmSync(outputDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(outputDir, 'data'), {recursive: true});
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'data/library-index.json'), JSON.stringify(libraryIndex));
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
    catalog: defaultSnapshot.catalog,
    catalogs: availableSnapshots.map(snapshot => snapshot.catalog),
    libraryIndex,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const workIdIndex = args.indexOf('--work-id');
  const workId = workIdIndex >= 0 ? args[workIdIndex + 1] : undefined;
  try {
    const result = buildReader({
      workId,
      privatePreview: args.includes('--private'),
      published: args.includes('--published'),
      mangaUrl: process.env.MANGA_URL || '',
      mangaUrls: process.env.MANGA_URLS_JSON || {},
    });
    console.log(`${args.includes('--published') ? 'Published' : 'Private'} reader built: ${result.dist}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
