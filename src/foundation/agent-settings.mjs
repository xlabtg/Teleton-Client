export const AGENT_MODES = Object.freeze(['off', 'local', 'cloud', 'hybrid']);

const MODE_ALIASES = new Map([
  ['off', 'off'],
  ['disabled', 'off'],
  ['выкл', 'off'],
  ['выключено', 'off'],
  ['local', 'local'],
  ['локально', 'local'],
  ['cloud', 'cloud'],
  ['облако', 'cloud'],
  ['hybrid', 'hybrid'],
  ['гибрид', 'hybrid']
]);

export function normalizeAgentMode(value) {
  const key = String(value ?? '').trim().toLowerCase();
  const normalized = MODE_ALIASES.get(key);

  if (!normalized) {
    throw new Error(`Unsupported agent mode: ${value}`);
  }

  return normalized;
}

export function createAgentSettings(input = {}) {
  const mode = input.mode === undefined ? 'off' : normalizeAgentMode(input.mode);

  return {
    mode,
    model: input.model ?? null,
    requireConfirmation: input.requireConfirmation ?? true,
    allowCloudProcessing: mode === 'cloud' || mode === 'hybrid' ? input.allowCloudProcessing === true : false,
    maxAutonomousActionsPerHour: Number.isInteger(input.maxAutonomousActionsPerHour)
      ? input.maxAutonomousActionsPerHour
      : 0
  };
}

export function validateAgentSettings(input = {}) {
  const errors = [];
  let settings;

  try {
    settings = createAgentSettings(input);
  } catch (error) {
    errors.push(error.message);
  }

  if (settings) {
    if (settings.mode === 'off' && settings.maxAutonomousActionsPerHour !== 0) {
      errors.push('Agent mode off cannot allow autonomous actions.');
    }

    if ((settings.mode === 'cloud' || settings.mode === 'hybrid') && settings.allowCloudProcessing !== true) {
      errors.push('Cloud and hybrid modes require explicit cloud processing consent.');
    }

    if (settings.maxAutonomousActionsPerHour < 0) {
      errors.push('Autonomous action limit cannot be negative.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    settings
  };
}
