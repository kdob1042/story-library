import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readManuscript } from '../adapters/read.mjs';
import { validateCatalog } from './catalog.mjs';
import { LibraryValidationError, issue } from './errors.mjs';
import { defaultPublication, validatePublication } from './publication.mjs';
import { validateSourceMap } from './source-map.mjs';

const execFileAsync = promisify(execFile);

export const SKIP_NAMES = new Set([
  '.git',
  '.github',
  'node_modules',
  'dist',
  'coverage',
  '.DS_Store',
]);

export const SKIP_FILES = new Set([
  'package.json',
  'package-lock.json',
  'wrangler.jsonc',
  'index.html',
  'TODO.md',
  'AGENTS.md',
  'README.md',
]);

const COPY_ROOTS = new Set(['manuscript', 'settings', 'assets', 'ai']);
const HISTORY_ROOTS = new Set(['archive', 'revisions']);
const COPY_ROOT_FILES = new Set(['manifest.json', 'INDEX.md', 'CHANGELOG.md']);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function walkFiles(root, relative = '') {
  const entries = [];
  const dirents = await readdir(join(root, relative), { withFileTypes: true });
  for (const dirent of dirents) {
    if (SKIP_NAMES.has(dirent.name)) continue;
    const next = relative ? `${relative}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      entries.push(...await walkFiles(root, next));
      continue;
    }
    if (!relative && SKIP_FILES.has(dirent.name)) continue;
    if (dirent.name.startsWith('.')) continue;
    entries.push(next);
  }
  return entries;
}

export function planImportLayout(paths) {
  const hasNestedSource = paths.some(path => path === 'source/manifest.json' || path.startsWith('source/'));
  const hasRootManifest = paths.includes('manifest.json');
  return {
    hasNestedSource,
    hasRootManifest,
    flattenSourceTree: hasNestedSource,
  };
}

function normalizedOriginPath(originPath, layout) {
  if (layout.flattenSourceTree && originPath.startsWith('source/')) {
    return originPath.slice('source/'.length);
  }
  return originPath;
}

export function isImportableOriginPath(originPath, layout) {
  const path = normalizedOriginPath(originPath, layout);
  if (COPY_ROOT_FILES.has(path)) return true;
  const root = path.split('/')[0];
  return COPY_ROOTS.has(root) || HISTORY_ROOTS.has(root);
}

export function mapOriginPath(originPath, layout) {
  const path = normalizedOriginPath(originPath, layout);
  if (path === 'manifest.json') return 'source/manifest.json';
  if (path === 'CHANGELOG.md') return 'history/CHANGELOG.md';
  if (path.startsWith('archive/') || path.startsWith('revisions/')) return 'history/' + path;
  return path;
}

function identityMap(ids) {
  return Object.fromEntries(ids.filter(Boolean).map(id => [id, id]));
}

function extractIds(model) {
  return {
    chapter: identityMap((model.chapters ?? []).map(item => item.id)),
    episode: identityMap((model.episodes ?? []).map(item => item.id)),
    scene: identityMap((model.scenes ?? []).map(item => item.id)),
    setting: identityMap((model.settings ?? []).map(item => item.id)),
    character: identityMap((model.characters ?? []).map(item => item.id)),
  };
}

async function gitHead(originRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', originRoot, 'rev-parse', 'HEAD']);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function planWorkImport({ catalog, sourceMap, workId, originRoot, originRepository, originRef, commit }) {
  const normalizedCatalog = validateCatalog(catalog);
  const work = normalizedCatalog.works.find(item => item.id === workId);
  if (!work) {
    throw new LibraryValidationError([{ path: workId, code: 'UNKNOWN_WORK', message: 'catalogにないworkIdです' }]);
  }
  if (work.authority !== 'origin') {
    throw new LibraryValidationError([{ path: workId, code: 'PREMATURE_CUTOVER', message: 'library正本の作品は旧repoから再取り込みできません' }]);
  }
  const allPaths = await walkFiles(originRoot);
  if (!allPaths.includes('manifest.json') && !allPaths.includes('source/manifest.json')) {
    throw new LibraryValidationError([{ path: originRoot, code: 'MISSING_FILE', message: 'originにmanifest.jsonがありません' }]);
  }
  const layout = planImportLayout(allPaths);
  const paths = allPaths.filter(path => isImportableOriginPath(path, layout));
  const effectiveCommit = commit ?? await gitHead(originRoot) ?? work.origin.commit ?? null;
  if (work.origin.commit && effectiveCommit && work.origin.commit !== effectiveCommit) {
    throw new LibraryValidationError([{
      path: `${workId}.origin.commit`,
      code: 'ORIGIN_COMMIT_MISMATCH',
      message: `採用元commit ${work.origin.commit} と取込元 ${effectiveCommit} が一致しません`,
    }]);
  }
  const copies = [];
  const seenTarget = new Map();
  for (const originPath of paths) {
    const targetPath = mapOriginPath(originPath, layout);
    if (seenTarget.has(targetPath) && originPath !== 'manifest.json') {
      throw new LibraryValidationError([{ path: targetPath, code: 'DUPLICATE_PATH', message: `複製先が衝突しています: ${originPath}` }]);
    }
    seenTarget.set(targetPath, originPath);
    const bytes = await readFile(join(originRoot, originPath));
    copies.push({
      originPath,
      targetPath,
      sha256: sha256(bytes),
      bytes,
    });
  }
  if (!copies.some(item => item.targetPath === 'source/manifest.json')) {
    throw new LibraryValidationError([{ path: 'source/manifest.json', code: 'MISSING_FILE', message: 'manifestを source/manifest.json へ置けません' }]);
  }
  return {
    work,
    layout,
    copies,
    originRepository: originRepository ?? work.origin.repository,
    originRef: originRef ?? work.origin.ref ?? 'main',
    commit: effectiveCommit,
    sourceMap,
  };
}

export function applySourceMapEntry(sourceMap, { work, copies, model, originRepository, originRef, commit }) {
  const next = structuredClone(sourceMap);
  const entry = {
    workId: work.id,
    status: 'copied',
    origin: {
      repository: originRepository,
      ref: originRef,
      ...(commit ? { commit } : {}),
      path: '.',
    },
    target: { root: work.root, path: '.' },
    ids: extractIds(model),
    files: copies.map(copy => ({
      origin: copy.originPath,
      target: copy.targetPath,
      sha256: copy.sha256,
    })),
    notes: '本文・固定ID・宣言ファイルをoriginから複製。archive/revisions/CHANGELOGはhistory/へ区別して保管し、Worker・ビューアー・生成物はコピーしない。origin repoは削除しない。',
  };
  const index = next.entries.findIndex(item => item.workId === work.id);
  if (index >= 0) next.entries[index] = { ...next.entries[index], ...entry, ids: { ...next.entries[index].ids, ...entry.ids } };
  else next.entries.push(entry);
  return validateSourceMap(next, { catalogWorkIds: new Set([work.id, ...next.entries.map(item => item.workId)]) });
}

export async function importWork(options) {
  const plan = await planWorkImport(options);
  const manifestCopy = plan.copies.find(item => item.targetPath === 'source/manifest.json');
  const manifest = JSON.parse(manifestCopy.bytes.toString('utf8'));
  const declared = manifest.format === 'story-source/v1'
    ? new Set([
      ...(manifest.episodes ?? []).flatMap(episode => (episode.scenes ?? []).map(scene => scene.path)),
      ...(manifest.settings ?? []).map(setting => setting.path),
      ...(manifest.characters ?? []).flatMap(character => character.image ? [character.image] : []),
    ])
    : null;
  const files = Object.fromEntries(
    plan.copies
      .filter(item => item.targetPath !== 'source/manifest.json' && (!declared || declared.has(item.targetPath)))
      .map(item => [item.targetPath, /\.(?:png|jpe?g|webp)$/i.test(item.targetPath) ? item.bytes : item.bytes.toString('utf8')])
  );
  const model = readManuscript(manifest, files, { expectedFormat: plan.work.manuscriptFormat });
  const publication = defaultPublication(plan.work.id);
  validatePublication(publication, { workId: plan.work.id });

  if (options.dryRun) {
    return { plan, model, publication, wrote: false };
  }

  const targetRoot = join(options.libraryRoot, plan.work.root);
  if (await exists(targetRoot) && !options.replaceImport) {
    throw new LibraryValidationError([{ path: plan.work.root, code: 'TARGET_EXISTS', message: '複製先が既にあります。originは変更せず、明示的な replace だけ上書きします' }]);
  }
  await mkdir(dirname(targetRoot), { recursive: true });
  if (await exists(targetRoot) && options.replaceImport) {
    await rm(targetRoot, { recursive: true, force: true });
  }
  for (const copy of plan.copies) {
    const dest = join(targetRoot, copy.targetPath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, copy.bytes);
  }
  await writeFile(join(targetRoot, 'publication.yaml'), `${JSON.stringify(publication, null, 2)}\n`);

  const nextCatalog = structuredClone(options.catalog);
  const catalogWork = nextCatalog.works.find(item => item.id === plan.work.id);
  catalogWork.importStatus = 'imported';
  catalogWork.authority = 'origin';
  if (plan.commit) catalogWork.origin = { ...catalogWork.origin, commit: plan.commit };
  const nextSourceMap = applySourceMapEntry(options.sourceMap, {
    work: plan.work,
    copies: plan.copies,
    model,
    originRepository: plan.originRepository,
    originRef: plan.originRef,
    commit: plan.commit,
  });
  validateCatalog(nextCatalog);

  if (options.writeCatalog !== false) {
    await writeFile(join(options.libraryRoot, 'library.json'), `${JSON.stringify(nextCatalog, null, 2)}\n`);
    await writeFile(join(options.libraryRoot, 'migrations/source-map.json'), `${JSON.stringify(nextSourceMap, null, 2)}\n`);
  }

  return { plan, model, publication, catalog: nextCatalog, sourceMap: nextSourceMap, wrote: true };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function copyOriginUnchanged(originRoot) {
  const before = sha256(Buffer.from((await walkFiles(originRoot)).join('\n')));
  return before;
}

export { sha256 };

