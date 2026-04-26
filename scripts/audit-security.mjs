#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSecurityAudit, formatSecurityAuditReport } from '../src/foundation/security-audit.mjs';

function parseArgs(argv) {
  const options = {
    output: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--output') {
      const output = argv[index + 1];
      if (!output) {
        throw new Error('--output requires a file path');
      }
      options.output = output;
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run audit:security -- [--output security-audit-report.md]

Generates a Markdown security audit report for release review. The command exits
with a non-zero status when automated security audit blockers are present.`);
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const audit = await createSecurityAudit();
const report = formatSecurityAuditReport(audit);

console.log(report);

if (options.output) {
  const outputPath = path.resolve(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, 'utf8');
  console.error(`Security audit report written to ${outputPath}`);
}

if (audit.automatedBlockers.length > 0) {
  console.error(`Security audit blocked by ${audit.automatedBlockers.length} automated check(s).`);
  process.exitCode = 1;
}
