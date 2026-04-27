#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  assertReleaseArtifactMatrix,
  createDebugArtifactBuildManifest,
  createDebugArtifactBuildManifests,
  listDebugArtifactBuilds
} from '../src/foundation/release-artifacts.mjs';

function usage() {
  return [
    'Usage: node scripts/build-debug-artifacts.mjs [options]',
    '',
    'Options:',
    '  --target <id|all>        Debug artifact build id to write. Defaults to all.',
    '  --output <directory>     Output directory. Defaults to dist/debug-artifacts.',
    '  --build-id <id>          Build identifier. Defaults to GITHUB_SHA or local-debug.',
    '  --generated-at <iso>     Manifest timestamp. Defaults to the current time.',
    '  --help                   Show this help.'
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    target: 'all',
    output: 'dist/debug-artifacts',
    buildId: process.env.GITHUB_SHA ?? 'local-debug',
    generatedAt: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      return { ...options, help: true };
    }

    if (['--target', '--output', '--build-id', '--generated-at'].includes(arg)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }

      if (arg === '--target') {
        options.target = value;
      } else if (arg === '--output') {
        options.output = value;
      } else if (arg === '--build-id') {
        options.buildId = value;
      } else {
        options.generatedAt = value;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function manifestsForTarget(target, options) {
  if (target === 'all') {
    return createDebugArtifactBuildManifests(options);
  }

  const debugBuildIds = new Set(listDebugArtifactBuilds().map((build) => build.id));
  if (!debugBuildIds.has(target)) {
    throw new Error(`Unsupported debug artifact target: ${target}. Supported targets: ${[...debugBuildIds].join(', ')}`);
  }

  return [createDebugArtifactBuildManifest(target, options)];
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(usage());
  process.exit(0);
}

assertReleaseArtifactMatrix();

const outputDir = resolve(options.output);
const manifests = manifestsForTarget(options.target, {
  buildId: options.buildId,
  generatedAt: options.generatedAt
});

await mkdir(outputDir, { recursive: true });

for (const manifest of manifests) {
  await writeFile(`${outputDir}/${manifest.id}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log(`Wrote ${manifests.length} debug artifact manifest(s) to ${outputDir}.`);
