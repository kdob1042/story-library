#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateCatalog} from '../contracts/library/catalog.mjs';
import {readManuscript} from '../contracts/adapters/read.mjs';
import {safeWorkRelativePath} from '../contracts/library/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mangaLink(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('MANGA_URL must be an HTTPS work URL without credentials');
  return `<a href="${escape(url.href)}" rel="noreferrer" class="text-sm underline">漫画版を読む ↗</a>`;
}

// This is a private preview snapshot, not the public publication pipeline.
export function buildReader({repoRoot = ROOT, workId, privatePreview = false, mangaUrl = ''} = {}) {
  if (!privatePreview) throw new Error('Private snapshot only: specify --private; keep output behind existing Access');
  const library = validateCatalog(JSON.parse(fs.readFileSync(path.join(repoRoot, 'library.json'), 'utf8')));
  const work = library.works.find(item => item.id === workId);
  if (!work) throw new Error('Unknown workId');
  const root = fs.realpathSync(path.join(repoRoot, work.root));
  const readPath = relative => {
    safeWorkRelativePath(relative);
    const target = fs.realpathSync(path.join(root, relative));
    if (!target.startsWith(root + path.sep)) throw new Error('File escapes work root');
    return target;
  };
  const manifest = JSON.parse(fs.readFileSync(readPath('source/manifest.json'), 'utf8'));
  const source = readManuscript(manifest);
  const title = (relative, fallback) => fs.readFileSync(readPath(relative), 'utf8').split(/\r?\n/, 1)[0].replace(/^#+\s*/, '').replace(/^［[^］]+］\s*/, '') || fallback;
  const scenes = source.scenes.map(scene => ({...scene, title: title(scene.path, scene.id)}));
  const episodes = source.episodes.map((episode, i) => ({...episode, episodeNumber: i + 1, scene_ids: scenes.filter(scene => scene.episodeId === episode.id).map(scene => scene.id)}));
  const settings = source.settings.map(setting => ({...setting, title: title(setting.path, setting.id)}));
  const catalog = {schema_version: 2, workId, work: source.work, episodes, scenes, settings, characters: source.characters, revisions: []};
  const files = new Set([...scenes, ...settings].map(item => item.path));
  // Include only images referenced by the selected manuscript/settings or declared characters.
  for (const character of source.characters) if (character.image) files.add(character.image);
  for (const relative of [...files]) {
    if (!relative.endsWith('.md')) continue;
    const markdown = fs.readFileSync(readPath(relative), 'utf8');
    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:/i.test(match[1])) continue;
      const asset = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      if (!asset.startsWith('assets/')) throw new Error('Image must stay in selected work assets');
      files.add(asset);
    }
  }
  if (fs.existsSync(path.join(root, 'history/CHANGELOG.md'))) files.add('history/CHANGELOG.md');
  const inputs = [...files].map(relative => [relative, readPath(relative)]);
  const html = fs.readFileSync(path.join(ROOT, 'reader/index.html'), 'utf8')
    .replaceAll('__WORK_TITLE__', escape(source.work.title || work.title))
    .replace('__MANGA_LINK__', mangaLink(mangaUrl));
  const dist = path.join(repoRoot, 'dist', 'reader', workId);
  fs.rmSync(dist, {recursive: true, force: true});
  fs.mkdirSync(path.join(dist, 'data'), {recursive: true});
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, 'data/reader-index.json'), JSON.stringify(catalog));
  for (const [relative, absolute] of inputs) {
    const target = path.join(dist, 'data', relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(absolute, target);
  }
  fs.writeFileSync(path.join(dist, '_headers'), '/*\n  Cache-Control: private, no-store\n  X-Robots-Tag: noindex, nofollow\n');
  return {dist, catalog};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  try {
    const result = buildReader({workId: args[args.indexOf('--work-id') + 1], privatePreview: args.includes('--private'), mangaUrl: process.env.MANGA_URL || ''});
    console.log(`Private reader built: ${result.dist}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
