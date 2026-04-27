import { createAndroidDebugBuildArtifact } from '../platform/android-wrapper.mjs';
import { createDesktopDebugBuildArtifact, describeDesktopPackagingPlan } from '../platform/desktop-wrapper.mjs';
import { createIosDebugBuildArtifact } from '../platform/ios-wrapper.mjs';

export const RELEASE_SIGNING_ENVIRONMENT = 'release-signing';

const REQUIRED_TARGET_IDS = Object.freeze(['android-apk', 'ios-ipa', 'macos-dmg', 'windows-exe', 'linux-appimage']);
const REQUIRED_RELEASE_FORMATS = Object.freeze(['apk', 'ipa', 'dmg', 'exe', 'AppImage']);
const REQUIRED_DEBUG_BUILD_IDS = Object.freeze([
  'android-debug-apk',
  'ios-debug-app-bundle',
  'desktop-macos-debug-app-bundle',
  'desktop-windows-debug-exe',
  'desktop-linux-debug-executable'
]);

const desktopPackaging = describeDesktopPackagingPlan();

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function signingPlan({ requiredInputs, reviewerChecklist }) {
  return {
    required: true,
    environment: RELEASE_SIGNING_ENVIRONMENT,
    availableInPullRequests: false,
    requiredInputs,
    reviewerChecklist
  };
}

function publicCiPlan({ runner, command }) {
  return {
    enabled: true,
    runner,
    command,
    signsArtifacts: false,
    usesSigningSecrets: false,
    uploadsManifest: true
  };
}

export const RELEASE_ARTIFACT_MATRIX = deepFreeze([
  {
    id: 'android-apk',
    platform: 'android',
    os: 'android',
    displayName: 'Android APK',
    release: {
      format: 'apk',
      path: 'android/app/build/outputs/apk/release/app-release.apk',
      builder: 'Gradle Android Plugin assembleRelease',
      artifactName: 'TeletonClient-${version}-android-${arch}.apk'
    },
    debugBuild: {
      id: 'android-debug-apk',
      artifact: createAndroidDebugBuildArtifact(),
      publicCi: publicCiPlan({
        runner: 'ubuntu-latest',
        command: 'npm run build:debug-artifacts -- --target android-debug-apk'
      })
    },
    signing: signingPlan({
      requiredInputs: ['android-keystore-ref', 'android-key-alias-ref', 'android-key-password-ref'],
      reviewerChecklist: [
        'Resolve keystore material only inside the protected release-signing environment.',
        'Confirm app id dev.teleton.client and package name dev.teleton.client match reviewed metadata.',
        'Attach the unsigned debug APK manifest from public CI to the release review.'
      ]
    })
  },
  {
    id: 'ios-ipa',
    platform: 'ios',
    os: 'ios',
    displayName: 'iOS IPA',
    release: {
      format: 'ipa',
      path: 'ios/build/ipa/TeletonClient.ipa',
      builder: 'xcodebuild archive and exportArchive',
      artifactName: 'TeletonClient-${version}-ios-${arch}.ipa'
    },
    debugBuild: {
      id: 'ios-debug-app-bundle',
      artifact: createIosDebugBuildArtifact(),
      publicCi: publicCiPlan({
        runner: 'macos-latest',
        command: 'npm run build:debug-artifacts -- --target ios-debug-app-bundle'
      })
    },
    signing: signingPlan({
      requiredInputs: ['apple-team-id-ref', 'apple-signing-certificate-ref', 'app-store-connect-profile-ref'],
      reviewerChecklist: [
        'Resolve Apple signing identities only inside the protected release-signing environment.',
        'Confirm entitlements, APNs topics, and App Store review notes match the reviewed iOS wrapper contract.',
        'Attach the unsigned simulator app manifest from public CI to the release review.'
      ]
    })
  },
  {
    id: 'macos-dmg',
    platform: 'desktop',
    os: 'macos',
    displayName: 'macOS DMG',
    release: {
      format: desktopPackaging.macos.format,
      path: 'desktop/dist/macos/Teleton Client-${version}-macos-${arch}.dmg',
      builder: `electron-builder ${desktopPackaging.macos.builderTarget}`,
      artifactName: desktopPackaging.macos.artifactName
    },
    debugBuild: {
      id: 'desktop-macos-debug-app-bundle',
      artifact: createDesktopDebugBuildArtifact({ os: 'macos' }),
      publicCi: publicCiPlan({
        runner: 'macos-latest',
        command: 'npm run build:debug-artifacts -- --target desktop-macos-debug-app-bundle'
      })
    },
    signing: signingPlan({
      requiredInputs: ['developer-id-application-ref', 'notarization-apple-id-ref', 'notarization-team-id-ref'],
      reviewerChecklist: [
        'Sign the app bundle with Developer ID inside the protected release-signing environment.',
        'Notarize the DMG before distribution and attach notarization evidence to the release review.',
        'Attach the unsigned macOS debug app manifest from public CI to the release review.'
      ]
    })
  },
  {
    id: 'windows-exe',
    platform: 'desktop',
    os: 'windows',
    displayName: 'Windows EXE installer',
    release: {
      format: desktopPackaging.windows.format,
      path: 'desktop/dist/windows/Teleton Client Setup ${version}-${arch}.exe',
      builder: `electron-builder ${desktopPackaging.windows.builderTarget}`,
      artifactName: desktopPackaging.windows.artifactName
    },
    debugBuild: {
      id: 'desktop-windows-debug-exe',
      artifact: createDesktopDebugBuildArtifact({ os: 'windows' }),
      publicCi: publicCiPlan({
        runner: 'windows-latest',
        command: 'npm run build:debug-artifacts -- --target desktop-windows-debug-exe'
      })
    },
    signing: signingPlan({
      requiredInputs: ['authenticode-certificate-ref', 'timestamp-service-url-ref'],
      reviewerChecklist: [
        'Resolve Authenticode certificate material only inside the protected release-signing environment.',
        'Timestamp the NSIS installer before update or installer distribution.',
        'Attach the unsigned Windows debug executable manifest from public CI to the release review.'
      ]
    })
  },
  {
    id: 'linux-appimage',
    platform: 'desktop',
    os: 'linux',
    displayName: 'Linux AppImage',
    release: {
      format: desktopPackaging.linux.format,
      path: 'desktop/dist/linux/Teleton Client-${version}-${arch}.AppImage',
      builder: `electron-builder ${desktopPackaging.linux.builderTarget}`,
      artifactName: desktopPackaging.linux.artifactName
    },
    debugBuild: {
      id: 'desktop-linux-debug-executable',
      artifact: createDesktopDebugBuildArtifact({ os: 'linux' }),
      publicCi: publicCiPlan({
        runner: 'ubuntu-latest',
        command: 'npm run build:debug-artifacts -- --target desktop-linux-debug-executable'
      })
    },
    signing: signingPlan({
      requiredInputs: ['appimage-signature-ref'],
      reviewerChecklist: [
        'Build AppImage release output in the protected release-signing environment before publication.',
        'Apply optional AppImage signature only after license and security review complete.',
        'Attach the unsigned Linux debug executable manifest from public CI to the release review.'
      ]
    })
  }
]);

function targetByDebugBuildId(debugBuildId, matrix = RELEASE_ARTIFACT_MATRIX) {
  return matrix.find((target) => target.debugBuild.id === debugBuildId);
}

export function listReleaseArtifactTargets() {
  return clone(RELEASE_ARTIFACT_MATRIX);
}

export function listDebugArtifactBuilds() {
  return RELEASE_ARTIFACT_MATRIX.map((target) => ({
    ...clone(target.debugBuild),
    releaseTargetId: target.id,
    releaseFormat: target.release.format
  }));
}

export function getReleaseArtifactTarget(targetId) {
  const target = RELEASE_ARTIFACT_MATRIX.find((entry) => entry.id === targetId);

  if (!target) {
    throw new Error(`Unsupported release artifact target: ${targetId}`);
  }

  return clone(target);
}

export function getDebugArtifactBuild(debugBuildId) {
  const target = targetByDebugBuildId(debugBuildId);

  if (!target) {
    throw new Error(`Unsupported debug artifact build: ${debugBuildId}`);
  }

  return {
    ...clone(target.debugBuild),
    releaseTargetId: target.id,
    releaseFormat: target.release.format
  };
}

export function validateReleaseArtifactMatrix(matrix = RELEASE_ARTIFACT_MATRIX) {
  const errors = [];

  if (!Array.isArray(matrix)) {
    return ['Release artifact matrix must be an array.'];
  }

  const targetIds = matrix.map((target) => target.id);
  const releaseFormats = matrix.map((target) => target.release?.format);
  const debugBuildIds = matrix.map((target) => target.debugBuild?.id);

  if (JSON.stringify(targetIds) !== JSON.stringify(REQUIRED_TARGET_IDS)) {
    errors.push(`Release artifact targets must be ${REQUIRED_TARGET_IDS.join(', ')}.`);
  }

  if (JSON.stringify(releaseFormats) !== JSON.stringify(REQUIRED_RELEASE_FORMATS)) {
    errors.push(`Release formats must be ${REQUIRED_RELEASE_FORMATS.join(', ')}.`);
  }

  if (JSON.stringify(debugBuildIds) !== JSON.stringify(REQUIRED_DEBUG_BUILD_IDS)) {
    errors.push(`Debug build ids must be ${REQUIRED_DEBUG_BUILD_IDS.join(', ')}.`);
  }

  for (const target of matrix) {
    const label = target?.id ?? '<unknown>';

    if (!target?.release?.path) {
      errors.push(`${label} must declare a release artifact path.`);
    }

    if (!target?.debugBuild?.artifact?.path) {
      errors.push(`${label} must declare a debug artifact path.`);
    }

    if (target?.debugBuild?.publicCi?.enabled !== true) {
      errors.push(`${label} must enable public CI debug artifact builds.`);
    }

    if (target?.debugBuild?.publicCi?.signsArtifacts !== false) {
      errors.push(`${label} public CI builds must stay unsigned.`);
    }

    if (target?.debugBuild?.publicCi?.usesSigningSecrets !== false) {
      errors.push(`${label} public CI builds must not use signing secrets.`);
    }

    if (target?.signing?.environment !== RELEASE_SIGNING_ENVIRONMENT) {
      errors.push(`${label} signing must use the ${RELEASE_SIGNING_ENVIRONMENT} environment.`);
    }

    if (target?.signing?.availableInPullRequests !== false) {
      errors.push(`${label} signing material must not be available to pull requests.`);
    }
  }

  return errors;
}

export function assertReleaseArtifactMatrix(matrix = RELEASE_ARTIFACT_MATRIX) {
  const errors = validateReleaseArtifactMatrix(matrix);

  if (errors.length > 0) {
    throw new Error(`Invalid release artifact matrix:\n- ${errors.join('\n- ')}`);
  }

  return true;
}

export function createDebugArtifactBuildManifest(debugBuildId, options = {}) {
  const target = targetByDebugBuildId(debugBuildId);

  if (!target) {
    throw new Error(`Unsupported debug artifact build: ${debugBuildId}`);
  }

  return {
    schemaVersion: 1,
    id: target.debugBuild.id,
    releaseTargetId: target.id,
    buildId: String(options.buildId ?? 'local-debug'),
    generatedAt: String(options.generatedAt ?? new Date().toISOString()),
    artifact: clone(target.debugBuild.artifact),
    publicCi: clone(target.debugBuild.publicCi),
    releaseTarget: {
      id: target.id,
      displayName: target.displayName,
      platform: target.platform,
      os: target.os,
      release: clone(target.release),
      signing: clone(target.signing)
    }
  };
}

export function createDebugArtifactBuildManifests(options = {}) {
  return REQUIRED_DEBUG_BUILD_IDS.map((debugBuildId) => createDebugArtifactBuildManifest(debugBuildId, options));
}
