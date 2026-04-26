export const AGENT_PROVIDER_TYPES = Object.freeze(['local', 'cloud', 'custom-endpoint']);
export const AGENT_PROVIDER_SECRET_FIELDS = Object.freeze(['apiKeyRef', 'tokenRef']);

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9_.:/-]+$/;
const LOCAL_ENDPOINT_PROTOCOLS = Object.freeze(['http:', 'ipc:', 'unix:']);
const CLOUD_ENDPOINT_PROTOCOLS = Object.freeze(['https:']);
const SECURE_REFERENCE_PATTERN = /^(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSecureReference(value) {
  return typeof value === 'string' && SECURE_REFERENCE_PATTERN.test(value.trim());
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function validateEndpointUrl(value, allowedProtocols, label, errors) {
  const endpointUrl = normalizeOptionalString(value);

  if (!endpointUrl) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    errors.push(`${label} endpointUrl must be a valid URL.`);
    return endpointUrl;
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    errors.push(`${label} endpointUrl must use one of: ${allowedProtocols.join(', ')}.`);
  }

  return endpointUrl;
}

export function normalizeAgentProviderConfig(input = {}) {
  const errors = [];

  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: ['Agent provider configuration must be an object.'],
      config: null
    };
  }

  const id = String(input.id ?? '').trim();
  const type = String(input.type ?? '').trim();
  const modelId = String(input.modelId ?? '').trim();

  const config = {
    id,
    type,
    modelId
  };

  if (!id || !PROVIDER_ID_PATTERN.test(id)) {
    errors.push('Agent provider id must use letters, numbers, dots, dashes, underscores, or colons.');
  }

  if (!AGENT_PROVIDER_TYPES.includes(type)) {
    errors.push(`Agent provider type must be one of: ${AGENT_PROVIDER_TYPES.join(', ')}.`);
  }

  if (!modelId || !MODEL_ID_PATTERN.test(modelId)) {
    errors.push('Agent provider modelId is required and must not contain spaces.');
  }

  const displayName = normalizeOptionalString(input.displayName);
  if (displayName) {
    config.displayName = displayName;
  }

  if (type === 'local') {
    config.endpointUrl = validateEndpointUrl(input.endpointUrl, LOCAL_ENDPOINT_PROTOCOLS, 'Local provider', errors);
    if (input.apiKeyRef !== undefined || input.tokenRef !== undefined) {
      errors.push('Local provider credentials are not stored in shared settings.');
    }
  }

  if (type === 'cloud') {
    config.endpointUrl = validateEndpointUrl(input.endpointUrl, CLOUD_ENDPOINT_PROTOCOLS, 'Cloud provider', errors);
    const credentialRef = input.apiKeyRef ?? input.tokenRef;

    if (!isSecureReference(credentialRef)) {
      errors.push('Cloud provider credentials must use apiKeyRef or tokenRef secure references.');
    } else if (input.apiKeyRef !== undefined) {
      config.apiKeyRef = String(input.apiKeyRef).trim();
    } else {
      config.tokenRef = String(input.tokenRef).trim();
    }

    config.requiresCloudOptIn = true;
  }

  if (type === 'custom-endpoint') {
    config.endpointUrl = validateEndpointUrl(input.endpointUrl, CLOUD_ENDPOINT_PROTOCOLS, 'Custom endpoint provider', errors);
    const credentialRef = input.apiKeyRef ?? input.tokenRef;

    if (credentialRef !== undefined) {
      if (!isSecureReference(credentialRef)) {
        errors.push('Custom endpoint credentials must use secure references when configured.');
      } else if (input.apiKeyRef !== undefined) {
        config.apiKeyRef = String(input.apiKeyRef).trim();
      } else {
        config.tokenRef = String(input.tokenRef).trim();
      }
    }

    config.requiresCloudOptIn = true;
  }

  return {
    valid: errors.length === 0,
    errors,
    config
  };
}

export function validateAgentProviderConfig(input = {}) {
  const result = normalizeAgentProviderConfig(input);

  return {
    valid: result.valid,
    errors: result.errors,
    config: result.config
  };
}
