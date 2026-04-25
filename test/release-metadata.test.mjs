import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('package version is the documented release metadata source of truth', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const release = await import('../src/foundation/release-metadata.mjs');

  assert.equal(release.VERSION_SOURCE_OF_TRUTH, 'package.json');
  assert.equal(release.RELEASE_METADATA.name, packageJson.name);
  assert.equal(release.RELEASE_METADATA.version, packageJson.version);
  assert.equal(release.RELEASE_METADATA.private, true);
  assert.equal(release.isStableSemver(packageJson.version), true);
});

test('semantic version validation rejects prerelease, build metadata, and invalid bumps', async () => {
  const release = await import('../src/foundation/release-metadata.mjs');

  assert.deepEqual(release.parseStableSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.equal(release.isStableSemver('1.2.3-beta.1'), false);
  assert.equal(release.isStableSemver('1.2.3+build.4'), false);
  assert.equal(release.isStableSemver('01.2.3'), false);

  assert.equal(release.classifyVersionBump('1.2.3', '1.2.4'), 'patch');
  assert.equal(release.classifyVersionBump('1.2.3', '1.3.0'), 'minor');
  assert.equal(release.classifyVersionBump('1.2.3', '2.0.0'), 'major');
  assert.throws(() => release.classifyVersionBump('1.2.3', '1.2.3'), /increase/);
  assert.throws(() => release.classifyVersionBump('1.2.3', '1.3.1'), /reset patch/);
  assert.throws(() => release.classifyVersionBump('1.2.3', '2.1.0'), /reset minor and patch/);
});

test('release workflow does not publish from pull request events', async () => {
  const workflow = await readFile(new URL('.github/workflows/release-validation.yml', root), 'utf8');

  assert.match(workflow, /pull_request:/, 'release validation should run for pull requests');
  assert.doesNotMatch(workflow, /^\s*release:/m, 'validation workflow should not publish packages');
  assert.doesNotMatch(workflow, /npm\s+publish/, 'pull request workflow must not publish packages');
  assert.match(workflow, /npm run validate:release/, 'workflow should validate release metadata');
});
