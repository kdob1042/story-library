import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createConfirmationToken,
  isValidEmail,
  parseWorkConfig,
  verifyConfirmationToken,
} from '../email.mjs';

test('email validation normalizes addresses and rejects malformed input', () => {
  assert.equal(isValidEmail(' Reader@example.com '), true);
  assert.equal(isValidEmail('reader@example'), false);
  assert.equal(isValidEmail('reader example@example.com'), false);
  assert.equal(isValidEmail(''), false);
});

test('confirmation tokens are encrypted, expire, and reject tampering', async () => {
  const now = Date.parse('2026-09-21T00:00:00Z');
  const secret = 'a'.repeat(48);
  const token = await createConfirmationToken(
    {type: 'email-confirm', email: 'reader@example.com', workId: 'investor-life'},
    secret,
    now,
  );
  const payload = await verifyConfirmationToken(token, secret, now);
  assert.deepEqual(payload, {
    type: 'email-confirm',
    email: 'reader@example.com',
    workId: 'investor-life',
    exp: Math.floor(now / 1000) + 1800,
  });
  assert.equal(await verifyConfirmationToken(token + 'x', secret, now), null);
  assert.equal(await verifyConfirmationToken(token, secret, now + 1801 * 1000), null);
  assert.equal(await verifyConfirmationToken(token, 'b'.repeat(48), now), null);
});

test('work configuration requires per-work Resend segments', () => {
  assert.deepEqual(
    parseWorkConfig(JSON.stringify({
      'investor-life': {segmentId: 'segment-investor', topicId: 'topic-investor'},
      'kamiya-kawai': {segmentId: 'segment-kamiya'},
    })),
    {
      'investor-life': {segmentId: 'segment-investor', topicId: 'topic-investor'},
      'kamiya-kawai': {segmentId: 'segment-kamiya'},
    },
  );
  assert.throws(() => parseWorkConfig('[]'));
  assert.throws(() => parseWorkConfig('{"bad work":{"segmentId":"segment"}}'));
  assert.throws(() => parseWorkConfig('{"investor-life":{}}'));
});
