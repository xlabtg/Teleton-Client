import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  formatSecretAuditFindings,
  scanRepositoryForSecrets,
  scanTextForSecrets
} from '../src/foundation/secret-audit.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('secret audit detects high-confidence committed credential patterns', () => {
  const githubToken = 'ghp_' + 'a'.repeat(36);
  const telegramApiHash = 'b'.repeat(32);
  const botToken = '123456789:' + 'A'.repeat(35);
  const content = [
    `GITHUB_TOKEN=${githubToken}`,
    `api_hash = "${telegramApiHash}"`,
    `botToken: "${botToken}"`
  ].join('\n');

  const findings = scanTextForSecrets(content, {
    filePath: 'sample.env',
    allowlist: []
  });

  assert.deepEqual(
    findings.map((finding) => finding.patternId),
    ['github-token', 'telegram-api-hash', 'telegram-bot-token']
  );

  const formatted = formatSecretAuditFindings(findings);
  assert.match(formatted, /\[secret-like-value\]/);
  assert.doesNotMatch(formatted, new RegExp(githubToken));
  assert.doesNotMatch(formatted, new RegExp(telegramApiHash));
  assert.doesNotMatch(formatted, new RegExp(botToken));
});

test('secret audit accepts secure references and scans committed files', async () => {
  const safeContent = [
    'apiHashRef: "keychain:telegram-api-hash"',
    'tokenRef: "secret:approved-custom-token"',
    'secretRef: "env:TELETON_MTPROTO_SECRET"'
  ].join('\n');

  assert.deepEqual(scanTextForSecrets(safeContent, { filePath: 'safe.mjs' }), []);

  const result = await scanRepositoryForSecrets({ root });

  assert.deepEqual(result.findings, []);
  assert.ok(result.scannedFileCount > 0);
});

test('security audit documentation records credential rotation and release review requirements', async () => {
  const audit = await readFile(pathFor('docs/security-audit.md'), 'utf8');

  assert.match(audit, /npm run validate:secrets/);
  assert.match(audit, /Credential rotation/i);
  assert.match(audit, /Telegram API/i);
  assert.match(audit, /Human security review/i);
  assert.match(audit, /before release/i);
});
