export const AGENT_RUNTIME_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);
export const AGENT_RUNTIME_STATES = Object.freeze(['stopped', 'starting', 'running', 'stopping', 'error']);

const RUNTIME_SUPPORT = Object.freeze({
  android: deepFreeze({
    platform: 'android',
    localRuntime: 'Foreground service or bound service wrapping the bundled Teleton Agent binary.',
    packagingGaps: [
      'Select an Android service strategy for long-running local inference.',
      'Define ABI-specific binary packaging and update policy.',
      'Map IPC transport to Android app sandbox constraints.'
    ]
  }),
  ios: deepFreeze({
    platform: 'ios',
    localRuntime: 'App extension or in-app process constrained by iOS background execution limits.',
    packagingGaps: [
      'Confirm whether local agent execution can meet App Store background limits.',
      'Define signed framework packaging and entitlement requirements.',
      'Document fallback behavior when iOS suspends the app.'
    ]
  }),
  desktop: deepFreeze({
    platform: 'desktop',
    localRuntime: 'Child process supervised by the desktop shell with local IPC.',
    packagingGaps: [
      'Bundle per-OS agent binaries and verify code signing or notarization.',
      'Define crash restart policy and log file location.',
      'Reserve a local IPC endpoint that does not expose network credentials.'
    ]
  }),
  web: deepFreeze({
    platform: 'web',
    localRuntime: 'Browser-compatible worker or native-host bridge when available.',
    packagingGaps: [
      'Choose between Web Worker, WebAssembly, or native messaging host support.',
      'Document browsers that cannot run a local agent.',
      'Define permission prompts for native-host installation.'
    ]
  })
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!AGENT_RUNTIME_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported agent runtime platform: ${value}`);
  }

  return platform;
}

function clone(value) {
  return structuredClone(value);
}

function toErrorRecord(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error'
  };
}

function createStatus(state, platform, support, details = {}) {
  return {
    state,
    platform,
    localRuntime: support.localRuntime,
    requiresCloudCredentials: false,
    health: details.health ?? null,
    startedAt: details.startedAt ?? null,
    stoppedAt: details.stoppedAt ?? null,
    error: details.error ?? null
  };
}

export function describeAgentRuntimeSupport(platform) {
  const normalized = normalizePlatform(platform);
  const support = RUNTIME_SUPPORT[normalized];

  return {
    ...clone(support),
    requiresCloudCredentialsByDefault: false
  };
}

export function createMockAgentRuntimeAdapter(options = {}) {
  const calls = [];
  const logs = options.logs ?? [];

  return {
    calls,
    async start() {
      calls.push('start');

      if (options.startError) {
        throw options.startError;
      }

      return options.startResult ?? {};
    },
    async stop() {
      calls.push('stop');

      if (options.stopError) {
        throw options.stopError;
      }

      return options.stopResult ?? {};
    },
    async health() {
      calls.push('health');

      if (options.healthError) {
        throw options.healthError;
      }

      return options.health ?? { ok: true };
    },
    logs() {
      return logs;
    }
  };
}

export function createAgentRuntimeSupervisor({ platform, adapter, onLog } = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  const support = describeAgentRuntimeSupport(normalizedPlatform);

  if (!adapter || typeof adapter.start !== 'function' || typeof adapter.stop !== 'function') {
    throw new Error('Agent runtime supervisor requires an adapter with start and stop hooks.');
  }

  let status = createStatus('stopped', normalizedPlatform, support);
  let logCursor = 0;

  function readLogs() {
    if (typeof adapter.logs !== 'function') {
      return [];
    }

    const rawLogs = adapter.logs();
    const entries = rawLogs.slice(logCursor).map((entry) => {
      if (typeof entry === 'string') {
        return { level: 'info', message: entry };
      }

      return {
        level: entry.level ?? 'info',
        message: String(entry.message ?? ''),
        timestamp: entry.timestamp ?? null
      };
    });
    logCursor = rawLogs.length;

    for (const entry of entries) {
      onLog?.(entry);
    }

    return entries;
  }

  return {
    async start() {
      if (status.state === 'running') {
        return clone(status);
      }

      const startedAt = new Date().toISOString();
      status = createStatus('starting', normalizedPlatform, support, { startedAt });

      try {
        const result = await adapter.start({ platform: normalizedPlatform, support });
        const health =
          result.health ??
          (typeof adapter.health === 'function' ? await adapter.health({ platform: normalizedPlatform, status }) : null);
        status = createStatus('running', normalizedPlatform, support, { startedAt, health });
        readLogs();
        return clone(status);
      } catch (error) {
        status = createStatus('error', normalizedPlatform, support, {
          startedAt,
          error: toErrorRecord(error)
        });
        throw error;
      }
    },
    async stop() {
      if (status.state === 'stopped') {
        return clone(status);
      }

      const previous = status;
      status = createStatus('stopping', normalizedPlatform, support, {
        startedAt: previous.startedAt,
        health: previous.health
      });

      try {
        await adapter.stop({ platform: normalizedPlatform, status: previous });
        status = createStatus('stopped', normalizedPlatform, support, {
          startedAt: previous.startedAt,
          stoppedAt: new Date().toISOString()
        });
        readLogs();
        return clone(status);
      } catch (error) {
        status = createStatus('error', normalizedPlatform, support, {
          startedAt: previous.startedAt,
          health: previous.health,
          error: toErrorRecord(error)
        });
        throw error;
      }
    },
    async health() {
      if (typeof adapter.health !== 'function') {
        return status.health ?? { ok: status.state === 'running' };
      }

      const health = await adapter.health({ platform: normalizedPlatform, status });
      status = createStatus(status.state, normalizedPlatform, support, {
        startedAt: status.startedAt,
        stoppedAt: status.stoppedAt,
        health,
        error: status.error
      });

      return clone(health);
    },
    status() {
      return clone(status);
    },
    logs() {
      return readLogs();
    }
  };
}
