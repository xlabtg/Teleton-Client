import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonDnsAdapter,
  createTonDnsAdapter,
  createTonDnsResolutionView,
  validateTonDnsName
} from '../src/ton/dns-adapter.mjs';

test('TON DNS validation accepts normalized .ton names and rejects spoof-like names', () => {
  const valid = validateTonDnsName(' Alice.TON ');
  assert.equal(valid.valid, true);
  assert.equal(valid.name, 'alice.ton');

  const invalid = validateTonDnsName('аlice.ton');
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /ASCII/i);
});

test('mock TON DNS adapter resolves wallet and resource records with verified view state', async () => {
  const adapter = createMockTonDnsAdapter({
    records: {
      'alice.ton': {
        wallet: 'EQDaliceWalletAddress',
        site: 'https://alice.example'
      }
    },
    now: () => 1_000
  });

  const resolution = await adapter.resolve('Alice.TON');
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.verified, true);
  assert.equal(resolution.walletAddress, 'EQDaliceWalletAddress');
  assert.equal(resolution.records.site, 'https://alice.example');

  assert.deepEqual(createTonDnsResolutionView(resolution), {
    input: 'Alice.TON',
    displayName: 'alice.ton',
    displayAddress: 'EQDaliceWalletAddress',
    verified: true,
    status: 'resolved',
    fallbackUsed: false,
    warnings: []
  });
});

test('TON DNS adapter caches successful resolutions until expiration', async () => {
  let now = 10_000;
  let calls = 0;
  const adapter = createTonDnsAdapter(
    {
      async resolve(name) {
        calls += 1;
        return {
          name,
          walletAddress: `EQDcachedWallet${calls}`
        };
      }
    },
    {
      now: () => now,
      successTtlMs: 500
    }
  );

  assert.equal((await adapter.resolve('cache.ton')).walletAddress, 'EQDcachedWallet1');
  assert.equal((await adapter.resolve('cache.ton')).walletAddress, 'EQDcachedWallet1');
  assert.equal(calls, 1);

  now += 501;
  assert.equal((await adapter.resolve('cache.ton')).walletAddress, 'EQDcachedWallet2');
  assert.equal(calls, 2);
});

test('TON DNS missing and provider failures safely fall back to the original address', async () => {
  const missing = createMockTonDnsAdapter({ records: {} });
  const missingResolution = await missing.resolve('missing.ton', { fallbackAddress: 'EQDrawAddress' });
  assert.equal(missingResolution.status, 'not_found');
  assert.equal(missingResolution.verified, false);
  assert.equal(missingResolution.fallbackAddress, 'EQDrawAddress');
  assert.equal(createTonDnsResolutionView(missingResolution).displayAddress, 'EQDrawAddress');

  const failing = createTonDnsAdapter({
    async resolve() {
      throw new Error('upstream unavailable with token secret');
    }
  });
  const failedResolution = await failing.resolve('error.ton', { fallbackAddress: 'EQDrawAddress' });
  assert.equal(failedResolution.status, 'failed');
  assert.equal(failedResolution.verified, false);
  assert.equal(failedResolution.fallbackAddress, 'EQDrawAddress');
  assert.match(failedResolution.error.message, /provider unavailable/i);
  assert.doesNotMatch(failedResolution.error.message, /token secret/i);
});
