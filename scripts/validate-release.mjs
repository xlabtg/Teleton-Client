#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RELEASE_METADATA, VERSION_SOURCE_OF_TRUTH, isStableSemver } from '../src/foundation/release-metadata.mjs';
import { assertReleaseArtifactMatrix, listReleaseArtifactTargets } from '../src/foundation/release-artifacts.mjs';
import {
  assertReleaseReadinessChecklist,
  listReleaseDocumentationInventory,
  listReleaseReadinessChecklist
} from '../src/foundation/release-readiness.mjs';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
const releaseWorkflow = await readFile(new URL('.github/workflows/release-validation.yml', root), 'utf8');
const releasePackaging = await readFile(new URL('docs/release-packaging.md', root), 'utf8');
const releaseReadiness = await readFile(new URL('docs/release-readiness.md', root), 'utf8');

assert.equal(VERSION_SOURCE_OF_TRUTH, 'package.json', 'package.json must be the documented version source of truth');
assert.equal(RELEASE_METADATA.sourceOfTruth, VERSION_SOURCE_OF_TRUTH, 'release metadata must name its source of truth');
assert.equal(RELEASE_METADATA.name, packageJson.name, 'release metadata name must match package.json');
assert.equal(RELEASE_METADATA.version, packageJson.version, 'release metadata version must match package.json');
assert.equal(RELEASE_METADATA.private, packageJson.private, 'release metadata private flag must match package.json');
assert.equal(isStableSemver(packageJson.version), true, 'package.json version must be stable semantic version MAJOR.MINOR.PATCH');
assert.equal(packageJson.private, true, 'foundation package must remain private until reviewed release automation is added');
assert.match(changelog, /^# Changelog/m, 'CHANGELOG.md must be present for reviewed release notes');
assert.match(changelog, /reviewed before publication/i, 'CHANGELOG.md must document manual review before publishing');
assert.equal(
  packageJson.scripts['build:debug-artifacts'],
  'node scripts/build-debug-artifacts.mjs',
  'package.json must expose the public debug artifact manifest build command'
);
assertReleaseArtifactMatrix();
assertReleaseReadinessChecklist();
assert.match(releaseWorkflow, /debug-artifacts:/, 'release workflow must build debug artifact manifests');
assert.match(releaseWorkflow, /npm run build:debug-artifacts/, 'release workflow must run the debug artifact builder');
assert.match(releaseWorkflow, /actions\/upload-artifact@v4/, 'release workflow must upload debug artifact manifests');
assert.doesNotMatch(releaseWorkflow, /\bsecrets\./, 'pull request release workflow must not reference signing secrets');
assert.match(releasePackaging, /pull requests? do not receive signing secrets/i);
assert.match(releasePackaging, /protected environment/i);

for (const target of listReleaseArtifactTargets()) {
  assert.match(releasePackaging, new RegExp(target.release.format, 'i'), `${target.release.format} must be documented`);
  assert.match(releasePackaging, new RegExp(target.debugBuild.id, 'i'), `${target.debugBuild.id} must be documented`);
}

assert.match(releaseReadiness, /^# Release Readiness$/m, 'release readiness documentation must exist');
assert.match(releaseReadiness, /human release approval/i, 'release readiness must require human approval');
assert.match(releaseReadiness, /source publication/i, 'release readiness must cover source publication obligations');
assert.match(releaseReadiness, /Documentation Completeness/i, 'release readiness must cover documentation completeness');

for (const item of listReleaseReadinessChecklist()) {
  assert.match(releaseReadiness, new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

for (const entry of listReleaseDocumentationInventory()) {
  const sourcePattern = entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const testPattern = entry.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(releaseReadiness, new RegExp(sourcePattern), `${entry.source} must appear in release readiness docs`);
  assert.match(releaseReadiness, new RegExp(testPattern), `${entry.test} must appear in release readiness docs`);
}

console.log(`Release validation passed for ${packageJson.name}@${packageJson.version}.`);
