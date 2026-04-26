import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('license matrix covers planned upstreams, copyleft boundaries, and legal review gates', async () => {
  const matrix = await readFile(pathFor('docs/license-matrix.md'), 'utf8');

  const requiredUpstreams = [
    /tdlib\/td/i,
    /DrKLO\/Telegram/i,
    /telegramdesktop\/tdesktop/i,
    /TelegramMessenger\/Telegram-iOS/i,
    /TelegramOrg\/Telegram-web-k/i,
    /TelegramOrg\/Telegram-web-z/i,
    /TONresistor\/teleton-agent/i,
    /ton-org\/ton/i,
    /ton-org\/ton-core/i,
    /toncenter\/tonweb/i,
    /ton-connect\/sdk/i,
    /ston-fi\/sdk/i,
    /dedust-io\/sdk/i,
    /xssnick\/tonutils-go/i,
    /ton-blockchain\/ton/i
  ];

  for (const upstream of requiredUpstreams) {
    assert.match(matrix, upstream, `license matrix must list ${upstream}`);
  }

  const requiredLicenseSignals = [
    /BSL-1\.0/i,
    /GPL-2\.0/i,
    /GPL-3\.0/i,
    /LGPL-2\.0/i,
    /MIT/i,
    /Apache-2\.0/i,
    /OpenSSL exception/i
  ];

  for (const signal of requiredLicenseSignals) {
    assert.match(matrix, signal, `license matrix must document ${signal}`);
  }

  assert.match(matrix, /reference only/i);
  assert.match(matrix, /no code copy/i);
  assert.match(matrix, /copyleft/i);
  assert.match(matrix, /source publication/i);
  assert.match(matrix, /Human legal review/i);
  assert.match(matrix, /release readiness/i);
});

test('project docs point release reviewers to the license matrix', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const contributing = await readFile(pathFor('CONTRIBUTING.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');

  for (const [name, content] of [
    ['README.md', readme],
    ['CONTRIBUTING.md', contributing],
    ['BUILD-GUIDE.md', buildGuide]
  ]) {
    assert.match(content, /docs\/license-matrix\.md/, `${name} must link the license matrix`);
  }
});
