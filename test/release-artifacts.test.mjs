import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('release artifact matrix covers mobile and desktop package formats with unsigned debug CI builds', async () => {
  const release = await import('../src/foundation/release-artifacts.mjs');
  const targets = release.listReleaseArtifactTargets();
  const debugBuilds = release.listDebugArtifactBuilds();

  assert.deepEqual(
    targets.map((target) => target.id),
    ['android-apk', 'ios-ipa', 'macos-dmg', 'windows-exe', 'linux-appimage']
  );
  assert.deepEqual(
    targets.map((target) => target.release.format),
    ['apk', 'ipa', 'dmg', 'exe', 'AppImage']
  );
  assert.deepEqual(
    debugBuilds.map((build) => build.id),
    [
      'android-debug-apk',
      'ios-debug-app-bundle',
      'desktop-macos-debug-app-bundle',
      'desktop-windows-debug-exe',
      'desktop-linux-debug-executable'
    ]
  );

  for (const target of targets) {
    assert.equal(target.signing.availableInPullRequests, false, `${target.id} signing must stay out of PRs`);
    assert.equal(target.signing.environment, 'release-signing', `${target.id} must use the protected signing environment`);
  }

  for (const build of debugBuilds) {
    assert.equal(build.publicCi.enabled, true, `${build.id} should be built by public CI`);
    assert.equal(build.publicCi.signsArtifacts, false, `${build.id} must be unsigned in public CI`);
    assert.equal(build.publicCi.usesSigningSecrets, false, `${build.id} must not use signing secrets`);
    assert.ok(build.artifact.path, `${build.id} must describe the debug artifact path`);
  }

  assert.doesNotThrow(() => release.assertReleaseArtifactMatrix());
});

test('debug artifact build script writes CI manifest artifacts without signing material', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'teleton-debug-artifacts-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [
      'scripts/build-debug-artifacts.mjs',
      '--target',
      'android-debug-apk',
      '--build-id',
      'ci-123',
      '--generated-at',
      '2026-04-27T00:00:00.000Z',
      '--output',
      outputDir
    ],
    {
      cwd: new URL('.', root),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const manifest = JSON.parse(await readFile(join(outputDir, 'android-debug-apk.json'), 'utf8'));
  assert.equal(manifest.id, 'android-debug-apk');
  assert.equal(manifest.buildId, 'ci-123');
  assert.equal(manifest.generatedAt, '2026-04-27T00:00:00.000Z');
  assert.equal(manifest.artifact.path, 'android/app/build/outputs/apk/debug/app-debug.apk');
  assert.equal(manifest.publicCi.usesSigningSecrets, false);
  assert.equal(manifest.releaseTarget.release.format, 'apk');
});

test('release workflows and docs keep signing separate from pull request debug artifacts', async () => {
  const workflow = await readFile(new URL('.github/workflows/release-validation.yml', root), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const releasePackaging = await readFile(new URL('docs/release-packaging.md', root), 'utf8');
  const releaseStrategy = await readFile(new URL('docs/release-strategy.md', root), 'utf8');

  assert.equal(packageJson.scripts['build:debug-artifacts'], 'node scripts/build-debug-artifacts.mjs');
  assert.match(workflow, /debug-artifacts:/, 'release validation must include a debug artifact job');
  assert.match(workflow, /npm run build:debug-artifacts/, 'CI must build debug artifact manifests');
  assert.match(workflow, /actions\/upload-artifact@v4/, 'CI must upload debug artifact evidence');
  assert.doesNotMatch(workflow, /\bsecrets\./, 'pull request workflow must not reference GitHub secrets');

  for (const runner of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.match(workflow, new RegExp(runner), `CI must cover ${runner} for supported debug targets`);
  }

  for (const format of ['APK', 'IPA', 'DMG', 'EXE', 'AppImage']) {
    assert.match(releasePackaging, new RegExp(format), `release packaging docs must list ${format}`);
  }

  assert.match(releasePackaging, /protected environment/i, 'docs must route signing through protected environments');
  assert.match(releasePackaging, /pull requests? do not receive signing secrets/i);
  assert.match(releaseStrategy, /docs\/release-packaging\.md/);
});
