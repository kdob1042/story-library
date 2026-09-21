import {
  createConfirmationToken,
  isValidEmail,
  isValidWorkId,
  normalizeEmail,
  parseWorkConfig,
  verifyConfirmationToken,
} from './email.mjs';

const RESEND_API_ORIGIN = 'https://api.resend.com';
const PUBLIC_INDEX_PATH = '/data/email-works.json';
const NOTIFICATION_TTL_SECONDS = 2 * 365 * 24 * 60 * 60;
const NOTIFICATION_PROCESSING_TTL_SECONDS = 10 * 60;
const RATE_LIMIT_TTL_SECONDS = 60;

function responseHeaders(contentType) {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return headers;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders('application/json; charset=utf-8'),
  });
}

function htmlResponse(body, status = 200) {
  return new Response(
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小説ライブラリ</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.8">' +
      body +
    '</body></html>',
    {status, headers: responseHeaders('text/html; charset=utf-8')},
  );
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function configuredPublicOrigin(env) {
  if (!env.EMAIL_PUBLIC_ORIGIN) return null;
  try {
    const origin = new URL(env.EMAIL_PUBLIC_ORIGIN);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
}

function publicGate(request, env) {
  const expected = configuredPublicOrigin(env);
  if (!expected) return {response: jsonResponse({error: 'email_not_configured'}, 503)};
  const actual = new URL(request.url);
  if (actual.origin !== expected.origin) return {response: jsonResponse({error: 'not_found'}, 404)};
  const requestOrigin = request.headers.get('Origin');
  if (requestOrigin && requestOrigin !== expected.origin) {
    return {response: jsonResponse({error: 'origin_not_allowed'}, 403)};
  }
  return {origin: expected};
}

function providerConfigured(env, {signing = false, dispatch = false} = {}) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  if (signing && !env.EMAIL_SIGNING_SECRET) return false;
  if (dispatch && !env.EMAIL_DISPATCH_TOKEN) return false;
  return true;
}

async function parseJsonBody(request) {
  const text = await request.text();
  if (!text || text.length > 10000) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function resendRequest(env, pathname, method = 'GET', body) {
  const headers = new Headers({
    Authorization: 'Bearer ' + env.RESEND_API_KEY,
  });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(RESEND_API_ORIGIN + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return {ok: response.ok, status: response.status, data};
}

async function loadPublicIndex(request, env) {
  try {
    const url = new URL(PUBLIC_INDEX_PATH, request.url);
    const response = await env.ASSETS.fetch(new Request(url.toString(), {method: 'GET'}));
    if (!response.ok) return null;
    const value = await response.json();
    return value && value.published === true && Array.isArray(value.works) ? value : null;
  } catch {
    return null;
  }
}

function findPublicWork(index, workId) {
  return index?.works?.find(work => work && work.id === workId) || null;
}

function getWorkEmailConfig(env, workId) {
  const configs = parseWorkConfig(env.RESEND_WORKS_JSON || '{}');
  return configs[workId] || null;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function takeSubscribeRateLimit(request, env) {
  if (!env.NOTIFICATION_STATE) throw new Error('NOTIFICATION_STATE is required');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = 'rate:subscribe:' + (await sha256Hex(ip));
  if (await env.NOTIFICATION_STATE.get(key)) return false;
  await env.NOTIFICATION_STATE.put(key, '1', {expirationTtl: RATE_LIMIT_TTL_SECONDS});
  return true;
}

async function sendConfirmationEmail(env, email, work, origin) {
  const token = await createConfirmationToken(
    {type: 'email-confirm', email, workId: work.id},
    env.EMAIL_SIGNING_SECRET,
  );
  const confirmationUrl = new URL('/api/email/confirm', origin);
  confirmationUrl.searchParams.set('token', token);
  const workTitle = work.title || work.id;
  const body = {
    from: env.EMAIL_FROM,
    to: [email],
    subject: '小説更新通知の登録確認',
    html:
      '<p>「' + htmlEscape(workTitle) + '」の更新通知を登録するには、次のボタンを押してください。</p>' +
      '<p><a href="' + htmlEscape(confirmationUrl.href) + '">登録を確定する</a></p>' +
      '<p>このリンクは30分で無効になります。心当たりがない場合は無視してください。</p>',
  };
  return resendRequest(env, '/emails', 'POST', body);
}

async function upsertConfirmedContact(env, email, workId, config) {
  const body = {
    email,
    unsubscribed: false,
    properties: {story_library_work_id: workId},
    segments: [{id: config.segmentId}],
  };
  if (config.topicId) {
    body.topics = [{id: config.topicId, subscription: 'opt_in'}];
  }

  const created = await resendRequest(env, '/contacts', 'POST', body);
  if (created.ok) return true;
  if (![409, 422].includes(created.status)) return false;

  const encodedEmail = encodeURIComponent(email);
  const updated = await resendRequest(
    env,
    '/contacts/' + encodedEmail,
    'PATCH',
    {unsubscribed: false, properties: {story_library_work_id: workId}},
  );
  if (!updated.ok) return false;

  if (config.topicId) {
    const topics = await resendRequest(
      env,
      '/contacts/' + encodedEmail + '/topics',
      'PATCH',
      [{id: config.topicId, subscription: 'opt_in'}],
    );
    if (!topics.ok) return false;
  }

  const segment = await resendRequest(
    env,
    '/contacts/' + encodedEmail + '/segments/' + encodeURIComponent(config.segmentId),
    'POST',
  );
  return segment.ok || segment.status === 409;
}

async function handleSubscribe(request, env) {
  if (request.method !== 'POST') return jsonResponse({error: 'method_not_allowed'}, 405);
  const gate = publicGate(request, env);
  if (gate.response) return gate.response;
  if (!providerConfigured(env, {signing: true})) {
    return jsonResponse({error: 'email_not_configured'}, 503);
  }

  let allowed;
  try {
    allowed = await takeSubscribeRateLimit(request, env);
  } catch {
    return jsonResponse({error: 'email_not_configured'}, 503);
  }
  if (!allowed) return jsonResponse({error: 'rate_limited'}, 429);

  const body = await parseJsonBody(request);
  const email = normalizeEmail(body?.email);
  const workId = String(body?.workId || '');
  if (!isValidEmail(email) || !isValidWorkId(workId) || body?.format !== 'novel') {
    return jsonResponse({error: 'invalid_request'}, 400);
  }

  const index = await loadPublicIndex(request, env);
  const work = findPublicWork(index, workId);
  if (!work) return jsonResponse({error: 'not_found'}, 404);

  let config;
  try {
    config = getWorkEmailConfig(env, workId);
  } catch {
    return jsonResponse({error: 'email_not_configured'}, 503);
  }
  if (!config) return jsonResponse({error: 'email_not_configured'}, 503);

  const result = await sendConfirmationEmail(env, email, work, gate.origin);
  if (!result.ok) return jsonResponse({error: 'email_provider_failed'}, 502);
  return jsonResponse({
    ok: true,
    message: '確認メールを送信しました。メール内のリンクから登録を確定してください。',
  }, 202);
}

async function handleConfirm(request, env) {
  if (request.method !== 'GET') return jsonResponse({error: 'method_not_allowed'}, 405);
  const gate = publicGate(request, env);
  if (gate.response) return gate.response;
  if (!providerConfigured(env, {signing: true})) {
    return htmlResponse('<h1>設定を確認できません</h1><p>しばらくしてから再度お試しください。</p>', 503);
  }

  const token = new URL(request.url).searchParams.get('token');
  const payload = await verifyConfirmationToken(token, env.EMAIL_SIGNING_SECRET);
  const email = normalizeEmail(payload?.email);
  const workId = String(payload?.workId || '');
  if (payload?.type !== 'email-confirm' || !isValidEmail(email) || !isValidWorkId(workId)) {
    return htmlResponse('<h1>登録リンクが無効です</h1><p>リンクの有効期限が切れているか、正しくありません。</p>', 400);
  }

  const index = await loadPublicIndex(request, env);
  const work = findPublicWork(index, workId);
  if (!work) return htmlResponse('<h1>作品が見つかりません</h1><p>現在、登録できない作品です。</p>', 404);

  let config;
  try {
    config = getWorkEmailConfig(env, workId);
  } catch {
    config = null;
  }
  if (!config) return htmlResponse('<h1>設定を確認できません</h1><p>しばらくしてから再度お試しください。</p>', 503);

  const ok = await upsertConfirmedContact(env, email, workId, config);
  if (!ok) return htmlResponse('<h1>登録に失敗しました</h1><p>しばらくしてから再度お試しください。</p>', 502);
  return htmlResponse('<h1>登録が完了しました</h1><p>「' + htmlEscape(work.title || work.id) + '」の新しい公開話をお知らせします。</p>');
}

async function readNotificationState(env, eventId) {
  if (!env.NOTIFICATION_STATE) throw new Error('NOTIFICATION_STATE is required');
  const key = 'notify:' + eventId;
  const raw = await env.NOTIFICATION_STATE.get(key);
  if (!raw) return {key, state: null};
  try {
    return {key, state: JSON.parse(raw)};
  } catch {
    return {key, state: {status: 'sent'}};
  }
}

async function claimNotification(env, eventId) {
  const current = await readNotificationState(env, eventId);
  if (current.state?.status === 'sent') return {...current, duplicate: true};
  if (current.state?.status === 'processing') {
    const age = Date.now() - Number(current.state.startedAt || 0);
    if (age < NOTIFICATION_PROCESSING_TTL_SECONDS * 1000) {
      return {...current, duplicate: true, inProgress: true};
    }
  }
  await env.NOTIFICATION_STATE.put(
    current.key,
    JSON.stringify({status: 'processing', startedAt: Date.now()}),
    {expirationTtl: NOTIFICATION_PROCESSING_TTL_SECONDS},
  );
  return {...current, duplicate: false};
}

async function finishNotification(env, key, status) {
  const ttl = status === 'sent' ? NOTIFICATION_TTL_SECONDS : NOTIFICATION_PROCESSING_TTL_SECONDS;
  await env.NOTIFICATION_STATE.put(key, JSON.stringify({status, finishedAt: Date.now()}), {expirationTtl: ttl});
}

async function handleNotify(request, env) {
  if (request.method !== 'POST') return jsonResponse({error: 'method_not_allowed'}, 405);
  const gate = publicGate(request, env);
  if (gate.response) return gate.response;
  if (!providerConfigured(env, {dispatch: true})) {
    return jsonResponse({error: 'email_not_configured'}, 503);
  }
  if (request.headers.get('Authorization') !== 'Bearer ' + env.EMAIL_DISPATCH_TOKEN) {
    return jsonResponse({error: 'unauthorized'}, 401);
  }

  const body = await parseJsonBody(request);
  const eventId = String(body?.eventId || '').trim();
  const workId = String(body?.workId || '');
  const episodeId = String(body?.episodeId || '');
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(eventId) || !isValidWorkId(workId) || !episodeId || body?.format !== 'novel') {
    return jsonResponse({error: 'invalid_request'}, 400);
  }

  const index = await loadPublicIndex(request, env);
  const work = findPublicWork(index, workId);
  const episode = work?.episodes?.find(item => item && item.id === episodeId);
  if (!work || !episode) return jsonResponse({error: 'not_found'}, 404);

  let config;
  try {
    config = getWorkEmailConfig(env, workId);
  } catch {
    return jsonResponse({error: 'email_not_configured'}, 503);
  }
  if (!config) return jsonResponse({error: 'email_not_configured'}, 503);

  let claimed;
  try {
    claimed = await claimNotification(env, eventId);
  } catch {
    return jsonResponse({error: 'notification_state_not_configured'}, 503);
  }
  if (claimed.duplicate) {
    return jsonResponse({ok: true, duplicate: true, inProgress: Boolean(claimed.inProgress)});
  }

  const link = new URL('/', gate.origin);
  link.searchParams.set('work', work.id);
  link.searchParams.set('episode', episode.id);
  const workTitle = work.title || work.id;
  const episodeTitle = episode.title || episode.id;
  const result = await resendRequest(env, '/broadcasts', 'POST', {
    segment_id: config.segmentId,
    from: env.EMAIL_FROM,
    subject: workTitle + '｜新しい話を公開しました',
    html:
      '<p>「' + htmlEscape(workTitle) + '」に新しい話が公開されました。</p>' +
      '<p><strong>' + htmlEscape(episodeTitle) + '</strong></p>' +
      '<p><a href="' + htmlEscape(link.href) + '">本文を読む</a></p>' +
      '<p style="color:#666;font-size:small">配信停止はメール下部の<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">リンク</a>から行えます。</p>',
    send: true,
  });
  if (!result.ok) {
    try {
      await finishNotification(env, claimed.key, 'failed');
    } catch {
      // Preserve the provider failure response.
    }
    return jsonResponse({error: 'email_provider_failed'}, 502);
  }

  try {
    await finishNotification(env, claimed.key, 'sent');
  } catch {
    return jsonResponse({error: 'notification_state_failed'}, 503);
  }
  return jsonResponse({ok: true, sent: true}, 202);
}

async function handleEmailApi(request, env) {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/email/subscribe') return handleSubscribe(request, env);
  if (pathname === '/api/email/confirm') return handleConfirm(request, env);
  if (pathname === '/api/email/notify') return handleNotify(request, env);
  return jsonResponse({error: 'not_found'}, 404);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/email/')) {
      try {
        return await handleEmailApi(request, env);
      } catch (error) {
        console.error('email request failed', error instanceof Error ? error.message : 'unknown error');
        return jsonResponse({error: 'internal_error'}, 500);
      }
    }
    return privateResponse(await env.ASSETS.fetch(request));
  },
};
