import { AGENT_MODES, createAgentSettings, normalizeAgentMode, validateAgentSettings } from './agent-settings.mjs';
import { AGENT_PROVIDER_TYPES, normalizeAgentProviderConfig } from './agent-provider-config.mjs';

export const AGENT_PRIVACY_IMPACT_MODES = Object.freeze(['cloud', 'hybrid']);
export const AGENT_SETTINGS_EXPORT_KIND = 'teleton.agent.settings.export';
export const AGENT_SETTINGS_EXCLUDED_FIELDS = Object.freeze(['memory', 'token', 'apiKey', 'secret']);

export const AGENT_MODEL_PROVIDERS = Object.freeze(['local', 'openai', 'teleton-cloud', 'custom']);

const MODE_COPY = Object.freeze({
  off: Object.freeze({
    label: 'Off',
    description: 'Automation is disabled.'
  }),
  local: Object.freeze({
    label: 'Local',
    description: 'Runs the agent on this device or through a local runtime bridge.'
  }),
  cloud: Object.freeze({
    label: 'Cloud',
    description: 'Uses a remote model provider after explicit consent.'
  }),
  hybrid: Object.freeze({
    label: 'Hybrid',
    description: 'Uses local automation first and can escalate selected work to a remote provider after consent.'
  })
});

const PRIVACY_IMPACT = Object.freeze({
  cloud: Object.freeze({
    mode: 'cloud',
    summary: 'Cloud processing can send selected message context, prompts, and action metadata to a remote model provider.',
    dataShared: Object.freeze(['Selected message context', 'Agent prompts', 'Action metadata', 'Model telemetry']),
    localDataRetained: Object.freeze(['Local agent memory', 'Secure references and credentials']),
    requiresConsent: true
  }),
  hybrid: Object.freeze({
    mode: 'hybrid',
    summary: 'Hybrid mode keeps local automation available but can send selected work to cloud processing when needed.',
    dataShared: Object.freeze(['Selected message context', 'Agent prompts', 'Cloud fallback metadata']),
    localDataRetained: Object.freeze(['Local agent memory', 'Secure references and credentials']),
    requiresConsent: true
  })
});

function clone(value) {
  return structuredClone(value);
}

function modeOptions() {
  return AGENT_MODES.map((mode) => ({
    id: mode,
    ...MODE_COPY[mode],
    requiresPrivacyConfirmation: AGENT_PRIVACY_IMPACT_MODES.includes(mode)
  }));
}

function normalizeModelPreference(value) {
  if (value === null) {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Agent model preference must be null or an object.');
  }

  const provider = String(value.provider ?? '').trim();
  const modelId = String(value.modelId ?? '').trim();

  if (!AGENT_MODEL_PROVIDERS.includes(provider)) {
    throw new Error(`Agent model provider must be one of: ${AGENT_MODEL_PROVIDERS.join(', ')}.`);
  }

  if (!modelId) {
    throw new Error('Agent model id is required.');
  }

  const model = {
    provider,
    modelId
  };

  const displayName = String(value.displayName ?? '').trim();
  if (displayName) {
    model.displayName = displayName;
  }

  return model;
}

function activationState(pendingMode = null) {
  const pending = pendingMode !== null;

  return {
    pending,
    requestedMode: pendingMode,
    requiresPrivacyConfirmation: pending,
    privacyImpact: pending ? clone(PRIVACY_IMPACT[pendingMode]) : null
  };
}

function normalizeActionLimit(value, mode) {
  const limit = Number(value);

  if (!Number.isInteger(limit)) {
    throw new Error('Agent action limit must be an integer.');
  }

  if (limit < 0) {
    throw new Error('Agent action limit cannot be negative.');
  }

  return mode === 'off' ? 0 : limit;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redactPortableAgentSettings(input) {
  const portable = clone(input);

  for (const field of AGENT_SETTINGS_EXCLUDED_FIELDS) {
    delete portable[field];
  }

  return portable;
}

function collectChanges(before, after, prefix = '') {
  const changes = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const previous = before?.[key];
    const next = after?.[key];

    if (isPlainObject(previous) && isPlainObject(next)) {
      changes.push(...collectChanges(previous, next, path));
    } else if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes.push({ path, before: clone(previous), after: clone(next) });
    }
  }

  return changes;
}

function previewPortableAgentSettingsImport(payload, currentSettings) {
  if (!isPlainObject(payload)) {
    throw new Error('Agent settings import payload must be an object.');
  }

  if (payload.kind !== AGENT_SETTINGS_EXPORT_KIND) {
    throw new Error(`Unsupported agent settings export kind: ${payload.kind}.`);
  }

  if (!Number.isInteger(payload.schemaVersion)) {
    throw new Error('Agent settings import schemaVersion must be an integer.');
  }

  if (payload.schemaVersion > 1) {
    throw new Error(`Agent settings schema version ${payload.schemaVersion} is newer than this client supports (1).`);
  }

  if (!isPlainObject(payload.settings)) {
    throw new Error('Agent settings import settings must be an object.');
  }

  const candidate = {
    ...currentSettings,
    ...redactPortableAgentSettings(payload.settings)
  };
  const validation = validateAgentSettings(candidate);

  return {
    valid: validation.valid,
    errors: validation.errors,
    schemaVersion: payload.schemaVersion,
    excludedFields: [...AGENT_SETTINGS_EXCLUDED_FIELDS],
    changes: validation.settings ? collectChanges(currentSettings, validation.settings) : [],
    settings: validation.settings
  };
}

export function createAgentSettingsView(options = {}) {
  let settings = createAgentSettings(options.initialSettings);
  let pendingMode = null;

  function save(nextSettings) {
    const validation = validateAgentSettings(nextSettings);

    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    settings = validation.settings;
    return state();
  }

  function state() {
    return {
      mode: {
        selected: settings.mode,
        options: modeOptions()
      },
      model: {
        providers: AGENT_MODEL_PROVIDERS.map((provider) => ({ id: provider })),
        selected: clone(settings.model)
      },
      providerConfig: {
        types: AGENT_PROVIDER_TYPES.map((type) => ({ id: type })),
        selected: clone(settings.providerConfig)
      },
      privacy: {
        allowCloudProcessing: settings.allowCloudProcessing,
        impacts: clone(PRIVACY_IMPACT)
      },
      approvals: {
        requireConfirmation: settings.requireConfirmation
      },
      actionLimits: {
        maxAutonomousActionsPerHour: settings.maxAutonomousActionsPerHour,
        disabled: settings.mode === 'off'
      },
      activation: activationState(pendingMode),
      settings: clone(settings)
    };
  }

  return Object.freeze({
    getState() {
      return state();
    },
    selectMode(value) {
      const mode = normalizeAgentMode(value);

      if (AGENT_PRIVACY_IMPACT_MODES.includes(mode)) {
        pendingMode = mode;
        return state();
      }

      pendingMode = null;
      return save({
        ...settings,
        mode,
        allowCloudProcessing: false,
        maxAutonomousActionsPerHour: mode === 'off' ? 0 : settings.maxAutonomousActionsPerHour
      });
    },
    confirmPrivacyImpact() {
      if (pendingMode === null) {
        return state();
      }

      const mode = pendingMode;
      pendingMode = null;
      return save({
        ...settings,
        mode,
        allowCloudProcessing: true
      });
    },
    cancelPrivacyImpact() {
      pendingMode = null;
      return state();
    },
    setModelPreference(value) {
      return save({
        ...settings,
        model: normalizeModelPreference(value)
      });
    },
    setProviderConfig(value) {
      const validation = normalizeAgentProviderConfig(value);

      if (!validation.valid) {
        throw new Error(validation.errors.join(' '));
      }

      return save({
        ...settings,
        providerConfig: validation.config
      });
    },
    clearProviderConfig() {
      return save({
        ...settings,
        providerConfig: null
      });
    },
    setRequireConfirmation(value) {
      return save({
        ...settings,
        requireConfirmation: value === true
      });
    },
    setActionLimit(value) {
      return save({
        ...settings,
        maxAutonomousActionsPerHour: normalizeActionLimit(value, settings.mode)
      });
    },
    exportSettings() {
      return clone(settings);
    },
    exportPortableSettings() {
      return {
        kind: AGENT_SETTINGS_EXPORT_KIND,
        schemaVersion: 1,
        excludedFields: [...AGENT_SETTINGS_EXCLUDED_FIELDS],
        settings: redactPortableAgentSettings(settings)
      };
    },
    previewImport(payload) {
      return previewPortableAgentSettingsImport(payload, settings);
    },
    applyImport(payloadOrPreview) {
      const preview = payloadOrPreview?.valid === true && payloadOrPreview.settings
        ? payloadOrPreview
        : previewPortableAgentSettingsImport(payloadOrPreview, settings);

      if (!preview.valid) {
        throw new Error(preview.errors.join(' '));
      }

      return save(preview.settings);
    }
  });
}
