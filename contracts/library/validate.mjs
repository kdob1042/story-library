import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importedWorks, validateCatalog } from './catalog.mjs';
import { LibraryValidationError, issue } from './errors.mjs';
import { defaultPublication, validatePublication } from './publication.mjs';
import { manifestEntryPath, publicationPath, safeWorkRelativePath } from './paths.mjs';
import { validateSourceMap } from './source-map.mjs';
import { readManuscript } from '../adapters/read.mjs';

export function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch {
    throw new LibraryValidationError([{ path, code: 'INVALID_JSON', message: 'JSONを解析できません' }]);
  }
}

export async function loadJson(filePath, path = filePath) {
  return parseJson(await readFile(filePath, 'utf8'), path);
}

export async function validateLibraryDocuments({ catalog, sourceMap }) {
  const normalizedCatalog = validateCatalog(catalog);
  const normalizedMap = validateSourceMap(sourceMap, {
    catalogWorkIds: new Set(normalizedCatalog.works.map(work => work.id)),
  });
  const issues = [];
  for (const work of normalizedCatalog.works) {
    const entry = normalizedMap.entries.find(item => item.workId === work.id);
    if (!entry) {
      issue(issues, `source-map:${work.id}`, 'MISSING_SOURCE_MAP', 'catalogの作品にsource-mapがありません');
      continue;
    }
    if (entry.origin.repository !== work.origin.repository) {
      issue(issues, `source-map:${work.id}.origin.repository`, 'ORIGIN_MISMATCH', 'catalogとsource-mapの採用元repoが一致しません');
    }
  }
  if (issues.length) throw new LibraryValidationError(issues);
  return { catalog: normalizedCatalog, sourceMap: normalizedMap };
}

export async function validateImportedWork(repoRoot, work, filesByPath) {
  if (work.importStatus === 'pending-access' || work.importStatus === 'pending-identification') {
    return { work, status: work.importStatus, manuscript: null, publication: null };
  }
  const manifestPath = manifestEntryPath(work.root);
  const publicationFile = publicationPath(work.root);
  if (!filesByPath.has('source/manifest.json')) {
    throw new LibraryValidationError([
      { path: manifestPath, code: 'MISSING_FILE', message: '取り込まれた作品に source/manifest.json がありません' },
    ]);
  }
  const manifest = parseJson(filesByPath.get('source/manifest.json'), manifestPath);
  const manuscript = readManuscript(manifest, Object.fromEntries(
    [...filesByPath.entries()].filter(([path]) => path !== 'source/manifest.json' && path !== 'publication.yaml')
  ), { expectedFormat: work.manuscriptFormat });
  const publication = validatePublication(null, {
    workId: work.id,
    text: filesByPath.get('publication.yaml') ?? JSON.stringify(defaultPublication(work.id)),
  });
  if (!filesByPath.has('publication.yaml')) {
    throw new LibraryValidationError([
      { path: publicationFile, code: 'MISSING_FILE', message: '取り込まれた作品に publication.yaml がありません' },
    ]);
  }
  return { work, status: work.importStatus, manuscript, publication };
}

export function indexWorkFiles(entries) {
  const files = new Map();
  for (const [rawPath, content] of entries) {
    const path = safeWorkRelativePath(rawPath, '作品ファイル');
    files.set(path, content);
  }
  return files;
}

export async function readWorkFilesFromDisk(repoRoot, workRoot) {
  const { readdir } = await import('node:fs/promises');
  const files = new Map();
  async function walk(relative) {
    const absolute = join(repoRoot, workRoot, relative);
    const dirents = await readdir(absolute, { withFileTypes: true });
    for (const dirent of dirents) {
      const next = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) await walk(next);
      else files.set(next, await readFile(join(repoRoot, workRoot, next), dirent.name.endsWith('.png') || dirent.name.endsWith('.jpg') || dirent.name.endsWith('.jpeg') || dirent.name.endsWith('.webp') ? null : 'utf8'));
    }
  }
  await walk('');
  return files;
}

export async function validateRepository(repoRoot) {
  const catalog = await loadJson(join(repoRoot, 'library.json'), 'library.json');
  const sourceMap = await loadJson(join(repoRoot, 'migrations/source-map.json'), 'migrations/source-map.json');
  const documents = await validateLibraryDocuments({ catalog, sourceMap });
  const imported = [];
  for (const work of importedWorks(documents.catalog)) {
    const files = await readWorkFilesFromDisk(repoRoot, work.root);
    imported.push(await validateImportedWork(repoRoot, work, files));
  }
  return { ...documents, imported };
}
