const EMAIL_TOKEN_TTL_SECONDS = 30 * 60;
const WORK_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function cryptoApi() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto is required');
  }
  return globalThis.crypto;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('EMAIL_SIGNING_SECRET must be at least 32 characters');
  }
}

async function deriveKey(secret) {
  assertSecret(secret);
  const digest = await cryptoApi().subtle.digest('SHA-256', textEncoder.encode(secret));
  return cryptoApi().subtle.importKey(
    'raw',
    digest,
    {name: 'AES-GCM'},
    false,
    ['encrypt', 'decrypt'],
  );
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidWorkId(value) {
  return WORK_ID_PATTERN.test(String(value || ''));
}

export function parseWorkConfig(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('RESEND_WORKS_JSON must be valid JSON');
    }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('RESEND_WORKS_JSON must be an object');
  }

  const result = {};
  for (const [workId, config] of Object.entries(value)) {
    if (!isValidWorkId(workId) || !config || typeof config !== 'object') {
      throw new Error('Invalid RESEND_WORKS_JSON entry');
    }
    if (typeof config.segmentId !== 'string' || config.segmentId.length < 8) {
      throw new Error('Each email work requires a segmentId');
    }
    if (config.topicId != null && (typeof config.topicId !== 'string' || config.topicId.length < 8)) {
      throw new Error('topicId must be a non-empty string');
    }
    result[workId] = {
      segmentId: config.segmentId,
      ...(config.topicId ? {topicId: config.topicId} : {}),
    };
  }
  return result;
}

export async function createConfirmationToken(payload, secret, now = Date.now()) {
  const key = await deriveKey(secret);
  const value = {
    ...payload,
    exp: Number(payload.exp ?? Math.floor(now / 1000) + EMAIL_TOKEN_TTL_SECONDS),
  };
  const iv = cryptoApi().getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi().subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    textEncoder.encode(JSON.stringify(value)),
  );
  return base64UrlEncode(iv) + '.' + base64UrlEncode(new Uint8Array(ciphertext));
}

export async function verifyConfirmationToken(token, secret, now = Date.now()) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const key = await deriveKey(secret);
    const plaintext = await cryptoApi().subtle.decrypt(
      {name: 'AES-GCM', iv: base64UrlDecode(parts[0])},
      key,
      base64UrlDecode(parts[1]),
    );
    const value = JSON.parse(textDecoder.decode(plaintext));
    if (!value || typeof value !== 'object' || Number(value.exp) <= Math.floor(now / 1000)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export {EMAIL_TOKEN_TTL_SECONDS};
