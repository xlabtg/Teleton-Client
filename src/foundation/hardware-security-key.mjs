export const HARDWARE_SECURITY_KEY_PROTOCOLS = Object.freeze([
  'fido2-webauthn',
  'fido2-ctap2',
  'fido-u2f-ctap1'
]);

export const HARDWARE_SECURITY_KEY_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);

export const HARDWARE_SECURITY_KEY_FALLBACK_BEHAVIORS = Object.freeze([
  'two_factor_or_password',
  'device_lock_then_password',
  'block_high_risk_action'
]);

export const HARDWARE_SECURITY_KEY_STEPS = Object.freeze([
  'idle',
  'unsupported',
  'registration_challenge',
  'registration_platform_prompt',
  'registration_verifying',
  'registered',
  'authentication_challenge',
  'authentication_platform_prompt',
  'authentication_verifying',
  'verified',
  'fallback_required',
  'failed',
  'cancelled'
]);

export const HARDWARE_SECURITY_KEY_PROTECTED_RISK_LEVELS = Object.freeze(['review-required', 'high']);

export const DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS = deepFreeze({
  enabled: false,
  requireForHighRiskActions: false,
  requireForAccountProtection: false,
  fallbackBehavior: 'two_factor_or_password',
  releaseReviewed: false
});

const DEFAULT_TRANSPORTS = Object.freeze(['usb', 'nfc', 'ble']);

const HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES = deepFreeze({
  registration: {
    challengeBoundary: 'server:hardwareKeys.registrationChallenge',
    platformBoundary: 'platform:hardwareKeys.createCredential',
    verificationBoundary: 'server:hardwareKeys.verifyRegistration'
  },
  challenge: {
    challengeBoundary: 'server:hardwareKeys.authenticationChallenge',
    platformBoundary: 'platform:hardwareKeys.getAssertion',
    verificationBoundary: 'server:hardwareKeys.verifyAuthentication'
  }
});

const PLATFORM_API_MATRIX = deepFreeze({
  web: {
    api: 'WebAuthn PublicKeyCredential via navigator.credentials.create() and navigator.credentials.get()',
    protocols: HARDWARE_SECURITY_KEY_PROTOCOLS,
    transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    requirements: [
      {
        key: 'secureContext',
        reason: 'secure-context-required',
        description: 'WebAuthn hardware key ceremonies require HTTPS, localhost, or another secure context.'
      },
      {
        key: 'publicKeyCredential',
        reason: 'public-key-credential-unavailable',
        description: 'PublicKeyCredential is unavailable in this browser or wrapper.'
      }
    ]
  },
  ios: {
    api:
      'AuthenticationServices ASAuthorizationSecurityKeyPublicKeyCredentialProvider and ASAuthorizationPlatformPublicKeyCredentialProvider',
    protocols: HARDWARE_SECURITY_KEY_PROTOCOLS,
    transports: ['usb', 'nfc', 'ble', 'hybrid'],
    requirements: [
      {
        key: 'authenticationServices',
        reason: 'authentication-services-unavailable',
        description: 'AuthenticationServices is unavailable in the current iOS runtime.'
      },
      {
        key: 'securityKeyCredentialProvider',
        reason: 'security-key-provider-unavailable',
        description: 'The iOS security key public-key credential provider is unavailable.'
      }
    ]
  },
  android: {
    api: 'Android Credential Manager public key credential APIs for passkeys and hardware-backed FIDO authenticators',
    protocols: HARDWARE_SECURITY_KEY_PROTOCOLS,
    transports: ['usb', 'nfc', 'ble', 'hybrid'],
    requirements: [
      {
        key: 'credentialManager',
        reason: 'credential-manager-unavailable',
        description: 'Android Credential Manager is unavailable in the current wrapper.'
      },
      {
        key: 'publicKeyCredentials',
        reason: 'public-key-credentials-unavailable',
        description: 'Public-key credential creation or assertion is unavailable through Android Credential Manager.'
      }
    ]
  },
  desktop: {
    api: 'Electron or Chromium WebAuthn PublicKeyCredential, or a reviewed native FIDO2 bridge',
    protocols: HARDWARE_SECURITY_KEY_PROTOCOLS,
    transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    requirements: [
      {
        key: 'publicKeyCredential',
        reason: 'public-key-credential-unavailable',
        description: 'Renderer WebAuthn is unavailable.'
      },
      {
        key: 'secureContext',
        reason: 'secure-context-required',
        description: 'Renderer WebAuthn requires a secure context.'
      }
    ],
    alternativeRequirement: {
      key: 'nativeFido2Bridge',
      reason: 'native-fido2-bridge-unavailable',
      description: 'A reviewed native FIDO2 bridge is unavailable.'
    }
  }
});

const FALLBACK_DESCRIPTIONS = Object.freeze({
  two_factor_or_password:
    'Two-factor authentication or password approval remains available when hardware security keys are unavailable.',
  device_lock_then_password:
    'Device lock approval is attempted first, then password or two-factor authentication remains available.',
  block_high_risk_action:
    'High-risk actions are blocked when a required hardware security key is unavailable.'
});

const RELEASE_REVIEW_CHECKLIST = Object.freeze([
  'Confirm platform capability detection is implemented before showing registration or assertion prompts.',
  'Review relying-party id, origin, app link, and package or bundle identifier binding for each wrapper.',
  'Confirm fallback authentication copy and blocking behavior for unavailable hardware keys.',
  'Verify attestation, assertion, challenge, and credential diagnostics are redacted from logs and screenshots.',
  'Approve release enablement through human security review before hardware key requirements are turned on.'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function booleanError(value, label, errors) {
  if (typeof value !== 'boolean') {
    errors.push(`${label} must be true or false.`);
  }
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!HARDWARE_SECURITY_KEY_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported hardware security key platform: ${value}`);
  }

  return platform;
}

function normalizeCapabilities(options = {}) {
  const capabilities = options.capabilities ?? options.platformCapabilities ?? {};
  return isPlainObject(capabilities) ? capabilities : {};
}

function normalizeFallbackBehavior(value, errors) {
  const fallbackBehavior = String(value ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS.fallbackBehavior).trim();

  if (!HARDWARE_SECURITY_KEY_FALLBACK_BEHAVIORS.includes(fallbackBehavior)) {
    errors.push(
      `Hardware security key fallbackBehavior must be one of: ${HARDWARE_SECURITY_KEY_FALLBACK_BEHAVIORS.join(', ')}.`
    );
  }

  return fallbackBehavior;
}

function normalizeHardwareKeySettingsInput(input = {}) {
  return isPlainObject(input) ? input : DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS;
}

function summarizeCapabilities(platform, capabilities) {
  const matrix = PLATFORM_API_MATRIX[platform];
  const keys = new Set(matrix.requirements.map((requirement) => requirement.key));
  if (matrix.alternativeRequirement) {
    keys.add(matrix.alternativeRequirement.key);
  }

  const summary = {};
  for (const key of keys) {
    summary[key] = capabilities[key] === true;
  }

  return summary;
}

function findCapabilityFailures(platform, capabilities) {
  const matrix = PLATFORM_API_MATRIX[platform];

  if (platform === 'desktop' && capabilities.nativeFido2Bridge === true) {
    return [];
  }

  const failures = matrix.requirements.filter((requirement) => capabilities[requirement.key] !== true);

  if (platform === 'desktop' && failures.length > 0) {
    return [
      {
        reason: 'desktop-webauthn-or-native-bridge-unavailable',
        description:
          'Desktop hardware key support requires renderer WebAuthn in a secure context or a reviewed native FIDO2 bridge.'
      }
    ];
  }

  return failures.map((failure) => ({
    reason: failure.reason,
    description: failure.description
  }));
}

function normalizeChallengeId(challenge, label) {
  const id = String(challenge?.challengeId ?? challenge?.id ?? '').trim();

  if (!id) {
    throw new Error(`Hardware security key ${label} challenge id is required.`);
  }

  return id;
}

function normalizeAccount(input = {}) {
  const accountId = String(input.accountId ?? input.account?.id ?? '').trim();

  if (!accountId) {
    throw new Error('Hardware security key accountId is required.');
  }

  return {
    accountId,
    userHandle: input.userHandle === undefined ? null : String(input.userHandle),
    displayName: input.displayName === undefined ? null : String(input.displayName),
    requestedBy: input.requestedBy === undefined ? null : String(input.requestedBy)
  };
}

function normalizeAction(input = {}) {
  const actionId = String(input.actionId ?? input.id ?? '').trim();

  if (!actionId) {
    throw new Error('Hardware security key actionId is required.');
  }

  return {
    actionId,
    accountId: String(input.accountId ?? '').trim() || null,
    riskLevel: String(input.riskLevel ?? '').trim() || null,
    requestedBy: input.requestedBy === undefined ? null : String(input.requestedBy)
  };
}

function normalizeCredentialSummary(credential = {}) {
  const id = String(credential.id ?? credential.credentialId ?? credential.rawId ?? '').trim();

  if (!id) {
    throw new Error('Hardware security key credential id is required.');
  }

  const transports = Array.isArray(credential.transports)
    ? [...new Set(credential.transports.map((transport) => String(transport).trim()).filter(Boolean))].sort()
    : [];

  return {
    id,
    type: String(credential.type ?? 'public-key'),
    transports
  };
}

function normalizeVerificationResult(result = {}, credentialId, timestampField) {
  if (result?.verified !== true) {
    throw new Error('Hardware security key verification failed.');
  }

  return {
    verified: true,
    credentialId: String(result.credentialId ?? credentialId),
    [timestampField]: result[timestampField] === undefined ? null : String(result[timestampField])
  };
}

function challengeSummary(challengeId, kind) {
  return {
    id: challengeId,
    kind,
    publicKeyOptionsReceived: true
  };
}

function sanitizeHardwareKeyDiagnostic(value) {
  return String(value ?? '')
    .replace(/\b(?:challenge|attestationObject|clientDataJSON|authenticatorData|signature)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b\S*secret\S*\b/gi, '[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, '[redacted]');
}

function safeLog(logger, entry) {
  if (typeof logger !== 'function') {
    return;
  }

  try {
    logger(Object.freeze(entry));
  } catch {
    // Logging is best effort and must not break hardware key ceremony state transitions.
  }
}

function requireBridgeMethod(bridge, method) {
  if (!bridge || typeof bridge[method] !== 'function') {
    throw new Error(`Hardware security key bridge requires ${method}().`);
  }
}

function createState(input) {
  return Object.freeze({
    step: input.step,
    platform: input.platform,
    supported: input.supported,
    reason: input.reason ?? null,
    fallback: input.fallback ?? null,
    flow: input.flow ?? null,
    challenge: input.challenge ?? null,
    credential: input.credential ?? null,
    assertion: input.assertion ?? null,
    error: input.error ?? null
  });
}

export function normalizeHardwareSecurityKeySettings(input = {}) {
  const errors = [];

  if (input !== undefined && !isPlainObject(input)) {
    errors.push('Hardware security key settings must be an object.');
  }

  const source = normalizeHardwareKeySettingsInput(input);
  const settings = {
    enabled: source.enabled ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS.enabled,
    requireForHighRiskActions:
      source.requireForHighRiskActions ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS.requireForHighRiskActions,
    requireForAccountProtection:
      source.requireForAccountProtection ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS.requireForAccountProtection,
    fallbackBehavior: normalizeFallbackBehavior(source.fallbackBehavior, errors),
    releaseReviewed: source.releaseReviewed ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS.releaseReviewed
  };

  booleanError(settings.enabled, 'Hardware security key enabled', errors);
  booleanError(settings.requireForHighRiskActions, 'Hardware security key requireForHighRiskActions', errors);
  booleanError(settings.requireForAccountProtection, 'Hardware security key requireForAccountProtection', errors);
  booleanError(settings.releaseReviewed, 'Hardware security key releaseReviewed', errors);

  if (settings.requireForHighRiskActions === true && settings.enabled !== true) {
    errors.push('Hardware security key high-risk action requirements need hardware key support enabled.');
  }

  if (settings.requireForAccountProtection === true && settings.enabled !== true) {
    errors.push('Hardware security key account protection requirements need hardware key support enabled.');
  }

  if (
    (settings.enabled === true ||
      settings.requireForHighRiskActions === true ||
      settings.requireForAccountProtection === true) &&
    settings.releaseReviewed !== true
  ) {
    errors.push('Human security review is required before enabling hardware security key flows.');
  }

  return {
    valid: errors.length === 0,
    errors,
    settings
  };
}

export function createHardwareSecurityKeyFallbackPlan(input = {}) {
  const errors = [];
  const behavior = normalizeFallbackBehavior(input.behavior, errors);

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return Object.freeze({
    required: input.required === true,
    behavior,
    reason: input.reason ?? null,
    explicit: true,
    description: FALLBACK_DESCRIPTIONS[behavior]
  });
}

export function createHardwareSecurityKeyReleasePlan(input = {}) {
  const normalized = normalizeHardwareSecurityKeySettings(input.settings);
  const settings = normalized.settings;

  return Object.freeze({
    humanReviewRequired: true,
    releaseEnabled: settings.enabled === true && settings.releaseReviewed === true,
    reviewStatus: settings.releaseReviewed === true ? 'approved' : 'required',
    checklist: [...RELEASE_REVIEW_CHECKLIST]
  });
}

export function createHardwareSecurityKeyCapabilityPlan(platform, options = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  const matrix = PLATFORM_API_MATRIX[normalizedPlatform];
  const capabilities = normalizeCapabilities(options);
  const settingsResult = normalizeHardwareSecurityKeySettings(options.settings ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS);
  const settings = settingsResult.settings;
  const failures = findCapabilityFailures(normalizedPlatform, capabilities);
  const supported = failures.length === 0;
  const reason = supported ? 'supported' : failures[0].reason;

  return deepFreeze({
    platform: normalizedPlatform,
    supported,
    reason,
    reasons: failures,
    api: matrix.api,
    protocols: [...matrix.protocols],
    transports: [...matrix.transports],
    capabilities: summarizeCapabilities(normalizedPlatform, capabilities),
    requiredCapabilities: matrix.requirements.map((requirement) => ({ ...requirement })),
    flows: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES),
    fallback: createHardwareSecurityKeyFallbackPlan({
      required: !supported,
      behavior: settings.fallbackBehavior,
      reason: supported ? null : reason
    }),
    release: createHardwareSecurityKeyReleasePlan({ settings })
  });
}

export function createHardwareSecurityKeyActionGate(action = {}, options = {}) {
  const settingsResult = normalizeHardwareSecurityKeySettings(options.settings ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS);
  if (!settingsResult.valid) {
    throw new Error(settingsResult.errors.join(' '));
  }

  const settings = settingsResult.settings;
  const actionId = String(action.id ?? action.actionId ?? '').trim();
  const riskLevel = String(action.riskLevel ?? '').trim();
  const highRisk =
    HARDWARE_SECURITY_KEY_PROTECTED_RISK_LEVELS.includes(riskLevel) || action.requiresUserConfirmation === true;
  const capabilityPlan =
    options.capabilityPlan ??
    createHardwareSecurityKeyCapabilityPlan(options.platform ?? action.platform ?? 'web', {
      capabilities: options.capabilities,
      settings
    });
  const required = settings.enabled === true && settings.requireForHighRiskActions === true && highRisk;

  if (!required) {
    return Object.freeze({
      actionId,
      riskLevel,
      highRisk,
      required: false,
      allowed: true,
      approvalMethod: null,
      reason: 'hardware-security-key-not-required',
      fallback: null
    });
  }

  if (capabilityPlan.supported) {
    return Object.freeze({
      actionId,
      riskLevel,
      highRisk,
      required: true,
      allowed: true,
      approvalMethod: 'hardware_security_key',
      reason: 'hardware-security-key-supported',
      fallback: null
    });
  }

  const blocked = settings.fallbackBehavior === 'block_high_risk_action';

  return Object.freeze({
    actionId,
    riskLevel,
    highRisk,
    required: true,
    allowed: !blocked,
    approvalMethod: blocked ? null : settings.fallbackBehavior,
    reason: 'hardware-security-key-unavailable',
    fallback: capabilityPlan.fallback
  });
}

export function createHardwareSecurityKeyAccountProtectionGate(options = {}) {
  const settingsResult = normalizeHardwareSecurityKeySettings(options.settings ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS);
  if (!settingsResult.valid) {
    throw new Error(settingsResult.errors.join(' '));
  }

  const settings = settingsResult.settings;
  const capabilityPlan =
    options.capabilityPlan ??
    createHardwareSecurityKeyCapabilityPlan(options.platform ?? 'web', {
      capabilities: options.capabilities,
      settings
    });
  const required = settings.enabled === true && settings.requireForAccountProtection === true;

  if (!required) {
    return Object.freeze({
      required: false,
      allowed: true,
      approvalMethod: null,
      reason: 'hardware-security-key-account-protection-not-required',
      fallback: null
    });
  }

  if (capabilityPlan.supported) {
    return Object.freeze({
      required: true,
      allowed: true,
      approvalMethod: 'hardware_security_key',
      reason: 'hardware-security-key-supported',
      fallback: null
    });
  }

  return Object.freeze({
    required: true,
    allowed: settings.fallbackBehavior !== 'block_high_risk_action',
    approvalMethod: settings.fallbackBehavior === 'block_high_risk_action' ? null : settings.fallbackBehavior,
    reason: 'hardware-security-key-unavailable',
    fallback: capabilityPlan.fallback
  });
}

export function createHardwareSecurityKeyController(options = {}) {
  const platform = normalizePlatform(options.platform ?? 'web');
  const settingsResult = normalizeHardwareSecurityKeySettings(options.settings ?? DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS);
  if (!settingsResult.valid) {
    throw new Error(settingsResult.errors.join(' '));
  }

  const settings = settingsResult.settings;
  const capabilityPlan = createHardwareSecurityKeyCapabilityPlan(platform, {
    capabilities: options.capabilities,
    settings
  });
  const bridge = options.bridge ?? {};
  const logger = options.logger;
  let state = createState({
    step: capabilityPlan.supported ? 'idle' : 'unsupported',
    platform,
    supported: capabilityPlan.supported,
    reason: capabilityPlan.reason,
    fallback: capabilityPlan.supported ? null : capabilityPlan.fallback
  });

  function save(input) {
    state = createState({
      platform,
      supported: capabilityPlan.supported,
      ...input
    });
    return state;
  }

  function fallbackState(flow) {
    safeLog(logger, {
      event: 'security.hardware_key.fallback_required',
      outcome: 'fallback',
      platform,
      reason: capabilityPlan.reason,
      flow
    });

    return save({
      step: 'fallback_required',
      reason: capabilityPlan.reason,
      fallback: capabilityPlan.fallback,
      flow
    });
  }

  return Object.freeze({
    getState() {
      return clone(state);
    },
    getCapabilityPlan() {
      return clone(capabilityPlan);
    },
    async registerCredential(input = {}) {
      if (!capabilityPlan.supported) {
        return fallbackState('registration');
      }

      try {
        requireBridgeMethod(bridge, 'createRegistrationChallenge');
        requireBridgeMethod(bridge, 'createCredential');
        requireBridgeMethod(bridge, 'verifyRegistration');

        const account = normalizeAccount(input);
        save({
          step: 'registration_challenge',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.registration)
        });

        const challenge = await bridge.createRegistrationChallenge({
          ...account,
          protocols: [...HARDWARE_SECURITY_KEY_PROTOCOLS],
          transports: [...DEFAULT_TRANSPORTS]
        });
        const challengeId = normalizeChallengeId(challenge, 'registration');
        const challengeState = challengeSummary(challengeId, 'registration');
        save({
          step: 'registration_platform_prompt',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.registration),
          challenge: challengeState
        });

        const credential = await bridge.createCredential({
          challengeId,
          publicKey: challenge.publicKey,
          account
        });
        const credentialSummary = normalizeCredentialSummary(credential);
        save({
          step: 'registration_verifying',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.registration),
          challenge: challengeState,
          credential: credentialSummary
        });

        const verification = normalizeVerificationResult(
          await bridge.verifyRegistration({
            challengeId,
            credential,
            account
          }),
          credentialSummary.id,
          'registeredAt'
        );

        safeLog(logger, {
          event: 'security.hardware_key.registration_verified',
          outcome: 'success',
          platform,
          credentialId: verification.credentialId,
          transports: credentialSummary.transports
        });

        return save({
          step: 'registered',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.registration),
          challenge: challengeState,
          credential: {
            ...credentialSummary,
            verified: verification.verified,
            registeredAt: verification.registeredAt
          }
        });
      } catch (error) {
        safeLog(logger, {
          event: 'security.hardware_key.registration_failed',
          outcome: 'failure',
          platform,
          message: sanitizeHardwareKeyDiagnostic(error?.message)
        });

        return save({
          step: 'failed',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.registration),
          error: sanitizeHardwareKeyDiagnostic(error?.message)
        });
      }
    },
    async verifyChallenge(input = {}) {
      if (!capabilityPlan.supported) {
        return fallbackState('challenge');
      }

      try {
        requireBridgeMethod(bridge, 'createAuthenticationChallenge');
        requireBridgeMethod(bridge, 'getAssertion');
        requireBridgeMethod(bridge, 'verifyAuthentication');

        const action = normalizeAction(input);
        save({
          step: 'authentication_challenge',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.challenge)
        });

        const challenge = await bridge.createAuthenticationChallenge({
          ...action,
          protocols: [...HARDWARE_SECURITY_KEY_PROTOCOLS],
          transports: [...DEFAULT_TRANSPORTS]
        });
        const challengeId = normalizeChallengeId(challenge, 'authentication');
        const challengeState = challengeSummary(challengeId, 'authentication');
        save({
          step: 'authentication_platform_prompt',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.challenge),
          challenge: challengeState
        });

        const assertion = await bridge.getAssertion({
          challengeId,
          publicKey: challenge.publicKey,
          action
        });
        const assertionSummary = normalizeCredentialSummary(assertion);
        save({
          step: 'authentication_verifying',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.challenge),
          challenge: challengeState,
          assertion: assertionSummary
        });

        const verification = normalizeVerificationResult(
          await bridge.verifyAuthentication({
            challengeId,
            assertion,
            action
          }),
          assertionSummary.id,
          'verifiedAt'
        );

        safeLog(logger, {
          event: 'security.hardware_key.challenge_verified',
          outcome: 'success',
          platform,
          credentialId: verification.credentialId,
          actionId: action.actionId
        });

        return save({
          step: 'verified',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.challenge),
          challenge: challengeState,
          assertion: {
            ...assertionSummary,
            verified: verification.verified,
            verifiedAt: verification.verifiedAt
          }
        });
      } catch (error) {
        safeLog(logger, {
          event: 'security.hardware_key.challenge_failed',
          outcome: 'failure',
          platform,
          message: sanitizeHardwareKeyDiagnostic(error?.message)
        });

        return save({
          step: 'failed',
          flow: clone(HARDWARE_SECURITY_KEY_FLOW_BOUNDARIES.challenge),
          error: sanitizeHardwareKeyDiagnostic(error?.message)
        });
      }
    },
    async cancel() {
      if (typeof bridge.cancel === 'function') {
        await bridge.cancel();
      }

      safeLog(logger, {
        event: 'security.hardware_key.cancelled',
        outcome: 'cancelled',
        platform
      });

      return save({
        step: 'cancelled'
      });
    }
  });
}
