import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathFor(relativePath), 'utf8'));
}

test('foundation artifacts required by issue 1 are present', () => {
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
    'docs/tdlib-adapter.md'
  ];

  for (const requiredFile of requiredFiles) {
    assert.equal(existsSync(pathFor(requiredFile)), true, `${requiredFile} should exist`);
  }
});

test('GitHub templates collect reproducible, secret-free contribution details', async () => {
  const templateFiles = [
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_task.yml',
    '.github/ISSUE_TEMPLATE/subtask.yml',
    '.github/pull_request_template.md'
  ];

  for (const templateFile of templateFiles) {
    const content = await readFile(pathFor(templateFile), 'utf8');
    assert.match(content, /test|reproduc/i, `${templateFile} should prompt for validation details`);
    assert.match(content, /secret|credential|token/i, `${templateFile} should warn against secrets`);
  }

  const bugTemplate = await readFile(pathFor('.github/ISSUE_TEMPLATE/bug_report.yml'), 'utf8');
  assert.match(bugTemplate, /Expected behavior/i);
  assert.match(bugTemplate, /Actual behavior/i);

  const featureTemplate = await readFile(pathFor('.github/ISSUE_TEMPLATE/feature_task.yml'), 'utf8');
  assert.match(featureTemplate, /Acceptance criteria/i);

  const guide = await readFile(pathFor('docs/contributing-templates.md'), 'utf8');
  assert.match(guide, /feature task/i);
  assert.match(guide, /bug report/i);
  assert.match(guide, /pull request/i);
});

test('epic backlog decomposes issue 1 into prioritized phases', async () => {
  const manifest = await readJson('config/epic-subtasks.json');

  assert.equal(manifest.parentIssue, 1);
  assert.equal(manifest.subtasks.length, 63, 'expected the full 63-task epic decomposition');

  const requiredPhases = [
    'Infrastructure and Core',
    'Connectivity Layer',
    'Teleton Agent Integration',
    'TON Blockchain Module',
    'Platform Wrappers',
    'Security and Licenses',
    'Testing and Release'
  ];

  const phases = new Set(manifest.subtasks.map((subtask) => subtask.phase));
  for (const phase of requiredPhases) {
    assert.equal(phases.has(phase), true, `missing phase: ${phase}`);
  }

  const titles = manifest.subtasks.map((subtask) => subtask.title);
  assert.equal(new Set(titles).size, titles.length, 'subtask titles must be unique');

  const requiredIds = Array.from({ length: 63 }, (_, index) => String(index + 1).padStart(3, '0'));
  assert.deepEqual(manifest.subtasks.map((subtask) => subtask.id), requiredIds);

  const issueNumbers = manifest.subtasks.map((subtask) => subtask.issueNumber);
  assert.equal(new Set(issueNumbers).size, issueNumbers.length, 'published issue numbers must be unique');

  for (const subtask of manifest.subtasks) {
    assert.ok(Number.isInteger(subtask.priority), `${subtask.title} needs integer priority`);
    assert.ok(Number.isInteger(subtask.issueNumber), `${subtask.title} needs a published issue number`);
    assert.equal(
      subtask.issueUrl,
      `https://github.com/${manifest.repository}/issues/${subtask.issueNumber}`,
      `${subtask.title} needs a matching issue URL`
    );
    assert.ok(subtask.acceptanceCriteria.length >= 2, `${subtask.title} needs acceptance criteria`);
    assert.ok(subtask.labels.includes('ai-solvable') || subtask.labels.includes('human-review-required'));
  }
});

test('agent autonomy modes match the epic acceptance criteria', async () => {
  const { AGENT_MODES, normalizeAgentMode } = await import('../src/foundation/agent-settings.mjs');

  assert.deepEqual(AGENT_MODES, ['off', 'local', 'cloud', 'hybrid']);
  assert.equal(normalizeAgentMode('OFF'), 'off');
  assert.equal(normalizeAgentMode('Локально'), 'local');
});

test('proxy settings model covers MTProto and SOCKS5 without hardcoded secrets', async () => {
  const { PROXY_PROTOCOLS, validateProxyConfig } = await import('../src/foundation/proxy-settings.mjs');

  assert.deepEqual(PROXY_PROTOCOLS, ['mtproto', 'socks5']);
  assert.equal(validateProxyConfig({ protocol: 'mtproto', host: 'proxy.example', port: 443, secret: 'env:TELETON_MTPROTO_SECRET' }).valid, true);
  assert.equal(validateProxyConfig({ protocol: 'socks5', host: '127.0.0.1', port: 1080 }).valid, true);
  assert.equal(validateProxyConfig({ protocol: 'mtproto', host: 'proxy.example', port: 443, secret: 'hardcoded-secret' }).valid, false);
});
