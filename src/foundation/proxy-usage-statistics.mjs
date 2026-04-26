function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function normalizeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeLatencyMs(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function emptyRecord(proxyId) {
  return {
    proxyId,
    attempts: 0,
    successes: 0,
    failures: 0,
    latencySamples: 0,
    lastLatencyMs: null,
    averageLatencyMs: null,
    lastUsedAt: null
  };
}

function normalizeRecord(proxyId, value = {}) {
  const record = isPlainObject(value) ? value : {};
  const attempts = normalizeCount(record.attempts);
  const successes = Math.min(normalizeCount(record.successes), attempts);
  const failures = Math.min(normalizeCount(record.failures), attempts - successes);
  const averageLatencyMs = normalizeLatencyMs(record.averageLatencyMs);

  return {
    proxyId,
    attempts,
    successes,
    failures,
    latencySamples: Math.min(normalizeCount(record.latencySamples), attempts),
    lastLatencyMs: normalizeLatencyMs(record.lastLatencyMs),
    averageLatencyMs,
    lastUsedAt: normalizeTimestamp(record.lastUsedAt)
  };
}

export function createProxyUsageStatisticsStore(initialStatistics = {}) {
  let records = {};

  if (isPlainObject(initialStatistics.records)) {
    for (const [proxyId, record] of Object.entries(initialStatistics.records)) {
      records[proxyId] = normalizeRecord(proxyId, record);
    }
  } else if (isPlainObject(initialStatistics)) {
    for (const [proxyId, record] of Object.entries(initialStatistics)) {
      records[proxyId] = normalizeRecord(proxyId, record);
    }
  }

  function getRecord(proxyId) {
    return records[proxyId] ?? emptyRecord(proxyId);
  }

  return Object.freeze({
    getStatistics() {
      return {
        schemaVersion: 1,
        records: clone(records)
      };
    },
    recordAttempt(proxyId, result = {}) {
      const id = String(proxyId ?? '').trim();
      if (!id) {
        throw new Error('Proxy statistics require a proxy id.');
      }

      const previous = getRecord(id);
      const latencyMs = normalizeLatencyMs(result.latencyMs);
      const succeeded = result.success === true || result.reachable === true;
      const attempts = previous.attempts + 1;
      const successes = previous.successes + (succeeded ? 1 : 0);
      const failures = previous.failures + (succeeded ? 0 : 1);
      const latencySamples = previous.latencySamples + (latencyMs === null ? 0 : 1);
      const previousLatencyTotal = previous.averageLatencyMs === null ? 0 : previous.averageLatencyMs * previous.latencySamples;
      const averageLatencyMs = latencyMs === null
        ? previous.averageLatencyMs
        : Math.round((previousLatencyTotal + latencyMs) / latencySamples);

      records = {
        ...records,
        [id]: {
          proxyId: id,
          attempts,
          successes,
          failures,
          latencySamples,
          lastLatencyMs: latencyMs,
          averageLatencyMs,
          lastUsedAt: normalizeTimestamp(result.usedAt ?? result.now) ?? Date.now()
        }
      };

      return clone(records[id]);
    },
    clearStatistics(proxyId) {
      if (proxyId === undefined) {
        records = {};
        return this.getStatistics();
      }

      const id = String(proxyId ?? '').trim();
      records = Object.fromEntries(Object.entries(records).filter(([recordId]) => recordId !== id));
      return this.getStatistics();
    },
    exportStatistics() {
      return this.getStatistics();
    }
  });
}
