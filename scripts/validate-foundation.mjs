#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

const requiredFiles = [
  'README.md',
  'PRIVACY.md',
  'BUILD-GUIDE.md',
  'LICENSE',
  '.githooks/pre-commit',
  '.github/workflows/ci.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_task.yml',
  '.github/ISSUE_TEMPLATE/subtask.yml',
  '.github/pull_request_template.md',
  'config/epic-subtasks.json',
  'docs/contributing-templates.md',
  'docs/architecture.md',
  'docs/backlog.md',
  'docs/tdlib-adapter.md'
];

for (const requiredFile of requiredFiles) {
  assert.equal(existsSync(new URL(requiredFile, root)), true, `${requiredFile} is required`);
}

const manifest = JSON.parse(await readFile(new URL('config/epic-subtasks.json', root), 'utf8'));
const requiredPhases = [
  'Infrastructure and Core',
  'Connectivity Layer',
  'Teleton Agent Integration',
  'TON Blockchain Module',
  'Platform Wrappers',
  'Security and Licenses',
  'Testing and Release'
];

assert.equal(manifest.parentIssue, 1, 'manifest must point to issue 1');
assert.equal(manifest.repository, 'xlabtg/Teleton-Client', 'manifest repository must match upstream');
assert.deepEqual(manifest.priorityOrder, requiredPhases, 'priority order must match the epic');
assert.equal(manifest.subtasks.length, 63, 'manifest must include all 63 epic subtasks');

const requiredIds = Array.from({ length: 63 }, (_, index) => String(index + 1).padStart(3, '0'));
assert.deepEqual(
  manifest.subtasks.map((subtask) => subtask.id),
  requiredIds,
  'manifest must keep the complete ordered task id sequence'
);

const ids = new Set();
const titles = new Set();

for (const subtask of manifest.subtasks) {
  assert.ok(subtask.id, 'subtask id is required');
  assert.ok(!ids.has(subtask.id), `duplicate subtask id: ${subtask.id}`);
  ids.add(subtask.id);

  assert.ok(subtask.title.startsWith(`[${subtask.id}]`), `${subtask.id} title must start with the id`);
  assert.ok(!titles.has(subtask.title), `duplicate subtask title: ${subtask.title}`);
  titles.add(subtask.title);

  assert.ok(requiredPhases.includes(subtask.phase), `${subtask.id} has unknown phase`);
  assert.ok(Number.isInteger(subtask.priority), `${subtask.id} priority must be an integer`);
  assert.ok(Number.isInteger(subtask.issueNumber), `${subtask.id} must reference its published GitHub issue`);
  assert.equal(
    subtask.issueUrl,
    `https://github.com/${manifest.repository}/issues/${subtask.issueNumber}`,
    `${subtask.id} issueUrl must match its published issue number`
  );
  assert.ok(Array.isArray(subtask.labels) && subtask.labels.length >= 2, `${subtask.id} needs labels`);
  assert.ok(
    subtask.labels.includes('ai-solvable') || subtask.labels.includes('human-review-required'),
    `${subtask.id} must declare automation or human review`
  );
  assert.ok(Array.isArray(subtask.implementationSteps) && subtask.implementationSteps.length >= 2);
  assert.ok(Array.isArray(subtask.acceptanceCriteria) && subtask.acceptanceCriteria.length >= 2);
}

const docsToScan = ['README.md', 'PRIVACY.md', 'BUILD-GUIDE.md', 'docs/architecture.md', 'docs/tdlib-adapter.md'];
const forbiddenPatterns = [
  /api_hash\s*[:=]\s*['"][^'"]+['"]/i,
  /api_id\s*[:=]\s*\d{4,}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /xox[baprs]-[a-z0-9-]+/i
];

for (const doc of docsToScan) {
  const content = await readFile(new URL(doc, root), 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(content), false, `${doc} appears to contain a secret-like value`);
  }
}

console.log(`Foundation validation passed for ${manifest.subtasks.length} subtasks.`);
