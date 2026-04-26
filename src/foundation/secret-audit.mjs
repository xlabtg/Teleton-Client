import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaultRoot = new URL('../../', import.meta.url);

export const SECRET_AUDIT_PATTERNS = Object.freeze([
  {
    id: 'private-key-block',
    description: 'PEM private key block',
    pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i
  },
  {
    id: 'telegram-api-id',
    description: 'Telegram api_id assignment',
    pattern: /\b(?:api_id|apiId)\s*[:=]\s*['"]?\d{6,}['"]?/i
  },
  {
    id: 'telegram-api-hash',
    description: 'Telegram api_hash assignment',
    pattern: /\b(?:api_hash|apiHash)\s*[:=]\s*['"][a-f0-9]{32}['"]/i
  },
  {
    id: 'telegram-bot-token',
    description: 'Telegram bot token',
    pattern: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/
  },
  {
    id: 'github-token',
    description: 'GitHub access token',
    pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{36,255}\b/
  },
  {
    id: 'slack-token',
    description: 'Slack token',
    pattern: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,}\b/i
  },
  {
    id: 'openai-api-key',
    description: 'OpenAI API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key id',
    pattern: /\bA[KS]IA[0-9A-Z]{16}\b/
  },
  {
    id: 'google-api-key',
    description: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/
  },
  {
    id: 'npm-token',
    description: 'npm access token',
    pattern: /\bnpm_[A-Za-z0-9]{36,}\b/
  }
]);

export const SECRET_AUDIT_ALLOWED_FIXTURES = Object.freeze([
  {
    filePath: 'test/changelog.test.mjs',
    patternId: 'github-token',
    lineIncludes: 'Remove leaked ghp_',
    reason: 'Synthetic GitHub token used to test changelog redaction.'
  },
  {
    filePath: 'test/tdlib-adapter.test.mjs',
    patternId: 'telegram-bot-token',
    lineIncludes: 'network timeout for +1 555 123 4567 token ',
    reason: 'Synthetic Telegram-like token used to test network error redaction.'
  },
  {
    filePath: 'test/tdlib-adapter.test.mjs',
    patternId: 'telegram-bot-token',
    lineIncludes: '/private message body|\\+1 555 123 4567|',
    reason: 'Synthetic Telegram-like token used in a redaction assertion.'
  },
  {
    filePath: 'test/network-error-logger.test.mjs',
    patternId: 'telegram-bot-token',
    lineIncludes: "botToken: '123456:",
    reason: 'Synthetic Telegram-like token used to test network log redaction.'
  }
]);

const IGNORED_DIRECTORIES = Object.freeze([
  '.git/',
  '.next/',
  '.turbo/',
  'build/',
  'ci-logs/',
  'coverage/',
  'dist/',
  'node_modules/',
  'out/'
]);

const BINARY_EXTENSIONS = Object.freeze(
  new Set([
    '.7z',
    '.apk',
    '.avif',
    '.bin',
    '.bmp',
    '.class',
    '.dmg',
    '.exe',
    '.gif',
    '.gz',
    '.ico',
    '.jar',
    '.jpeg',
    '.jpg',
    '.keystore',
    '.mov',
    '.mp4',
    '.pdf',
    '.png',
    '.so',
    '.tar',
    '.tgz',
    '.ttf',
    '.webm',
    '.webp',
    '.woff',
    '.woff2',
    '.zip'
  ])
);

function rootToPath(root) {
  return root instanceof URL ? fileURLToPath(root) : String(root);
}

function normalizeRelativePath(filePath) {
  return String(filePath).replaceAll(path.sep, '/').replace(/^\.\//, '');
}

function toGlobalRegExp(pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function shouldScanFile(filePath) {
  const normalized = normalizeRelativePath(filePath);

  if (!normalized || IGNORED_DIRECTORIES.some((directory) => normalized.startsWith(directory))) {
    return false;
  }

  return !BINARY_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function isAllowedFinding({ filePath, line, patternId }, allowlist) {
  return allowlist.some((rule) => {
    if (rule.patternId !== patternId) {
      return false;
    }

    if (normalizeRelativePath(rule.filePath) !== normalizeRelativePath(filePath)) {
      return false;
    }

    return rule.lineIncludes === undefined || line.includes(rule.lineIncludes);
  });
}

function redactSnippet(line, start, end) {
  const prefix = line.slice(Math.max(0, start - 40), start);
  const suffix = line.slice(end, Math.min(line.length, end + 40));

  return `${prefix}[secret-like-value]${suffix}`.trim();
}

async function listGitTrackedFiles(rootPath) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: rootPath,
    maxBuffer: 10 * 1024 * 1024
  });

  return stdout.split('\0').filter(Boolean);
}

export function scanTextForSecrets(content, { filePath = '(inline)', allowlist = SECRET_AUDIT_ALLOWED_FIXTURES } = {}) {
  const findings = [];
  const lines = String(content).split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    for (const { id, description, pattern } of SECRET_AUDIT_PATTERNS) {
      for (const match of line.matchAll(toGlobalRegExp(pattern))) {
        const column = match.index + 1;
        const end = match.index + match[0].length;

        if (isAllowedFinding({ filePath, line, patternId: id }, allowlist)) {
          continue;
        }

        findings.push({
          filePath: normalizeRelativePath(filePath),
          lineNumber: lineIndex + 1,
          column,
          patternId: id,
          description,
          snippet: redactSnippet(line, match.index, end)
        });
      }
    }
  }

  return findings;
}

export async function scanRepositoryForSecrets({
  root = defaultRoot,
  files,
  allowlist = SECRET_AUDIT_ALLOWED_FIXTURES
} = {}) {
  const rootPath = rootToPath(root);
  const trackedFiles = files ?? (await listGitTrackedFiles(rootPath));
  const scannedFiles = [];
  const findings = [];

  for (const file of trackedFiles) {
    const relativePath = normalizeRelativePath(file);

    if (!shouldScanFile(relativePath)) {
      continue;
    }

    const content = await readFile(path.join(rootPath, relativePath), 'utf8');
    scannedFiles.push(relativePath);
    findings.push(...scanTextForSecrets(content, { filePath: relativePath, allowlist }));
  }

  return {
    findings,
    scannedFiles,
    scannedFileCount: scannedFiles.length
  };
}

export function formatSecretAuditFindings(findings) {
  if (findings.length === 0) {
    return 'No secret-like values found.';
  }

  return [
    `Secret audit found ${findings.length} unapproved secret-like value(s):`,
    ...findings.map(
      (finding) =>
        `- ${finding.filePath}:${finding.lineNumber}:${finding.column} ${finding.patternId} (${finding.description}) ${finding.snippet}`
    )
  ].join('\n');
}
