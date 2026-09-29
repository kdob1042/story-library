#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
const events = file && fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : [];
const endpoint = process.env.STORY_LIBRARY_EMAIL_ENDPOINT || '';
const token = process.env.STORY_LIBRARY_EMAIL_DISPATCH_TOKEN || '';

if (!Array.isArray(events) || events.length === 0) {
  console.log('No publication email events.');
  process.exit(0);
}
if (!endpoint || !token) {
  console.log('Publication email notification is not configured; skipping ' + events.length + ' event(s).');
  process.exit(0);
}

let url;
try {
  url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('endpoint must use https');
} catch (error) {
  console.error('Invalid STORY_LIBRARY_EMAIL_ENDPOINT: ' + error.message);
  process.exit(1);
}

for (const event of events) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error('Notification failed for ' + event.eventId + ': HTTP ' + response.status + ' ' + body.slice(0, 200));
  }
  const result = await response.json().catch(() => ({}));
  console.log('Publication email event ' + event.eventId + ': ' + (result.duplicate ? 'already sent' : 'accepted'));
}
