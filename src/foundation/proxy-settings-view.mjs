import { createDirectRoute, createProxyManager } from './proxy-manager.mjs';
import { validateProxyConfig } from './proxy-settings.mjs';

const DEFAULT_DRAFT = Object.freeze({
  id: '',
  protocol: 'mtproto',
  host: '',
  port: '',
  secretRef: '',
  usernameRef: '',
  passwordRef: ''
});

const SECURE_REFERENCE_PATTERN = /\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+/g;
const DEFAULT_PROXY_PROBE_TARGET = 'telegram';
const DEFAULT_PROXY_TEST_TIMEOUT_MS = 5000;
const PROXY_TEST_FAILURE_REASONS = new Set([
  'adapter_error',
  'authentication_failed',
  'connection_failed',
  'dns_error',
  'proxy_unreachable',
  'timeout',
  'tls_error',
  'unknown'
]);

export const CONNECTION_QUALITY_STATES = Object.freeze(['testing', 'direct', 'proxy', 'degraded', 'offline']);

export const CONNECTION_QUALITY_THRESHOLDS = Object.freeze({
  goodLatencyMs: 250,
  degradedLatencyMs: 1000
});

function clone(value) {
  return structuredClone(value);
}

function sanitizeMessage(message) {
  return String(message || 'Proxy test failed.').replaceAll(SECURE_REFERENCE_PATTERN, '[redacted]');
}

function normalizeProbeOptions(options = {}) {
  const speedTest = options.speedTest && typeof options.speedTest === 'object' ? options.speedTest : {};
  const timeoutMs = Number.isFinite(speedTest.timeoutMs) && speedTest.timeoutMs > 0
    ? Math.trunc(speedTest.timeoutMs)
    : DEFAULT_PROXY_TEST_TIMEOUT_MS;
  const target = String(speedTest.target ?? DEFAULT_PROXY_PROBE_TARGET).trim() || DEFAULT_PROXY_PROBE_TARGET;
  const now = typeof speedTest.now === 'function' ? speedTest.now : Date.now;

  return Object.freeze({
    target,
    timeoutMs,
    now
  });
}

function normalizeFailureReason(reason) {
  const value = String(reason ?? '').trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_|_$/g, '');
  if (!value) {
    return 'unknown';
  }

  return PROXY_TEST_FAILURE_REASONS.has(value) ? value : 'unknown';
}

function normalizeLatencyMs(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function createProxyTestResult(result, elapsedMs, probe) {
  const timedOut = elapsedMs >= probe.timeoutMs || result?.reason === 'timeout';
  const latencyMs = normalizeLatencyMs(timedOut ? elapsedMs : result?.latencyMs ?? elapsedMs);
  const reachable = result?.reachable === true && !timedOut;
  const reason = reachable ? null : normalizeFailureReason(timedOut ? 'timeout' : result?.reason);
  const message = timedOut
    ? 'Proxy test timed out.'
    : sanitizeMessage(result?.message ?? (reachable ? 'Connected' : 'Proxy test failed.'));

  return {
    status: reachable ? 'success' : 'failure',
    reachable,
    latencyMs,
    reason,
    message,
    probeTarget: probe.target
  };
}

function normalizeId(value, protocol, host, port) {
  const explicit = String(value ?? '').trim();
  if (explicit) {
    return explicit;
  }

  return `${protocol}-${host}-${port}`.toLowerCase().replaceAll(/[^a-z0-9_-]+/g, '-').replaceAll(/^-|-$/g, '');
}

function draftToConfig(draft) {
  const protocol = String(draft.protocol ?? '').trim().toLowerCase();
  const host = String(draft.host ?? '').trim();
  const numericPort = Number(draft.port);
  const port = Number.isInteger(numericPort) ? numericPort : draft.port;
  const id = normalizeId(draft.id, protocol, host, port);
  const config = { id, protocol, host, port };

  for (const [draftField, configField] of [
    ['secretRef', 'secret'],
    ['usernameRef', 'username'],
    ['passwordRef', 'password']
  ]) {
    const value = String(draft[draftField] ?? '').trim();
    if (value) {
      config[configField] = value;
    }
  }

  return config;
}

function entryToDraft(entry = DEFAULT_DRAFT) {
  return {
    id: entry.id ?? '',
    protocol: entry.protocol ?? 'mtproto',
    host: entry.host ?? '',
    port: entry.port === undefined ? '' : String(entry.port),
    secretRef: entry.secretRef ?? '',
    usernameRef: entry.usernameRef ?? '',
    passwordRef: entry.passwordRef ?? ''
  };
}

function validateDraft(draft) {
  const config = draftToConfig(draft);
  const validation = validateProxyConfig(config);

  if (!config.id) {
    validation.errors.unshift('Proxy id is required.');
  }

  return {
    valid: validation.errors.length === 0,
    errors: validation.errors,
    entry: validation.errors.length === 0 ? { id: config.id, ...validation.config } : null
  };
}

function listItem(entry, activeProxyId, enabled) {
  const protocolName = entry.protocol === 'mtproto' ? 'MTProto' : entry.protocol === 'http-connect' ? 'HTTP CONNECT' : 'SOCKS5';

  return {
    id: entry.id,
    protocol: entry.protocol,
    host: entry.host,
    port: entry.port,
    label: `${protocolName} ${entry.host}:${entry.port}`,
    enabled: enabled === true && entry.id === activeProxyId,
    secretConfigured: entry.secretRef !== undefined,
    usernameConfigured: entry.usernameRef !== undefined,
    passwordConfigured: entry.passwordRef !== undefined
  };
}

function routeFromSettings(settings) {
  if (settings.proxy.enabled !== true) {
    return createDirectRoute();
  }

  const active = settings.proxy.entries.find((entry) => entry.id === settings.proxy.activeProxyId);
  if (!active) {
    return createDirectRoute();
  }

  const route = {
    type: active.protocol,
    proxyId: active.id,
    host: active.host,
    port: active.port,
    secretConfigured: active.secretRef !== undefined,
    usernameConfigured: active.usernameRef !== undefined,
    passwordConfigured: active.passwordRef !== undefined
  };

  return Object.freeze(route);
}

function preferencesFromSettings(settings) {
  return Object.freeze({
    enabled: settings.proxy.enabled,
    autoSwitchEnabled: settings.proxy.autoSwitchEnabled,
    activeProxyId: settings.proxy.activeProxyId
  });
}

function defaultProxyTest() {
  return {
    reachable: false,
    message: 'No proxy test adapter is configured.'
  };
}

function normalizeReachability(value) {
  if (typeof value === 'boolean') {
    return {
      reachable: value,
      latencyMs: null
    };
  }

  if (value !== null && typeof value === 'object') {
    const latencyMs = Number.isFinite(value.latencyMs) ? value.latencyMs : null;

    return {
      reachable: value.reachable === true || value.healthy === true,
      latencyMs
    };
  }

  return {
    reachable: false,
    latencyMs: null
  };
}

function latencyTone(latencyMs) {
  if (latencyMs === null) {
    return 'success';
  }

  return latencyMs > CONNECTION_QUALITY_THRESHOLDS.goodLatencyMs ? 'warning' : 'success';
}

function routeLabel(route) {
  if (route.type === 'mtproto') {
    return 'MTProto proxy connection';
  }

  if (route.type === 'socks5') {
    return 'SOCKS5 proxy connection';
  }

  if (route.type === 'http-connect') {
    return 'HTTP CONNECT proxy connection';
  }

  return 'Proxy connection';
}

function createConnectionQuality(settings, healthInput = {}) {
  if (healthInput.testing !== false) {
    return Object.freeze({
      state: 'testing',
      route: 'testing',
      label: 'Checking connection...',
      detail: 'Testing direct and proxy routes.',
      tone: 'info',
      latencyMs: null,
      proxyId: null
    });
  }

  const direct = normalizeReachability(healthInput.direct ?? healthInput.directReachable);
  if (direct.reachable) {
    const degraded = direct.latencyMs !== null && direct.latencyMs > CONNECTION_QUALITY_THRESHOLDS.degradedLatencyMs;

    return Object.freeze({
      state: degraded ? 'degraded' : 'direct',
      route: 'direct',
      label: degraded ? 'Degraded direct connection' : 'Direct connection',
      detail: degraded ? 'Direct route is reachable with high latency.' : 'Direct route is reachable.',
      tone: degraded ? 'warning' : latencyTone(direct.latencyMs),
      latencyMs: direct.latencyMs,
      proxyId: null
    });
  }

  const proxies = healthInput.proxies && typeof healthInput.proxies === 'object' ? healthInput.proxies : {};
  const active = settings.proxy.entries.find((entry) => entry.id === settings.proxy.activeProxyId);
  const candidates = active
    ? [active, ...settings.proxy.entries.filter((entry) => entry.id !== active.id)]
    : settings.proxy.entries;

  if (settings.proxy.enabled === true) {
    for (const proxy of candidates) {
      const proxyHealth = normalizeReachability(proxies[proxy.id]);
      if (proxyHealth.reachable) {
        return Object.freeze({
          state: 'proxy',
          route: proxy.protocol,
          label: routeLabel({ type: proxy.protocol }),
          detail: `Connected through configured proxy ${proxy.id}.`,
          tone: latencyTone(proxyHealth.latencyMs),
          latencyMs: proxyHealth.latencyMs,
          proxyId: proxy.id
        });
      }
    }
  }

  return Object.freeze({
    state: 'offline',
    route: 'offline',
    label: 'Offline',
    detail: 'No direct or proxy route is reachable.',
    tone: 'danger',
    latencyMs: null,
    proxyId: null
  });
}

export function createProxySettingsView(options = {}) {
  const manager = createProxyManager(options.initialSettings);
  const testProxyAdapter = options.testProxy ?? defaultProxyTest;
  const probe = normalizeProbeOptions(options);
  let draft = entryToDraft(options.draft);
  let tests = {};
  let connectionHealth = { testing: true };

  function state() {
    const settings = manager.getSettings();
    const form = validateDraft(draft);

    return {
      list: {
        items: settings.proxy.entries.map((entry) => listItem(entry, settings.proxy.activeProxyId, settings.proxy.enabled))
      },
      form: {
        draft: clone(draft),
        valid: form.valid,
        errors: [...form.errors]
      },
      connectionQuality: createConnectionQuality(settings, connectionHealth),
      tests: clone(tests),
      preferences: preferencesFromSettings(settings),
      route: routeFromSettings(settings)
    };
  }

  function saveProxyEntries(entries, enabled = false, activeProxyId = null) {
    return manager.saveProxyPreferences({
      enabled,
      activeProxyId,
      entries
    });
  }

  return Object.freeze({
    getState() {
      return state();
    },
    updateDraft(values = {}) {
      draft = {
        ...draft,
        ...values
      };
      return state();
    },
    updateConnectionQuality(health = {}) {
      connectionHealth = clone(health);
      return state();
    },
    editProxy(proxyId) {
      const settings = manager.getSettings();
      const entry = settings.proxy.entries.find((item) => item.id === proxyId);
      if (!entry) {
        throw new Error(`Proxy ${proxyId} was not found.`);
      }

      draft = entryToDraft(entry);
      return state();
    },
    saveDraft() {
      const settings = manager.getSettings();
      const validation = validateDraft(draft);

      if (!validation.valid) {
        throw new Error(validation.errors.join(' '));
      }

      const existingIndex = settings.proxy.entries.findIndex((entry) => entry.id === validation.entry.id);
      const entries = [...settings.proxy.entries];
      if (existingIndex === -1) {
        entries.push(validation.entry);
      } else {
        entries[existingIndex] = validation.entry;
      }

      manager.saveProxyPreferences({
        ...settings.proxy,
        entries
      });
      draft = entryToDraft();

      return state();
    },
    async testProxy(proxyId) {
      const settings = manager.getSettings();
      const entry = settings.proxy.entries.find((item) => item.id === proxyId);
      if (!entry) {
        throw new Error(`Proxy ${proxyId} was not found.`);
      }

      tests = {
        ...tests,
        [proxyId]: {
          status: 'running',
          reachable: false,
          latencyMs: null,
          reason: null,
          message: 'Testing proxy connection...',
          probeTarget: probe.target
        }
      };

      try {
        const startedAt = probe.now();
        const result = await testProxyAdapter(clone(entry), {
          target: probe.target,
          timeoutMs: probe.timeoutMs
        });
        const elapsedMs = probe.now() - startedAt;
        tests = {
          ...tests,
          [proxyId]: createProxyTestResult(result, elapsedMs, probe)
        };
      } catch (error) {
        const reason = normalizeFailureReason(error.reason ?? error.code ?? 'adapter_error');
        tests = {
          ...tests,
          [proxyId]: {
            status: 'failure',
            reachable: false,
            latencyMs: null,
            reason,
            message: sanitizeMessage(error.message),
            probeTarget: probe.target
          }
        };
      }

      return state();
    },
    enableProxy(proxyId) {
      const settings = manager.getSettings();
      if (!settings.proxy.entries.some((entry) => entry.id === proxyId)) {
        throw new Error(`Proxy ${proxyId} was not found.`);
      }

      manager.saveProxyPreferences({
        ...settings.proxy,
        enabled: true,
        activeProxyId: proxyId
      });

      return state();
    },
    setAutoSwitchEnabled(enabled) {
      const settings = manager.getSettings();
      manager.saveProxyPreferences({
        ...settings.proxy,
        autoSwitchEnabled: enabled === true
      });

      return state();
    },
    disableProxy() {
      const settings = manager.getSettings();
      saveProxyEntries(settings.proxy.entries, false, null);
      return state();
    },
    removeProxy(proxyId) {
      const settings = manager.getSettings();
      const entries = settings.proxy.entries.filter((entry) => entry.id !== proxyId);
      const removedActive = settings.proxy.activeProxyId === proxyId;

      tests = Object.fromEntries(Object.entries(tests).filter(([id]) => id !== proxyId));
      saveProxyEntries(
        entries,
        removedActive ? false : settings.proxy.enabled,
        removedActive ? null : settings.proxy.activeProxyId
      );

      return state();
    }
  });
}
