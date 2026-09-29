const COOKIE_NAME = '__Host-story-reader';
const READER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PAGE_SIZE = 50;

function json(value, status = 200, cookie) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Cookie',
  });
  if (cookie) headers.set('Set-Cookie', `${COOKIE_NAME}=${cookie}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return new Response(JSON.stringify(value), {status, headers});
}

function readerCookie(request) {
  const values = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(COOKIE_NAME + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(COOKIE_NAME.length + 1);
  return READER_PATTERN.test(value) ? value : null;
}

async function readerKey(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBody(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const parts = [];
  let length = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

async function publicEpisode(request, env, workId, episodeId) {
  const indexResponse = await env.ASSETS.fetch(new Request(new URL('/data/comment-works.json', request.url)));
  if (!indexResponse.ok) return false;
  const index = await indexResponse.json();
  return index.published === true && Array.isArray(index.works)
    && index.works.some(work => work.id === workId && work.episodeIds?.includes(episodeId));
}

export async function handleComments(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/comments') return json({error: 'not_found'}, 404);
  if (!['GET', 'POST'].includes(request.method)) return json({error: 'method_not_allowed'}, 405);
  let origin;
  try {
    const configured = new URL(env.COMMENTS_PUBLIC_ORIGIN);
    if (configured.protocol !== 'https:' || configured.pathname !== '/' || configured.search || configured.hash
      || configured.username || configured.password) throw new Error('Invalid origin');
    origin = configured.origin;
  } catch { return json({error: 'comments_not_configured'}, 503); }
  if (url.origin !== origin) return json({error: 'not_found'}, 404);
  const requestOrigin = request.headers.get('Origin');
  if ((requestOrigin && requestOrigin !== origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || (request.method === 'POST' && requestOrigin !== origin)) {
    return json({error: 'origin_not_allowed'}, 403);
  }

  const workId = url.searchParams.get('work');
  const episodeId = url.searchParams.get('episode');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(workId || '') || !/^[A-Za-z0-9_-]{1,100}$/.test(episodeId || '')) {
    return json({error: 'invalid_request'}, 400);
  }
  if (!await publicEpisode(request, env, workId, episodeId)) return json({error: 'not_found'}, 404);
  if (!env.COMMENTS_DB) return json({error: 'comments_not_configured'}, 503);

  const existingReader = readerCookie(request);
  const reader = existingReader || crypto.randomUUID();
  const key = await readerKey(reader);
  const db = env.COMMENTS_DB;
  if (request.method === 'GET') {
    const before = url.searchParams.get('before');
    if (before !== null && (!/^[1-9][0-9]{0,14}$/.test(before) || !Number.isSafeInteger(Number(before)))) {
      return json({error: 'invalid_request'}, 400);
    }
    const rows = await db.prepare(
      'SELECT id, name, body, created_at FROM episode_comments WHERE work_id = ? AND episode_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
    ).bind(workId, episodeId, before === null ? Number.MAX_SAFE_INTEGER : Number(before), PAGE_SIZE + 1).all();
    const own = await db.prepare(
      'SELECT id FROM episode_comments WHERE work_id = ? AND episode_id = ? AND reader_key = ?',
    ).bind(workId, episodeId, key).first();
    const comments = rows.results.slice(0, PAGE_SIZE);
    return json({
      comments, submitted: Boolean(own),
      nextCursor: rows.results.length > PAGE_SIZE ? String(comments.at(-1).id) : null,
    }, 200, existingReader ? undefined : reader);
  }

  // Require a successful initial GET so blocked cookies cannot silently bypass the limit.
  if (!existingReader) return json({error: 'cookies_required'}, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({error: 'invalid_request'}, 415);
  }
  const payload = await readBody(request);
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const body = typeof payload?.body === 'string' ? payload.body.trim().replace(/\r\n?/g, '\n') : '';
  if (!body || [...body].length > 1000 || [...name].length > 40 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body + name)
    || /[\r\n]/.test(name)) return json({error: 'invalid_request'}, 400);
  // The unique constraint, rather than a read-then-write check, prevents concurrent duplicates.
  const inserted = await db.prepare(
    'INSERT INTO episode_comments (work_id, episode_id, reader_key, name, body, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(work_id, episode_id, reader_key) DO NOTHING RETURNING id, name, body, created_at',
  ).bind(workId, episodeId, key, name || '読者', body, new Date().toISOString()).first();
  if (!inserted) return json({error: 'already_commented'}, 409);
  return json({comment: inserted, submitted: true}, 201);
}
