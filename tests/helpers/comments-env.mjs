import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {buildReader} from '../../scripts/build-reader.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
export async function commentsEnvironment({origin = 'https://story.example'} = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comments-fixture-'));
  fs.cpSync(path.join(root, 'fixtures/works'), path.join(temp, 'works'), {recursive: true});
  const novelRoot = path.join(temp, 'works/fixture-novel');
  const manuscript = JSON.parse(fs.readFileSync(path.join(novelRoot, 'work.json'), 'utf8'));
  manuscript.chapters[0].episodes.push({id: 'C01-E03', title: '第3話', path: 'manuscript/p01/p01-03.md'});
  fs.writeFileSync(path.join(novelRoot, 'work.json'), JSON.stringify(manuscript));
  fs.writeFileSync(path.join(novelRoot, 'manuscript/p01/p01-03.md'), '# 第3話\n\nコメント確認用の人工本文です。');
  const works = ['fixture-novel', 'fixture-story'].map(id => ({
    id, title: id, root: `works/${id}`, formats: ['novel'],
    manuscriptFormat: id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1',
    readAdapters: [id === 'fixture-story' ? 'story-source/v1' : 'novel-source/v1'],
    authority: 'library', origin: {repository: 'fixture/source'}, importStatus: 'verified',
  }));
  fs.writeFileSync(path.join(temp, 'library.json'), JSON.stringify({format: 'story-library/v1', authorityUntil: 'M8', works}));
  for (const work of works) {
    const ids = work.id === 'fixture-novel' ? ['C01-E01', 'C01-E02', 'C01-E03'] : ['P01'];
    fs.writeFileSync(path.join(temp, work.root, 'publication.yaml'), JSON.stringify({
      workId: work.id, timezone: 'Asia/Tokyo',
      formats: {manga: {visibility: 'private', episodes: []}, novel: {
        visibility: 'public', episodes: ids.map(id => ({id, visibility: 'public', approved: true, transferred: true})),
      }},
    }));
  }
  const build = (published = true) => buildReader({repoRoot: temp, published, privatePreview: !published});
  const result = build();
  const mf = new Miniflare({
    modules: true,
    scriptPath: path.join(root, 'worker.mjs'),
    modulesRoot: root,
    modulesRules: [{type: 'ESModule', include: ['**/*.mjs'], fallthrough: true}],
    compatibilityDate: '2026-07-30',
    d1Databases: ['COMMENTS_DB'],
    bindings: {COMMENTS_PUBLIC_ORIGIN: origin},
    serviceBindings: {ASSETS: async request => {
      const url = new URL(request.url);
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const target = path.resolve(result.dist, relative);
      if (!target.startsWith(result.dist + path.sep)) return new Response('Not found', {status: 404});
      try {
        const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'application/json';
        return new Response(fs.readFileSync(target), {headers: {'Content-Type': type}});
      } catch { return new Response('Not found', {status: 404}); }
    }},
  });
  const db = await mf.getD1Database('COMMENTS_DB');
  const schema = fs.readFileSync(path.join(root, 'migrations/comments/0001_episode_comments.sql'), 'utf8');
  for (const statement of schema.split(';').filter(value => value.trim())) await db.prepare(statement).run();
  return {mf, db, temp, dist: result.dist, build, async dispose() { await mf.dispose(); fs.rmSync(temp, {recursive: true, force: true}); }};
}
