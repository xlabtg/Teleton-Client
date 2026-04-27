import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('release readiness checklist covers required publication gates and human approval', async () => {
  const readiness = await import('../src/foundation/release-readiness.mjs');
  const checklist = readiness.listReleaseReadinessChecklist();

  assert.deepEqual(
    checklist.map((item) => item.id),
    [
      'tests',
      'licenses',
      'privacy',
      'security',
      'artifacts',
      'documentation',
      'human-release-approval'
    ]
  );

  for (const item of checklist) {
    assert.equal(item.requiredBeforePublicRelease, true, `${item.id} must block public release`);
    assert.ok(item.humanApproverRole, `${item.id} must name a human approver role`);
    assert.ok(item.evidence.length > 0, `${item.id} must list release evidence`);
  }

  assert.doesNotThrow(() => readiness.assertReleaseReadinessChecklist());
});

test('release readiness documentation records source publication and shipped behavior review', async () => {
  const readinessDoc = await readFile(new URL('docs/release-readiness.md', root), 'utf8');
  const readiness = await import('../src/foundation/release-readiness.mjs');

  assert.match(readinessDoc, /^# Release Readiness$/m);
  assert.match(readinessDoc, /source publication/i);
  assert.match(readinessDoc, /human release approval/i);
  assert.match(readinessDoc, /Documentation Completeness/i);

  for (const item of readiness.listReleaseReadinessChecklist()) {
    assert.match(readinessDoc, new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('release documentation inventory maps shipped foundation behavior to docs and tests', async () => {
  const readiness = await import('../src/foundation/release-readiness.mjs');
  const inventory = readiness.listReleaseDocumentationInventory();

  assert.ok(inventory.length >= 10, 'release inventory should cover shipped foundation behavior groups');

  for (const entry of inventory) {
    assert.equal(existsSync(new URL(entry.source, root)), true, `${entry.id} source must exist`);
    assert.equal(existsSync(new URL(entry.test, root)), true, `${entry.id} test must exist`);

    for (const doc of entry.docs) {
      const content = await readFile(new URL(doc.path, root), 'utf8');
      assert.match(content, doc.pattern, `${entry.id} must be documented in ${doc.path}`);
    }
  }
});

test('release validation enforces the readiness checklist', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const releaseValidation = await readFile(new URL('scripts/validate-release.mjs', root), 'utf8');
  const releaseStrategy = await readFile(new URL('docs/release-strategy.md', root), 'utf8');
  const buildGuide = await readFile(new URL('BUILD-GUIDE.md', root), 'utf8');

  assert.equal(packageJson.scripts['validate:release'], 'node scripts/validate-release.mjs');
  assert.match(releaseValidation, /assertReleaseReadinessChecklist/);
  assert.match(releaseStrategy, /docs\/release-readiness\.md/);
  assert.match(buildGuide, /docs\/release-readiness\.md/);
});
