#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const LABEL_COLORS = {
  agent: '7057ff',
  android: '3ddc84',
  'ai-solvable': '0e8a16',
  ci: '1d76db',
  compliance: 'fbca04',
  connectivity: '5319e7',
  desktop: 'bfd4f2',
  documentation: '0075ca',
  e2e: 'd4c5f9',
  foundation: 'c2e0c6',
  'good first issue': '7057ff',
  'human-review-required': 'b60205',
  infrastructure: 'c5def5',
  ios: 'bfdadc',
  ipc: '5319e7',
  license: 'fbca04',
  platform: 'd876e3',
  privacy: 'b60205',
  proxy: '0e8a16',
  release: '0052cc',
  runtime: 'd4c5f9',
  security: 'b60205',
  settings: 'fbca04',
  swap: 'fef2c0',
  sync: 'c5def5',
  tdlib: '1d76db',
  testing: '0e8a16',
  ton: '00bcd4',
  ui: 'f9d0c4',
  wallet: '00bcd4'
};

const args = parseArgs(process.argv.slice(2));
const manifest = await loadManifest(args.manifest ?? 'config/epic-subtasks.json');
const repo = args.repo ?? manifest.repository;
const selectedSubtasks = filterSubtasks(manifest.subtasks, args);

if (args.create) {
  ensureGhAvailable();
  await createIssues(repo, manifest, selectedSubtasks, args);
} else {
  printDryRun(repo, manifest, selectedSubtasks);
}

function parseArgs(argv) {
  const parsed = { dryRun: false, create: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--create') {
      parsed.create = true;
    } else if (arg === '--repo') {
      parsed.repo = requiredValue(argv, index += 1, '--repo');
    } else if (arg === '--manifest') {
      parsed.manifest = requiredValue(argv, index += 1, '--manifest');
    } else if (arg === '--phase') {
      parsed.phase = requiredValue(argv, index += 1, '--phase');
    } else if (arg === '--limit') {
      parsed.limit = Number.parseInt(requiredValue(argv, index += 1, '--limit'), 10);
    } else if (arg === '--skip-label-create') {
      parsed.skipLabelCreate = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.dryRun && parsed.create) {
    throw new Error('Choose either --dry-run or --create, not both.');
  }

  return parsed;
}

function requiredValue(argv, index, flag) {
  if (!argv[index]) {
    throw new Error(`${flag} requires a value`);
  }
  return argv[index];
}

async function loadManifest(relativePath) {
  const raw = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  return JSON.parse(raw);
}

function filterSubtasks(subtasks, options) {
  let filtered = [...subtasks].sort((left, right) => left.priority - right.priority);

  if (options.phase) {
    filtered = filtered.filter((subtask) => subtask.phase === options.phase);
  }

  if (Number.isInteger(options.limit)) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

function printDryRun(repo, manifest, subtasks) {
  console.log(`Repository: ${repo}`);
  console.log(`Parent issue: #${manifest.parentIssue}`);
  console.log(`Issues to create: ${subtasks.length}`);

  for (const subtask of subtasks) {
    console.log(`${String(subtask.priority).padStart(2, '0')} ${subtask.title}`);
    console.log(`   phase: ${subtask.phase}`);
    console.log(`   labels: ${subtask.labels.join(', ')}`);
    if (subtask.issueNumber && subtask.issueUrl) {
      console.log(`   published: #${subtask.issueNumber} ${subtask.issueUrl}`);
    }
  }
}

function ensureGhAvailable() {
  const result = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('GitHub CLI is required for --create.');
  }
}

async function createIssues(repo, manifest, subtasks, options) {
  const existingIssues = listExistingIssues(repo);
  const existingTitles = new Map(existingIssues.map((issue) => [issue.title, issue.number]));
  const availableLabels = ensureLabels(repo, subtasks, options);

  for (const subtask of subtasks) {
    if (existingTitles.has(subtask.title)) {
      console.log(`skip #${existingTitles.get(subtask.title)} ${subtask.title}`);
      continue;
    }

    const body = renderIssueBody(manifest, subtask);
    const createArgs = [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      subtask.title,
      '--body',
      body
    ];
    const labels = subtask.labels.filter((label) => availableLabels.has(label));

    if (labels.length > 0) {
      createArgs.push('--label', labels.join(','));
    }

    const result = spawnSync(
      'gh',
      createArgs,
      { encoding: 'utf8' }
    );

    if (result.status !== 0) {
      throw new Error(`Failed to create ${subtask.title}: ${result.stderr || result.stdout}`);
    }

    console.log(result.stdout.trim());
  }
}

function listExistingIssues(repo) {
  const result = spawnSync(
    'gh',
    ['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'number,title'],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to list existing issues: ${result.stderr || result.stdout}`);
  }

  return JSON.parse(result.stdout);
}

function ensureLabels(repo, subtasks, options) {
  const result = spawnSync('gh', ['label', 'list', '--repo', repo, '--limit', '500', '--json', 'name'], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Failed to list labels: ${result.stderr || result.stdout}`);
  }

  const existingLabels = new Set(JSON.parse(result.stdout).map((label) => label.name));
  const neededLabels = new Set(subtasks.flatMap((subtask) => subtask.labels));

  for (const label of neededLabels) {
    if (existingLabels.has(label)) {
      continue;
    }

    if (options.skipLabelCreate) {
      console.warn(`label missing and skipped: ${label}`);
      continue;
    }

    const createResult = spawnSync(
      'gh',
      [
        'label',
        'create',
        label,
        '--repo',
        repo,
        '--color',
        LABEL_COLORS[label] ?? 'ededed',
        '--description',
        `Teleton Client ${label} work`
      ],
      { encoding: 'utf8' }
    );

    if (createResult.status !== 0) {
      throw new Error(
        `Failed to create label ${label}. Confirm this account can write labels in ${repo}, ` +
          `or rerun with --skip-label-create if labels already exist. ${createResult.stderr || createResult.stdout}`
      );
    }

    existingLabels.add(label);
  }

  return existingLabels;
}

function renderIssueBody(manifest, subtask) {
  return [
    `Parent epic: #${manifest.parentIssue}`,
    '',
    `Phase: ${subtask.phase}`,
    `Priority: ${subtask.priority}`,
    '',
    '## Scope',
    subtask.scope,
    '',
    '## Implementation Steps',
    ...subtask.implementationSteps.map((step) => `- ${step}`),
    '',
    '## Acceptance Criteria',
    ...subtask.acceptanceCriteria.map((criterion) => `- [ ] ${criterion}`),
    '',
    '## Automation',
    `Generated from ${manifest.sourceIssueUrl} using \`scripts/decompose-epic.mjs\`.`
  ].join('\n');
}
