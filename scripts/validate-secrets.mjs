#!/usr/bin/env node
import { formatSecretAuditFindings, scanRepositoryForSecrets } from '../src/foundation/secret-audit.mjs';

const result = await scanRepositoryForSecrets();

if (result.findings.length > 0) {
  console.error(formatSecretAuditFindings(result.findings));
  process.exitCode = 1;
} else {
  console.log(`Secret validation passed for ${result.scannedFileCount} tracked files.`);
}
