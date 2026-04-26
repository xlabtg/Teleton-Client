import { AGENT_MODES, createAgentSettings, normalizeAgentMode, validateAgentSettings } from './agent-settings.mjs';
import { AGENT_PROVIDER_TYPES, normalizeAgentProviderConfig } from './agent-provider-config.mjs';

export const AGENT_PRIVACY_IMPACT_MODES = Object.freeze(['cloud', 'hybrid']);

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
    }
  });
}
