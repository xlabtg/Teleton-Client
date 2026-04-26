import { AGENT_IPC_VERSION } from './agent-ipc-bridge.mjs';

export const AGENT_PLUGIN_PERMISSION_SCOPES = Object.freeze([
  'messages.read',
  'messages.write',
  'agent.events.receive',
  'agent.actions.perform',
  'storage.read',
  'storage.write',
  'network.access'
]);

export const AGENT_PLUGIN_LIFECYCLE_STATES = Object.freeze(['registered', 'enabled', 'disabled', 'error']);
export const AGENT_PLUGIN_START_MODES = Object.freeze(['manual', 'onClientStart']);

const EVENT_PERMISSION_BY_TYPE = Object.freeze({
  'agent.message.received': 'agent.events.receive',
  'agent.task.updated': 'agent.events.receive',
  'agent.info': 'agent.events.receive',
  'agent.action.proposed': 'agent.events.receive'
});

const ACTION_PERMISSION_BY_NAME = Object.freeze({
  sendMessage: 'messages.write',
  readMessages: 'messages.read',
  performAgentAction: 'agent.actions.perform'
});

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalized;
}

function normalizePermissions(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Agent plugin manifests must declare at least one permission.');
  }

  const seen = new Set();

  return value.map((permission) => {
    if (!isPlainObject(permission)) {
      throw new Error('Agent plugin permissions must be objects.');
    }

    const scope = normalizeRequiredString(permission.scope, 'Agent plugin permission scope');
    if (!AGENT_PLUGIN_PERMISSION_SCOPES.includes(scope)) {
      throw new Error(`Unsupported agent plugin permission scope: ${scope}`);
    }

    if (seen.has(scope)) {
      throw new Error(`Duplicate agent plugin permission scope: ${scope}`);
    }
    seen.add(scope);

    return Object.freeze({
      scope,
      reason: normalizeRequiredString(permission.reason, 'Agent plugin permission reason')
    });
  });
}

function normalizeCompatibility(value) {
  if (!isPlainObject(value)) {
    throw new Error('Agent plugin manifests require compatibility metadata.');
  }

  const ipcVersion = value.ipcVersion ?? AGENT_IPC_VERSION;
  if (ipcVersion !== AGENT_IPC_VERSION) {
    throw new Error(`Unsupported plugin IPC version: ${ipcVersion}`);
  }

  return Object.freeze({
    ipcVersion,
    minClientVersion:
      value.minClientVersion === undefined
        ? null
        : normalizeRequiredString(value.minClientVersion, 'Agent plugin minimum client version')
  });
}

function normalizeLifecycle(value = {}) {
  if (!isPlainObject(value)) {
    throw new Error('Agent plugin lifecycle metadata must be an object.');
  }

  const startMode =
    value.startMode === undefined ? 'manual' : normalizeRequiredString(value.startMode, 'Agent plugin start mode');
  if (!AGENT_PLUGIN_START_MODES.includes(startMode)) {
    throw new Error(`Unsupported agent plugin start mode: ${startMode}`);
  }

  const healthTimeoutMs = value.healthTimeoutMs ?? 5000;
  if (!Number.isInteger(healthTimeoutMs) || healthTimeoutMs <= 0) {
    throw new Error('Agent plugin health timeout must be a positive integer.');
  }

  return Object.freeze({ startMode, healthTimeoutMs });
}

function hasPermission(record, scope) {
  return record.manifest.permissions.some((permission) => permission.scope === scope);
}

function snapshot(record) {
  return Object.freeze({
    ...clone(record.manifest),
    state: record.state,
    enabledAt: record.enabledAt,
    disabledAt: record.disabledAt,
    health: clone(record.health),
    error: record.error === null ? null : clone(record.error)
  });
}

function toErrorRecord(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error'
  };
}

export function normalizeAgentPluginManifest(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Agent plugin manifest must be an object.');
  }

  return Object.freeze({
    id: normalizeRequiredString(input.id, 'Agent plugin id'),
    name: normalizeRequiredString(input.name, 'Agent plugin name'),
    version: normalizeRequiredString(input.version, 'Agent plugin version'),
    description: input.description === undefined ? '' : String(input.description),
    permissions: Object.freeze(normalizePermissions(input.permissions)),
    lifecycle: normalizeLifecycle(input.lifecycle),
    compatibility: normalizeCompatibility(input.compatibility)
  });
}

export function createAgentPluginRegistry({ bridge } = {}) {
  if (!bridge || typeof bridge.request !== 'function') {
    throw new Error('Agent plugin registry requires a bridge with a request hook.');
  }

  const plugins = new Map();

  function getRecord(pluginId) {
    const id = normalizeRequiredString(pluginId, 'Agent plugin id');
    const record = plugins.get(id);

    if (!record) {
      throw new Error(`Unknown agent plugin: ${id}`);
    }

    return record;
  }

  function upsertState(pluginId, state, details = {}) {
    const record = getRecord(pluginId);
    record.state = state;
    record.enabledAt = details.enabledAt ?? record.enabledAt;
    record.disabledAt = details.disabledAt ?? record.disabledAt;
    record.health = details.health ?? record.health;
    record.error = details.error ?? null;
    return snapshot(record);
  }

  return {
    async register(manifestInput) {
      const manifest = normalizeAgentPluginManifest(manifestInput);

      if (plugins.has(manifest.id)) {
        throw new Error(`Agent plugin already registered: ${manifest.id}`);
      }

      plugins.set(manifest.id, {
        manifest,
        state: 'disabled',
        enabledAt: null,
        disabledAt: null,
        health: null,
        error: null
      });

      return snapshot(plugins.get(manifest.id));
    },
    list() {
      return Array.from(plugins.values(), snapshot);
    },
    get(pluginId) {
      return snapshot(getRecord(pluginId));
    },
    async enable(pluginId) {
      const record = getRecord(pluginId);

      if (record.state === 'enabled') {
        return snapshot(record);
      }

      try {
        await bridge.request('agent.plugin.enable', { pluginId: record.manifest.id, manifest: clone(record.manifest) });
        return upsertState(record.manifest.id, 'enabled', {
          enabledAt: new Date().toISOString(),
          disabledAt: null
        });
      } catch (error) {
        return upsertState(record.manifest.id, 'error', { error: toErrorRecord(error) });
      }
    },
    async disable(pluginId) {
      const record = getRecord(pluginId);

      if (record.state === 'disabled') {
        return snapshot(record);
      }

      try {
        await bridge.request('agent.plugin.disable', { pluginId: record.manifest.id });
        return upsertState(record.manifest.id, 'disabled', {
          disabledAt: new Date().toISOString()
        });
      } catch (error) {
        return upsertState(record.manifest.id, 'error', { error: toErrorRecord(error) });
      }
    },
    async health(pluginId) {
      const record = getRecord(pluginId);
      const response = await bridge.request('agent.plugin.health', { pluginId: record.manifest.id });
      const health = response.payload?.health ?? response.payload ?? response;
      record.health = clone(health);
      record.error = null;
      return clone(record.health);
    },
    canReceiveEvent(pluginId, eventType) {
      const record = getRecord(pluginId);
      const requiredPermission = EVENT_PERMISSION_BY_TYPE[eventType] ?? 'agent.events.receive';

      return record.state === 'enabled' && hasPermission(record, requiredPermission);
    },
    canPerformAction(pluginId, action) {
      const record = getRecord(pluginId);
      const requiredPermission = ACTION_PERMISSION_BY_NAME[action] ?? 'agent.actions.perform';

      return record.state === 'enabled' && hasPermission(record, requiredPermission);
    }
  };
}

export function createMockAgentPluginBridge(options = {}) {
  const calls = [];

  return {
    calls,
    async request(action, payload = {}) {
      calls.push({ action, payload: clone(payload) });

      if (options.errors?.[action]) {
        throw options.errors[action];
      }

      if (action === 'agent.plugin.health') {
        return { payload: { health: options.health?.[payload.pluginId] ?? { ok: true } } };
      }

      return { payload: { ok: true } };
    }
  };
}
