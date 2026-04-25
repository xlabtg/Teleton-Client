import { createTeletonSettings } from './settings-model.mjs';
import { validateProxyConfig } from './proxy-settings.mjs';

export const PROXY_ROUTE_TYPES = Object.freeze(['direct', 'mtproto', 'socks5', 'http-connect']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const DEFAULT_FAILURE_COOLDOWN_MS = 30_000;

function normalizeReachability(value) {
  if (typeof value === 'boolean') {
    return {
      reachable: value,
      latencyMs: null
    };
  }

  if (isPlainObject(value)) {
    return {
      reachable: value.reachable === true || value.healthy === true,
      latencyMs: Number.isFinite(value.latencyMs) && value.latencyMs >= 0 ? value.latencyMs : null
    };
  }

  return {
    reachable: false,
    latencyMs: null
  };
}

function normalizeHealthInputs(input = {}) {
  const direct = input.direct ?? input.directReachable ?? true;
  const proxies = isPlainObject(input.proxies) ? input.proxies : {};
  const now = Number.isFinite(input.now) ? input.now : Date.now();

  return {
    direct: normalizeReachability(direct),
    proxies,
    now
  };
}

function proxyHealth(health, proxy) {
  return normalizeReachability(health.proxies[proxy.id]);
}

function routeForProxy(proxy) {
  const route = {
    type: proxy.protocol,
    proxyId: proxy.id,
    host: proxy.host,
    port: proxy.port
  };

  for (const field of ['secretRef', 'usernameRef', 'passwordRef']) {
    if (proxy[field] !== undefined) {
      route[field] = proxy[field];
    }
  }

  return route;
}

function normalizeSettings(settings) {
  return createTeletonSettings(settings);
}

export function createDirectRoute() {
  return Object.freeze({
    type: 'direct',
    proxyId: null
  });
}

export function createProxyManager(initialSettings = {}) {
  let settings = normalizeSettings(initialSettings);
  const failureWindows = new Map();

  function orderedProxyCandidates() {
    if (settings.proxy.enabled !== true) {
      return [];
    }

    const activeProxy = settings.proxy.entries.find((entry) => entry.id === settings.proxy.activeProxyId);
    const remaining = settings.proxy.entries.filter((entry) => entry.id !== settings.proxy.activeProxyId);

    return activeProxy ? [activeProxy, ...remaining] : remaining;
  }

  function failureWindow(proxyId, now) {
    const window = failureWindows.get(proxyId);
    if (!window) {
      return null;
    }

    if (window.expiresAt <= now) {
      failureWindows.delete(proxyId);
      return null;
    }

    return window;
  }

  function rankedProxyCandidates(health) {
    return orderedProxyCandidates()
      .map((proxy, index) => ({
        proxy,
        index,
        health: proxyHealth(health, proxy)
      }))
      .filter((candidate) => candidate.health.reachable && !failureWindow(candidate.proxy.id, health.now))
      .sort((left, right) => {
        if (settings.proxy.autoSwitchEnabled !== true) {
          return left.index - right.index;
        }

        const leftLatency = left.health.latencyMs ?? Number.POSITIVE_INFINITY;
        const rightLatency = right.health.latencyMs ?? Number.POSITIVE_INFINITY;

        if (leftLatency !== rightLatency) {
          return leftLatency - rightLatency;
        }

        return left.index - right.index;
      });
  }

  return Object.freeze({
    getSettings() {
      return structuredClone(settings);
    },
    saveSettings(nextSettings) {
      settings = normalizeSettings(nextSettings);
      return this.getSettings();
    },
    saveProxyPreferences(proxy) {
      const nextSettings = normalizeSettings({
        ...settings,
        proxy
      });
      settings = nextSettings;
      return this.getSettings();
    },
    chooseRoute(healthInput = {}) {
      const health = normalizeHealthInputs(healthInput);

      if (health.direct.reachable && settings.proxy.enabled !== true) {
        return createDirectRoute();
      }

      const [candidate] = rankedProxyCandidates(health);
      if (candidate) {
        return Object.freeze(routeForProxy(candidate.proxy));
      }

      if (health.direct.reachable) {
        return createDirectRoute();
      }

      return null;
    },
    recordProxyFailure(proxyId, options = {}) {
      const now = Number.isFinite(options.now) ? options.now : Date.now();
      const cooldownMs = Number.isFinite(options.cooldownMs) ? Math.max(0, options.cooldownMs) : DEFAULT_FAILURE_COOLDOWN_MS;

      failureWindows.set(proxyId, {
        failedAt: now,
        expiresAt: now + cooldownMs
      });

      return {
        proxyId,
        failedAt: now,
        cooldownMs,
        expiresAt: now + cooldownMs
      };
    },
    recordProxySuccess(proxyId) {
      failureWindows.delete(proxyId);
      return { proxyId };
    }
  });
}

export function validateProxyPreferences(proxy) {
  const errors = [];

  if (!isPlainObject(proxy)) {
    return {
      valid: false,
      errors: ['Proxy preferences must be an object.']
    };
  }

  for (const [index, entry] of (Array.isArray(proxy.entries) ? proxy.entries : []).entries()) {
    const validation = validateProxyConfig({
      protocol: entry.protocol,
      host: entry.host,
      port: entry.port,
      secret: entry.secretRef ?? entry.secret,
      username: entry.usernameRef ?? entry.username,
      password: entry.passwordRef ?? entry.password
    });

    for (const error of validation.errors) {
      errors.push(`Proxy entry ${entry.id ?? index + 1}: ${error}`);
    }
  }

  try {
    normalizeSettings({ proxy });
  } catch (error) {
    errors.push(error.message);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
