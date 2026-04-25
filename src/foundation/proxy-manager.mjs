import { createTeletonSettings } from './settings-model.mjs';
import { validateProxyConfig } from './proxy-settings.mjs';

export const PROXY_ROUTE_TYPES = Object.freeze(['direct', 'mtproto', 'socks5']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHealthInputs(input = {}) {
  const direct = input.direct ?? input.directReachable ?? true;
  const proxies = isPlainObject(input.proxies) ? input.proxies : {};

  return {
    direct: direct === true,
    proxies
  };
}

function proxyReachable(health, proxy) {
  const value = health.proxies[proxy.id];

  if (typeof value === 'boolean') {
    return value;
  }

  if (isPlainObject(value)) {
    return value.reachable === true || value.healthy === true;
  }

  return false;
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

  function orderedProxyCandidates() {
    if (settings.proxy.enabled !== true) {
      return [];
    }

    const activeProxy = settings.proxy.entries.find((entry) => entry.id === settings.proxy.activeProxyId);
    const remaining = settings.proxy.entries.filter((entry) => entry.id !== settings.proxy.activeProxyId);

    return activeProxy ? [activeProxy, ...remaining] : remaining;
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

      if (health.direct) {
        return createDirectRoute();
      }

      for (const proxy of orderedProxyCandidates()) {
        if (proxyReachable(health, proxy)) {
          return Object.freeze(routeForProxy(proxy));
        }
      }

      return null;
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
