import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

function assertIncludesAll(content, patterns, label) {
  for (const pattern of patterns) {
    assert.match(content, pattern, `${label} must include ${pattern}`);
  }
}

test('privacy policy publishes local processing and data-flow coverage', async () => {
  const privacy = await readFile(pathFor('PRIVACY.md'), 'utf8');

  assert.match(privacy, /^# Privacy Policy$/m);
  assert.doesNotMatch(privacy, /Privacy Policy Draft/i);

  assertIncludesAll(
    privacy,
    [
      /^## Current Repository State$/m,
      /^## Data Handling Principles$/m,
      /^## Data Flow Coverage$/m,
      /^### Telegram Messaging$/m,
      /^### Proxy Connectivity$/m,
      /^### Teleton Agent$/m,
      /^### Cloud Processing$/m,
      /^### Settings Synchronization$/m,
      /^### TON Blockchain$/m,
      /^## User Controls$/m,
      /^## Policy Maintenance$/m
    ],
    'PRIVACY.md'
  );

  assertIncludesAll(
    privacy,
    [
      /does not yet ship a production client/i,
      /local by default/i,
      /explicit cloud processing opt-in/i,
      /default is `off`/i,
      /require confirmation before signing or broadcasting/i,
      /update `PRIVACY\.md` in the same pull request/i,
      /human maintainer review/i
    ],
    'privacy policy acceptance criteria'
  );
});
