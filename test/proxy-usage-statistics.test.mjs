import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProxyUsageStatisticsStore } from '../src/foundation/proxy-usage-statistics.mjs';

test('proxy usage statistics track local counters and latency without secrets', () => {
  const store = createProxyUsageStatisticsStore();

  store.recordAttempt('mtproto-primary', {
    reachable: true,
    latencyMs: 120,
    usedAt: 10_000,
    secretRef: 'env:TELETON_MTPROTO_SECRET',
    message: 'private message body'
  });
  store.recordAttempt('mtproto-primary', {
    reachable: false,
    latencyMs: 300,
    usedAt: 20_000,
    passwordRef: 'keychain:proxy-password'
  });

  assert.deepEqual(store.getStatistics(), {
    schemaVersion: 1,
    records: {
      'mtproto-primary': {
        proxyId: 'mtproto-primary',
        attempts: 2,
        successes: 1,
        failures: 1,
        latencySamples: 2,
        lastLatencyMs: 300,
        averageLatencyMs: 210,
        lastUsedAt: 20_000
      }
    }
  });
  assert.doesNotMatch(JSON.stringify(store.exportStatistics()), /TELETON_MTPROTO_SECRET|proxy-password|private message/);
});

test('proxy usage statistics reset all records or one proxy record', () => {
  const store = createProxyUsageStatisticsStore({
    records: {
      first: { attempts: 3, successes: 2, failures: 1, averageLatencyMs: 80 },
      second: { attempts: 1, successes: 0, failures: 1 }
    }
  });

  assert.equal(store.getStatistics().records.first.attempts, 3);

  store.clearStatistics('first');
  assert.equal(store.getStatistics().records.first, undefined);
  assert.equal(store.getStatistics().records.second.attempts, 1);

  store.clearStatistics();
  assert.deepEqual(store.getStatistics().records, {});
});
