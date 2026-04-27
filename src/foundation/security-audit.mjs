import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { formatSecretAuditFindings, scanRepositoryForSecrets } from './secret-audit.mjs';

const defaultRoot = new URL('../../', import.meta.url);

const PACKAGE_DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]);

export const SECURITY_AUDIT_CATEGORY_IDS = Object.freeze([
  'secrets',
  'dependency-risk',
  'permission-boundaries',
  'release-readiness'
]);

export const SECURITY_AUDIT_MANUAL_REVIEW_ITEMS = Object.freeze([
  {
    id: 'human-security-reviewer',
    title: 'Human security reviewer',
    owner: 'security maintainer',
    evidence:
      'Record the latest npm test, npm run validate:secrets, npm run audit:security, npm run validate:foundation, npm run validate:release, and npm run build:debug-artifacts results.'
  },
  {
    id: 'human-legal-reviewer',
    title: 'Human legal reviewer',
    owner: 'legal or release maintainer',
    evidence:
      'Confirm shipped dependencies match docs/license-matrix.md and that copyleft, notice, source publication, and app-store obligations are approved.'
  },
  {
    id: 'release-manager',
    title: 'Release manager',
    owner: 'release maintainer',
    evidence:
      'Attach this report to release review, confirm release notes and screenshots are redacted, and keep package publication disabled until public release approval.'
  }
]);

function normalizeRoot(root) {
  if (root instanceof URL) {
    return root;
  }

  return pathToFileURL(`${path.resolve(String(root))}${path.sep}`);
}

function rootToPath(root) {
  return fileURLToPath(normalizeRoot(root));
}

async function readText(root, relativePath) {
  try {
    return await readFile(new URL(relativePath, root), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function parseJson(content, fallback = {}) {
  if (!content.trim()) {
    return fallback;
  }

  return JSON.parse(content);
}

function hasPatterns(content, patterns) {
  return patterns.every((pattern) => pattern.test(content));
}

function hasCodeownerPattern(codeowners, pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s+@`, 'm').test(codeowners);
}

function hasReadOnlyContentsPermission(workflow) {
  return /permissions:\s*\n\s*contents:\s*read/i.test(workflow) && !/contents:\s*write/i.test(workflow);
}

function collectPackageDependencies(packageJson) {
  const groups = PACKAGE_DEPENDENCY_FIELDS.map((field) => ({
    field,
    entries: Object.entries(packageJson[field] ?? {})
  })).filter((group) => group.entries.length > 0);

  return {
    groups,
    totalCount: groups.reduce((total, group) => total + group.entries.length, 0)
  };
}

function hasPackageLock(rootPath) {
  return ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].some((file) =>
    existsSync(path.join(rootPath, file))
  );
}

function dependencyEvidence(metadata, lockfilePresent) {
  if (metadata.totalCount === 0) {
    return 'package.json declares no package dependencies; dependency risk is limited to planned upstreams in docs/license-matrix.md.';
  }

  const groups = metadata.groups.map((group) => `${group.field}: ${group.entries.length}`).join(', ');
  const lockfile = lockfilePresent ? 'a package lockfile is present' : 'no package lockfile is present';
  return `package.json declares ${metadata.totalCount} package dependenc(ies) (${groups}); ${lockfile}.`;
}

function createCheck({ id, title, status, evidence, command }) {
  return Object.freeze({
    id,
    title,
    status,
    evidence,
    command
  });
}

function createCategory({ id, title, requiredEvidence, checks }) {
  const status = checks.some((check) => check.status === 'blocked') ? 'blocked' : 'pass';

  return Object.freeze({
    id,
    title,
    status,
    requiredEvidence,
    checks
  });
}

function collectBlockingChecks(categories) {
  return categories.flatMap((category) =>
    category.checks
      .filter((check) => check.status === 'blocked')
      .map((check) => ({
        categoryId: category.id,
        categoryTitle: category.title,
        checkId: check.id,
        checkTitle: check.title,
        evidence: check.evidence
      }))
  );
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function escapeTableCell(value) {
  return oneLine(value).replaceAll('|', '\\|');
}

function statusLabel(status) {
  return status.toUpperCase().replaceAll('-', ' ');
}

export async function createSecurityAudit({
  root = defaultRoot,
  generatedAt = new Date().toISOString(),
  secretScanResult
} = {}) {
  const auditRoot = normalizeRoot(root);
  const rootPath = rootToPath(auditRoot);

  const [packageText, securityAuditDoc, licenseMatrixDoc, codeowners, ciWorkflow, releaseWorkflow] =
    await Promise.all([
      readText(auditRoot, 'package.json'),
      readText(auditRoot, 'docs/security-audit.md'),
      readText(auditRoot, 'docs/license-matrix.md'),
      readText(auditRoot, '.github/CODEOWNERS'),
      readText(auditRoot, '.github/workflows/ci.yml'),
      readText(auditRoot, '.github/workflows/release-validation.yml')
    ]);

  const packageJson = parseJson(packageText);
  const dependencies = collectPackageDependencies(packageJson);
  const lockfilePresent = hasPackageLock(rootPath);
  const secrets = secretScanResult ?? (await scanRepositoryForSecrets({ root: auditRoot }));

  const categories = [
    createCategory({
      id: 'secrets',
      title: 'Secrets',
      requiredEvidence: [
        'Automated scan of git-tracked text files with redacted findings only.',
        'Credential inventory, rotation, and secure storage rules documented for release reviewers.'
      ],
      checks: [
        createCheck({
          id: 'committed-secret-scan',
          title: 'Committed secret scan',
          status: secrets.findings.length === 0 ? 'pass' : 'blocked',
          evidence:
            secrets.findings.length === 0
              ? `npm run validate:secrets scanned ${secrets.scannedFileCount} tracked file(s) with 0 findings.`
              : `npm run validate:secrets found ${secrets.findings.length} unapproved secret-like value(s).`,
          command: 'npm run validate:secrets'
        }),
        createCheck({
          id: 'credential-inventory',
          title: 'Credential inventory and rotation rules',
          status: hasPatterns(securityAuditDoc, [
            /Credential Inventory/i,
            /Credential Rotation/i,
            /Secure Storage Review/i,
            /Human Security Review/i
          ])
            ? 'pass'
            : 'blocked',
          evidence: 'docs/security-audit.md records credential classes, rotation triggers, secure storage, and review gates.'
        })
      ]
    }),
    createCategory({
      id: 'dependency-risk',
      title: 'Dependency Risk',
      requiredEvidence: [
        'Package dependency metadata is reviewed and lockfile coverage is present when dependencies are introduced.',
        'Planned upstreams and license obligations are tracked before release readiness.'
      ],
      checks: [
        createCheck({
          id: 'package-dependency-metadata',
          title: 'Package dependency metadata',
          status: dependencies.totalCount === 0 || lockfilePresent ? 'pass' : 'blocked',
          evidence: dependencyEvidence(dependencies, lockfilePresent)
        }),
        createCheck({
          id: 'license-matrix',
          title: 'Upstream license and dependency risk matrix',
          status: hasPatterns(licenseMatrixDoc, [
            /Human legal review/i,
            /release readiness/i,
            /source publication/i,
            /Release Sign-Off Checklist/i
          ])
            ? 'pass'
            : 'blocked',
          evidence: 'docs/license-matrix.md tracks upstream licenses, copyleft boundaries, source obligations, and release sign-off.'
        })
      ]
    }),
    createCategory({
      id: 'permission-boundaries',
      title: 'Permission Boundaries',
      requiredEvidence: [
        'Security-sensitive repository paths require human maintainer ownership review.',
        'CI and release workflows use read-only repository permissions unless a reviewed release job requires more.'
      ],
      checks: [
        createCheck({
          id: 'codeowners-security-coverage',
          title: 'CODEOWNERS coverage for high-risk paths',
          status:
            ['*', '.github/workflows/', '.github/CODEOWNERS', 'src/', 'scripts/', 'docs/', 'package.json'].every(
              (pattern) => hasCodeownerPattern(codeowners, pattern)
            ) && /human maintainer/i.test(codeowners)
              ? 'pass'
              : 'blocked',
          evidence: '.github/CODEOWNERS covers workflows, shared source, scripts, docs, package metadata, and ownership changes.'
        }),
        createCheck({
          id: 'workflow-permissions',
          title: 'Workflow permission boundaries',
          status: hasReadOnlyContentsPermission(ciWorkflow) && hasReadOnlyContentsPermission(releaseWorkflow) ? 'pass' : 'blocked',
          evidence: 'CI and release validation workflows declare contents: read permissions and do not publish packages.'
        }),
        createCheck({
          id: 'secure-storage-boundaries',
          title: 'Secure storage and platform permission boundaries',
          status: hasPatterns(securityAuditDoc, [/Secure Storage Review/i, /Release enablement is blocked/i])
            ? 'pass'
            : 'blocked',
          evidence: 'docs/security-audit.md blocks release enablement until platform secure storage and diagnostics redaction are reviewed.'
        })
      ]
    }),
    createCategory({
      id: 'release-readiness',
      title: 'Release Readiness',
      requiredEvidence: [
        'Release metadata and changelog checks pass before a release review.',
        'Unsigned debug artifact manifests are built and uploaded by public CI without signing secrets.',
        'Security audit output is generated as Markdown and uploaded or attached to the release review.'
      ],
      checks: [
        createCheck({
          id: 'release-package-state',
          title: 'Package release state',
          status:
            packageJson.private === true &&
            packageJson.scripts?.['validate:release'] &&
            packageJson.scripts?.['build:debug-artifacts']
              ? 'pass'
              : 'blocked',
          evidence:
            'package.json remains private and exposes npm run validate:release plus npm run build:debug-artifacts for release validation.',
          command: 'npm run validate:release'
        }),
        createCheck({
          id: 'security-audit-command',
          title: 'Attachable security audit command',
          status: packageJson.scripts?.['audit:security'] === 'node scripts/audit-security.mjs' ? 'pass' : 'blocked',
          evidence: 'package.json exposes npm run audit:security to print or write the release audit report.',
          command: 'npm run audit:security -- --output security-audit-report.md'
        }),
        createCheck({
          id: 'release-workflow',
          title: 'Release validation workflow',
          status:
            /npm run validate:release/.test(releaseWorkflow) &&
            /npm run build:debug-artifacts/.test(releaseWorkflow) &&
            /npm run audit:security -- --output security-audit-report\.md/.test(releaseWorkflow) &&
            /actions\/upload-artifact@v4/.test(releaseWorkflow) &&
            /if:\s*always\(\)/.test(releaseWorkflow) &&
            !/\bsecrets\./.test(releaseWorkflow) &&
            !/npm\s+publish/.test(releaseWorkflow)
              ? 'pass'
              : 'blocked',
          evidence:
            '.github/workflows/release-validation.yml validates metadata, uploads unsigned debug artifact manifests, preserves the security audit report artifact, and does not publish.'
        })
      ]
    })
  ];

  const automatedBlockers = collectBlockingChecks(categories);

  return Object.freeze({
    generatedAt,
    status: automatedBlockers.length > 0 ? 'blocked' : 'ready-for-human-review',
    package: Object.freeze({
      name: packageJson.name ?? 'unknown-package',
      version: packageJson.version ?? '0.0.0',
      private: packageJson.private === true
    }),
    categories,
    automatedBlockers,
    manualReviewItems: SECURITY_AUDIT_MANUAL_REVIEW_ITEMS,
    secretFindings: secrets.findings,
    scannedFileCount: secrets.scannedFileCount
  });
}

export function formatSecurityAuditReport(audit) {
  const lines = [
    '# Security Audit Release Report',
    '',
    `Generated: ${audit.generatedAt}`,
    `Package: \`${audit.package.name}@${audit.package.version}\``,
    `Release gate status: \`${audit.status}\``,
    '',
    '## Category Summary',
    '',
    '| Category | Status | Required evidence |',
    '| --- | --- | --- |',
    ...audit.categories.map(
      (category) =>
        `| ${escapeTableCell(category.title)} | ${statusLabel(category.status)} | ${escapeTableCell(
          category.requiredEvidence.join(' ')
        )} |`
    ),
    '',
    '## Automated Checks',
    ''
  ];

  for (const category of audit.categories) {
    lines.push(`### ${category.title}`, '');

    for (const check of category.checks) {
      lines.push(`- **${statusLabel(check.status)}** ${check.title}: ${check.evidence}`);
      if (check.command) {
        lines.push(`  Command: \`${check.command}\``);
      }
    }

    lines.push('');
  }

  if (audit.secretFindings.length > 0) {
    lines.push('## Secret Findings', '', '```text', formatSecretAuditFindings(audit.secretFindings), '```', '');
  }

  if (audit.automatedBlockers.length > 0) {
    lines.push('## Automated Blockers', '');
    for (const blocker of audit.automatedBlockers) {
      lines.push(`- ${blocker.categoryTitle} / ${blocker.checkTitle}: ${blocker.evidence}`);
    }
    lines.push('');
  }

  lines.push('## Manual Release Sign-Off', '');
  for (const item of audit.manualReviewItems) {
    lines.push(`- [ ] **${item.title}** (${item.owner}): ${item.evidence}`);
  }

  lines.push(
    '',
    '## Attach This Output',
    '',
    'Run `npm run audit:security -- --output security-audit-report.md` and attach the generated Markdown report to the release review after automated blockers are resolved. Manual sign-off remains required before public release.',
    ''
  );

  return lines.join('\n');
}
