import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { scanTextForSecrets } from '../src/foundation/secret-audit.mjs';
import { createSecurityAudit, formatSecurityAuditReport } from '../src/foundation/security-audit.mjs';

const root = new URL('../', import.meta.url);
const generatedAt = '2026-04-26T00:00:00.000Z';

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathFor(relativePath), 'utf8'));
}

test('security audit report assembles release-gate evidence and manual sign-offs', async () => {
  const audit = await createSecurityAudit({ root, generatedAt });
  const report = formatSecurityAuditReport(audit);

  assert.equal(audit.status, 'ready-for-human-review');
  assert.deepEqual(
    audit.categories.map((category) => category.id),
    ['secrets', 'dependency-risk', 'permission-boundaries', 'release-readiness']
  );
  assert.deepEqual(audit.automatedBlockers, []);

  assert.match(report, /^# Security Audit Release Report/m);
  assert.match(report, /Package: `teleton-client@0\.1\.0`/);
  assert.match(report, /Release gate status: `ready-for-human-review`/);
  assert.match(report, /## Manual Release Sign-Off/);
  assert.match(report, /- \[ \] \*\*Human security reviewer\*\*/);
  assert.match(report, /- \[ \] \*\*Human legal reviewer\*\*/);
  assert.match(report, /npm run audit:security -- --output security-audit-report\.md/);
});

test('security audit report blocks common secret patterns without exposing the value', async () => {
  const openAiKey = 'sk-proj-' + 'a'.repeat(32);
  const findings = scanTextForSecrets(`OPENAI_API_KEY="${openAiKey}"`, {
    filePath: 'sample.env',
    allowlist: []
  });

  const audit = await createSecurityAudit({
    root,
    generatedAt,
    secretScanResult: {
      findings,
      scannedFileCount: 1,
      scannedFiles: ['sample.env']
    }
  });
  const report = formatSecurityAuditReport(audit);

  assert.equal(audit.status, 'blocked');
  assert.equal(audit.automatedBlockers.length, 1);
  assert.equal(audit.automatedBlockers[0].categoryId, 'secrets');
  assert.match(report, /Secret Findings/);
  assert.match(report, /\[secret-like-value\]/);
  assert.doesNotMatch(report, new RegExp(openAiKey));
});

test('security audit command is wired into local, CI, and release validation docs', async () => {
  const packageJson = await readJson('package.json');
  const ci = await readFile(pathFor('.github/workflows/ci.yml'), 'utf8');
  const release = await readFile(pathFor('.github/workflows/release-validation.yml'), 'utf8');
  const contributing = await readFile(pathFor('CONTRIBUTING.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');

  assert.equal(packageJson.scripts['audit:security'], 'node scripts/audit-security.mjs');
  assert.match(ci, /npm run audit:security/);
  assert.match(release, /npm run audit:security -- --output security-audit-report\.md/);
  assert.match(release, /actions\/upload-artifact@v4/);
  assert.match(release, /if:\s*always\(\)/);
  assert.match(contributing, /npm run audit:security/);
  assert.match(buildGuide, /security-audit-report\.md/);
});
