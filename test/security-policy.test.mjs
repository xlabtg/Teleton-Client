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

test('security policy publishes private vulnerability reporting and disclosure expectations', async () => {
  const security = await readFile(pathFor('SECURITY.md'), 'utf8');
  const contributing = await readFile(pathFor('CONTRIBUTING.md'), 'utf8');
  const releaseStrategy = await readFile(pathFor('docs/release-strategy.md'), 'utf8');

  assert.match(security, /^# Security Policy$/m);
  assert.doesNotMatch(security, /Security Policy Draft/i);

  assertIncludesAll(
    security,
    [
      /^## Supported Versions$/m,
      /^## Reporting a Vulnerability$/m,
      /^## Private Report Expectations$/m,
      /^## Disclosure Timeline$/m,
      /^## Maintainer Review$/m
    ],
    'SECURITY.md'
  );

  assertIncludesAll(
    security,
    [
      /GitHub private security advisories/i,
      /do not open a public issue/i,
      /supported version/i,
      /private message content/i,
      /credential values/i,
      /acknowledge/i,
      /coordinated disclosure/i,
      /human maintainer/i,
      /before release/i
    ],
    'security policy acceptance criteria'
  );

  assert.match(contributing, /SECURITY\.md/, 'CONTRIBUTING.md must link to the security policy');
  assert.match(releaseStrategy, /SECURITY\.md/, 'release documentation must link to the security policy');
  assert.match(releaseStrategy, /security policy/i, 'release documentation must call out policy review');
});
