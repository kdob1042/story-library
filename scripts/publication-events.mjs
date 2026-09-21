#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const sha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const configuredBefore = process.env.BEFORE_SHA || '';
const before = configuredBefore && !/^0+$/.test(configuredBefore)
  ? configuredBefore
  : sha + '^';

function gitShow(ref, relativePath) {
  try {
    return execFileSync('git', ['show', ref + ':' + relativePath], {encoding: 'utf8'});
  } catch {
    return null;
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function publicEpisodes(publication, now = Date.now()) {
  const format = publication?.formats?.novel;
  if (!format || format.visibility !== 'public') return new Map();
  const result = new Map();
  for (const entry of Array.isArray(format.episodes) ? format.episodes : []) {
    if (!entry || entry.visibility !== 'public' || entry.approved !== true || entry.transferred !== true) continue;
    if (entry.releaseAt != null) {
      const releaseAt = Date.parse(entry.releaseAt);
      if (Number.isNaN(releaseAt) || releaseAt > now) continue;
    }
    result.set(String(entry.id), {
      id: String(entry.id),
      revision: entry.approvedRevision == null ? '' : String(entry.approvedRevision),
    });
  }
  return result;
}

function findById(value, id, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (!Array.isArray(value) && value.id === id) return value;
  for (const child of Object.values(value)) {
    const found = findById(child, id, seen);
    if (found) return found;
  }
  return null;
}

function safeEventPart(value) {
  return String(value || '').replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 120);
}

let changedPaths;
try {
  changedPaths = execFileSync(
    'git',
    ['diff', '--name-only', before, sha, '--', 'works/**/publication.yaml'],
    {encoding: 'utf8'},
  ).trim().split(/\r?\n/).filter(Boolean);
} catch {
  changedPaths = [];
}

const events = [];
for (const relativePath of changedPaths) {
  const match = relativePath.match(/^works\/([^/]+)\/publication\.yaml$/);
  if (!match) continue;
  const workId = match[1];
  const currentPublication = readJson(relativePath);
  const previousText = gitShow(before, relativePath);
  const previousPublication = previousText ? JSON.parse(previousText) : null;
  const current = publicEpisodes(currentPublication);
  const previous = publicEpisodes(previousPublication);
  const work = readJson('works/' + workId + '/work.json');
  const workTitle = work?.work?.title || work?.title || workId;

  for (const episode of current.values()) {
    const previousEpisode = previous.get(episode.id);
    if (previousEpisode && previousEpisode.revision === episode.revision) continue;
    const manuscriptEpisode = findById(work, episode.id);
    const title = manuscriptEpisode?.title || episode.id;
    const revision = episode.revision || sha;
    events.push({
      eventId: [
        safeEventPart(sha),
        safeEventPart(workId),
        'novel',
        safeEventPart(episode.id),
        safeEventPart(revision),
      ].join(':'),
      workId,
      format: 'novel',
      episodeId: episode.id,
      title: workTitle + '｜' + title,
    });
  }
}

process.stdout.write(JSON.stringify(events, null, 2) + '\n');
