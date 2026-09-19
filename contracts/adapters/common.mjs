import { STABLE_ID } from '../library/ids.mjs';
import { LibraryValidationError, checkObject, issue, isObject } from '../library/errors.mjs';
import { safeWorkRelativePath } from '../library/paths.mjs';

export function collectIssues(run) {
  const issues = [];
  run(issues);
  if (issues.length) throw new LibraryValidationError(issues);
}

export function requireObject(value, path, required, optional, issues) {
  return checkObject(value, path, required, optional, issues);
}

export function checkStableId(value, path, issues, used) {
  if (typeof value !== 'string' || !STABLE_ID.test(value)) {
    issue(issues, path, 'INVALID_ID', '固定IDが不正です');
    return false;
  }
  if (used.has(value)) {
    issue(issues, path, 'DUPLICATE_ID', 'IDが重複しています');
    return false;
  }
  used.add(value);
  return true;
}

export function checkSafeDeclaredPath(value, path, issues, usedPaths) {
  try {
    const safe = safeWorkRelativePath(value, '宣言パス');
    if (usedPaths.has(safe)) {
      issue(issues, path, 'DUPLICATE_PATH', `同じファイルを${usedPaths.get(safe)}でも参照しています`);
    } else {
      usedPaths.set(safe, path);
    }
    return safe;
  } catch (error) {
    issue(issues, path, 'INVALID_PATH', error.message);
    return null;
  }
}

export function headingOk(content) {
  if (typeof content !== 'string') return false;
  const firstLine = content.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  return /^#(?!#)[ \t]+\S.*$/.test(firstLine);
}

export function copyText(value) {
  return typeof value === 'string' ? value : value;
}

export function asRecords(items, path, issues) {
  if (!Array.isArray(items)) {
    issue(issues, path, 'INVALID_ARRAY', '配列が必要です');
    return [];
  }
  return items.filter(item => isObject(item) || (issue(issues, path, 'OBJECT_REQUIRED', 'オブジェクトが必要です'), false));
}
