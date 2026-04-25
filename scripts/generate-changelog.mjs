#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import { prependReleaseNotes, renderReleaseNotes } from '../src/foundation/changelog.mjs';

const args = parseArgs(process.argv.slice(2));
const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const version = args.version ?? packageJson.version;
const date = args.date ?? new Date().toISOString().slice(0, 10);
const changelogPath = new URL(args.output ?? 'CHANGELOG.md', root);
const entries = args.input ? await readEntriesFromFile(args.input) : listMergedPullRequests(args);
const releaseNotes = renderReleaseNotes({ version, date, entries });

if (args.check) {
  assertChangelogContains(await readOptional(changelogPath), releaseNotes, version);
  console.log(`Changelog contains reviewed release notes for ${version}.`);
} else if (args.write) {
  const existing = await readOptional(changelogPath);
  await writeFile(changelogPath, prependReleaseNotes(existing, releaseNotes));
  console.log(`Wrote release notes for ${version} to ${args.output ?? 'CHANGELOG.md'}.`);
} else {
  process.stdout.write(releaseNotes);
}

function parseArgs(argv) {
  const parsed = { write: false, check: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--check') {
      parsed.check = true;
    } else if (arg === '--repo') {
      parsed.repo = requiredValue(argv, index += 1, '--repo');
    } else if (arg === '--version') {
      parsed.version = requiredValue(argv, index += 1, '--version');
    } else if (arg === '--date') {
      parsed.date = requiredValue(argv, index += 1, '--date');
    } else if (arg === '--since-tag') {
      parsed.sinceTag = requiredValue(argv, index += 1, '--since-tag');
    } else if (arg === '--base') {
      parsed.base = requiredValue(argv, index += 1, '--base');
    } else if (arg === '--input') {
      parsed.input = requiredValue(argv, index += 1, '--input');
    } else if (arg === '--output') {
      parsed.output = requiredValue(argv, index += 1, '--output');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.write && parsed.check) {
    throw new Error('Choose either --write or --check, not both.');
  }

  return parsed;
}

function requiredValue(argv, index, flag) {
  if (!argv[index]) {
    throw new Error(`${flag} requires a value`);
  }

  return argv[index];
}

async function readEntriesFromFile(relativePath) {
  const raw = await readFile(new URL(relativePath, root), 'utf8');
  return JSON.parse(raw);
}

async function readOptional(url) {
  try {
    return await readFile(url, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function listMergedPullRequests(options) {
  const repo = options.repo ?? githubRepository();
  const search = [`repo:${repo}`, 'is:pr', 'is:merged'];

  if (options.sinceTag) {
    search.push(`merged:>=${tagDate(options.sinceTag)}`);
  }

  const result = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'merged',
      '--base',
      options.base ?? 'main',
      '--limit',
      '100',
      '--search',
      search.join(' '),
      '--json',
      'number,title,url,body,labels,mergeCommit'
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to list merged pull requests: ${result.stderr || result.stdout}`);
  }

  return JSON.parse(result.stdout).map((entry) => ({
    ...entry,
    mergeCommitMessage: entry.mergeCommit?.message ?? ''
  }));
}

function githubRepository() {
  const result = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Unable to detect GitHub repository: ${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

function tagDate(tag) {
  const result = spawnSync('git', ['log', '-1', '--format=%cs', tag], { encoding: 'utf8' });

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to resolve date for tag ${tag}`);
  }

  return result.stdout.trim();
}

function assertChangelogContains(changelog, releaseNotes, version) {
  if (!changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md must include reviewed release notes for ${version}`);
  }

  const requiredLines = releaseNotes
    .split('\n')
    .filter((line) => line.startsWith('- ') || line.startsWith('> Review required'));

  for (const line of requiredLines) {
    if (!changelog.includes(line)) {
      throw new Error(`CHANGELOG.md is missing generated line: ${line}`);
    }
  }
}
