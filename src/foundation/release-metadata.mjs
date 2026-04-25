export const VERSION_SOURCE_OF_TRUTH = 'package.json';

export const RELEASE_METADATA = Object.freeze({
  name: 'teleton-client',
  version: '0.1.0',
  private: true,
  sourceOfTruth: VERSION_SOURCE_OF_TRUTH
});

const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseStableSemver(version) {
  const match = STABLE_SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new TypeError(`Expected stable semantic version MAJOR.MINOR.PATCH, received: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function isStableSemver(version) {
  return STABLE_SEMVER_PATTERN.test(version);
}

export function classifyVersionBump(previousVersion, nextVersion) {
  const previous = parseStableSemver(previousVersion);
  const next = parseStableSemver(nextVersion);

  if (next.major > previous.major) {
    if (next.minor !== 0 || next.patch !== 0) {
      throw new RangeError('Major version bumps must reset minor and patch to 0');
    }
    return 'major';
  }

  if (next.major < previous.major) {
    throw new RangeError('Version must increase');
  }

  if (next.minor > previous.minor) {
    if (next.patch !== 0) {
      throw new RangeError('Minor version bumps must reset patch to 0');
    }
    return 'minor';
  }

  if (next.minor < previous.minor) {
    throw new RangeError('Version must increase');
  }

  if (next.patch > previous.patch) {
    return 'patch';
  }

  throw new RangeError('Version must increase');
}
