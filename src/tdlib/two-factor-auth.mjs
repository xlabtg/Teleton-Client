export const TWO_FACTOR_AUTH_STEPS = Object.freeze([
  'idle',
  'password_required',
  'password_submitting',
  'recovery_required',
  'recovery_submitting',
  'ready',
  'failed',
  'cancelled'
]);

const TD_AUTH_WAIT_PASSWORD = 'authorizationStateWaitPassword';
const SECURE_REFERENCE_PATTERN = /\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+\b/g;
const RECOVERY_CODE_PATTERN = /\b\d{5,8}\b/g;
const PASSWORD_PHRASE_PATTERN = /\b(password|passcode)\s+([^\s.:\n;]+)/gi;
const PASSWORD_LABEL_PATTERN = /\b(password|passcode)\s*:\s*\S+/gi;

const DEFAULT_TWO_FACTOR_SETTINGS = Object.freeze({
  passwordHintsEnabled: true,
  recoveryGuidanceEnabled: true,
  failureFeedbackEnabled: true
});

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStep(value) {
  const step = String(value ?? 'idle').trim();
  return TWO_FACTOR_AUTH_STEPS.includes(step) ? step : 'idle';
}

function tdlibField(input, camelCase, snakeCase, fallback = undefined) {
  return input[camelCase] ?? input[snakeCase] ?? fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeSettings(settings = {}) {
  const source = settings.security?.twoFactor ?? settings.twoFactor ?? settings;

  return {
    passwordHintsEnabled:
      typeof source.passwordHintsEnabled === 'boolean'
        ? source.passwordHintsEnabled
        : DEFAULT_TWO_FACTOR_SETTINGS.passwordHintsEnabled,
    recoveryGuidanceEnabled:
      typeof source.recoveryGuidanceEnabled === 'boolean'
        ? source.recoveryGuidanceEnabled
        : DEFAULT_TWO_FACTOR_SETTINGS.recoveryGuidanceEnabled,
    failureFeedbackEnabled:
      typeof source.failureFeedbackEnabled === 'boolean'
        ? source.failureFeedbackEnabled
        : DEFAULT_TWO_FACTOR_SETTINGS.failureFeedbackEnabled
  };
}

function feedback(tone, message) {
  return Object.freeze({
    tone,
    message: sanitizeTwoFactorFeedback(message)
  });
}

function feedbackForStep(step, settings, inputFeedback = null) {
  if (inputFeedback !== null && inputFeedback !== undefined) {
    if (isPlainObject(inputFeedback)) {
      return feedback(inputFeedback.tone ?? 'info', inputFeedback.message ?? '');
    }

    return feedback(step === 'failed' ? 'danger' : 'info', inputFeedback);
  }

  if (step === 'password_required') {
    return feedback('info', 'Enter your two-factor authentication password.');
  }

  if (step === 'password_submitting') {
    return feedback('info', 'Checking two-factor authentication password.');
  }

  if (step === 'recovery_required') {
    if (settings.recoveryGuidanceEnabled) {
      return feedback('info', 'Enter the recovery code sent to your recovery email address.');
    }

    return feedback('info', 'Enter the recovery code.');
  }

  if (step === 'recovery_submitting') {
    return feedback('info', 'Checking recovery code.');
  }

  if (step === 'ready') {
    return feedback('success', 'Two-factor authentication completed.');
  }

  if (step === 'cancelled') {
    return feedback('warning', 'Two-factor authentication cancelled.');
  }

  if (step === 'failed') {
    return feedback('danger', 'Two-factor authentication failed.');
  }

  return feedback('info', 'Two-factor authentication is idle.');
}

function promptForStep(step, input, settings, draft = {}) {
  if (step === 'password_required' || step === 'password_submitting') {
    const hint = settings.passwordHintsEnabled ? normalizeText(tdlibField(input, 'passwordHint', 'password_hint')) : null;
    const passwordLength = draft.passwordLength ?? 0;

    return Object.freeze({
      kind: 'password',
      label: 'Two-factor authentication password',
      hint,
      passwordPresent: passwordLength > 0,
      passwordLength,
      disabled: step === 'password_submitting'
    });
  }

  if (step === 'recovery_required' || step === 'recovery_submitting') {
    const recoveryCodeLength = draft.recoveryCodeLength ?? 0;

    return Object.freeze({
      kind: 'recovery_code',
      label: 'Two-factor recovery code',
      recoveryCodePresent: recoveryCodeLength > 0,
      recoveryCodeLength,
      disabled: step === 'recovery_submitting'
    });
  }

  return null;
}

function recoveryForStep(step, input, settings) {
  const emailPattern = normalizeText(tdlibField(input, 'recoveryEmailPattern', 'recovery_email_address_pattern'));
  const available = normalizeBoolean(tdlibField(input, 'hasRecoveryEmail', 'has_recovery_email_address'), emailPattern !== null);
  const required = step === 'recovery_required' || step === 'recovery_submitting';
  const guidance = settings.recoveryGuidanceEnabled
    ? `Use the recovery code Telegram sends${emailPattern ? ` to ${emailPattern}` : ' to your recovery email address'}.`
    : null;

  return Object.freeze({
    available,
    required,
    emailPattern,
    guidance,
    actions: available ? ['request_recovery_code'] : []
  });
}

function uiHooksForStep(step, recovery) {
  const actions = [];

  if (step === 'password_required') {
    actions.push('submit_password');
    if (recovery.available) {
      actions.push('request_recovery_code');
    }
    actions.push('cancel');
  } else if (step === 'password_submitting') {
    actions.push('cancel');
  } else if (step === 'recovery_required') {
    actions.push('submit_recovery_code', 'cancel');
  } else if (step === 'recovery_submitting') {
    actions.push('cancel');
  } else if (step === 'cancelled' || step === 'failed') {
    actions.push('restart_authentication');
  }

  return Object.freeze({
    settingsRoute: 'settings.security.twoFactor',
    settingsSection: 'security',
    actions
  });
}

function sessionForState(step, input) {
  if (step !== 'ready') {
    return null;
  }

  const session = {};

  for (const field of ['userId', 'authorizationState']) {
    if (input[field] !== undefined) {
      session[field] = input[field];
    }
  }

  if (input.session && isPlainObject(input.session)) {
    Object.assign(session, clone(input.session));
  }

  return Object.freeze(session);
}

function normalizeTdlibState(input = {}) {
  if (input.step !== undefined) {
    return normalizeStep(input.step);
  }

  if (input.authorizationState !== undefined) {
    return normalizeStep(input.authorizationState);
  }

  const type = input['@type'] ?? input.type;

  if (type === TD_AUTH_WAIT_PASSWORD) {
    return 'password_required';
  }

  if (type === 'authorizationStateReady') {
    return 'ready';
  }

  return 'idle';
}

export function sanitizeTwoFactorFeedback(message) {
  return String(message ?? '')
    .replace(SECURE_REFERENCE_PATTERN, '[redacted]')
    .replace(PASSWORD_LABEL_PATTERN, '$1: [redacted]')
    .replace(PASSWORD_PHRASE_PATTERN, '$1 [redacted]')
    .replace(RECOVERY_CODE_PATTERN, '[redacted]');
}

export function normalizeTwoFactorAuthState(input = {}, options = {}) {
  const settings = normalizeSettings(options.settings ?? input.settings);
  const step = normalizeTdlibState(input);
  const draft = {
    passwordLength: Number.isInteger(options.passwordLength) ? options.passwordLength : 0,
    recoveryCodeLength: Number.isInteger(options.recoveryCodeLength) ? options.recoveryCodeLength : 0
  };
  const attempts = {
    password: Number.isInteger(input.attempts?.password) ? input.attempts.password : 0,
    recovery: Number.isInteger(input.attempts?.recovery) ? input.attempts.recovery : 0
  };
  const recovery = recoveryForStep(step, input, settings);
  const prompt = promptForStep(step, input, settings, draft);

  return Object.freeze({
    step,
    pending: step === 'password_submitting' || step === 'recovery_submitting',
    prompt,
    recovery,
    feedback: settings.failureFeedbackEnabled === false && (step === 'failed' || input.error)
      ? feedback('danger', 'Two-factor authentication failed.')
      : feedbackForStep(step, settings, input.feedback),
    attempts,
    ui: uiHooksForStep(step, recovery),
    session: sessionForState(step, input)
  });
}

function safeLog(logger, entry) {
  if (typeof logger !== 'function') {
    return;
  }

  try {
    logger(Object.freeze(entry));
  } catch {
    // Logging is best effort and must not break authentication state transitions.
  }
}

function normalizeAuthResult(result, fallback = {}) {
  if (result === undefined || result === null) {
    return fallback;
  }

  if (!isPlainObject(result)) {
    return fallback;
  }

  return result;
}

function invalidPasswordState(error, attempts, baseInput, settings) {
  return normalizeTwoFactorAuthState(
    {
      ...baseInput,
      step: 'password_required',
      attempts,
      feedback: {
        tone: 'danger',
        message: error?.code === 'PASSWORD_HASH_INVALID'
          ? 'Invalid two-factor password. Try again or use recovery.'
          : `Invalid two-factor password. ${error?.message ?? ''}`
      }
    },
    { settings }
  );
}

function invalidRecoveryState(error, attempts, baseInput, settings) {
  return normalizeTwoFactorAuthState(
    {
      ...baseInput,
      step: 'recovery_required',
      attempts,
      feedback: {
        tone: 'danger',
        message: error?.code === 'RECOVERY_CODE_INVALID'
          ? 'Invalid recovery code. Check the code and try again.'
          : `Invalid recovery code. ${error?.message ?? ''}`
      }
    },
    { settings }
  );
}

export function createTwoFactorAuthController(options = {}) {
  const bridge = options.bridge ?? {};
  const settings = normalizeSettings(options.settings);
  const logger = options.logger;
  const baseInput = isPlainObject(options.initialAuthorizationState) ? clone(options.initialAuthorizationState) : {};
  let state = normalizeTwoFactorAuthState(baseInput, { settings });
  let passwordDraft = '';
  let recoveryCodeDraft = '';

  function withDraft() {
    return normalizeTwoFactorAuthState(
      {
        ...baseInput,
        step: state.step,
        attempts: state.attempts,
        feedback: state.feedback,
        session: state.session
      },
      {
        settings,
        passwordLength: passwordDraft.length,
        recoveryCodeLength: recoveryCodeDraft.length
      }
    );
  }

  function save(next) {
    state = next;
    return state;
  }

  return Object.freeze({
    getState() {
      return withDraft();
    },
    applyAuthorizationState(input = {}) {
      passwordDraft = '';
      recoveryCodeDraft = '';
      Object.assign(baseInput, clone(input));
      return save(normalizeTwoFactorAuthState(baseInput, { settings }));
    },
    updatePassword(value = '') {
      passwordDraft = String(value);
      return withDraft();
    },
    updateRecoveryCode(value = '') {
      recoveryCodeDraft = String(value).trim();
      return withDraft();
    },
    async submitPassword() {
      const password = passwordDraft;
      passwordDraft = '';
      save(normalizeTwoFactorAuthState({ ...baseInput, step: 'password_submitting', attempts: state.attempts }, { settings }));

      try {
        if (typeof bridge.submitPassword !== 'function') {
          throw new Error('Two-factor password bridge is not configured.');
        }

        const result = normalizeAuthResult(await bridge.submitPassword({ password }), { step: 'ready' });
        safeLog(logger, {
          event: 'auth.two_factor.password_submitted',
          outcome: normalizeStep(result.step) === 'ready' ? 'success' : 'continue',
          passwordLength: password.length
        });

        return save(normalizeTwoFactorAuthState({ ...baseInput, ...result }, { settings }));
      } catch (error) {
        const attempts = {
          ...state.attempts,
          password: state.attempts.password + 1
        };
        safeLog(logger, {
          event: 'auth.two_factor.password_failed',
          outcome: 'failure',
          code: error?.code ?? null,
          message: sanitizeTwoFactorFeedback(error?.message)
        });

        return save(invalidPasswordState(error, attempts, baseInput, settings));
      }
    },
    async requestRecoveryCode() {
      recoveryCodeDraft = '';

      try {
        if (typeof bridge.requestRecoveryCode !== 'function') {
          throw new Error('Two-factor recovery bridge is not configured.');
        }

        const result = normalizeAuthResult(await bridge.requestRecoveryCode(), { step: 'recovery_required' });
        Object.assign(baseInput, clone(result));
        safeLog(logger, {
          event: 'auth.two_factor.recovery_requested',
          outcome: 'requested'
        });

        return save(normalizeTwoFactorAuthState({ ...baseInput, ...result, step: 'recovery_required' }, { settings }));
      } catch (error) {
        safeLog(logger, {
          event: 'auth.two_factor.recovery_request_failed',
          outcome: 'failure',
          code: error?.code ?? null,
          message: sanitizeTwoFactorFeedback(error?.message)
        });

        return save(
          normalizeTwoFactorAuthState(
            {
              ...baseInput,
              step: 'password_required',
              attempts: state.attempts,
              feedback: {
                tone: 'danger',
                message: `Recovery code request failed. ${error?.message ?? ''}`
              }
            },
            { settings }
          )
        );
      }
    },
    async submitRecoveryCode() {
      const code = recoveryCodeDraft;
      recoveryCodeDraft = '';
      save(normalizeTwoFactorAuthState({ ...baseInput, step: 'recovery_submitting', attempts: state.attempts }, { settings }));

      try {
        if (typeof bridge.submitRecoveryCode !== 'function') {
          throw new Error('Two-factor recovery bridge is not configured.');
        }

        const result = normalizeAuthResult(await bridge.submitRecoveryCode({ code }), { step: 'ready' });
        safeLog(logger, {
          event: 'auth.two_factor.recovery_submitted',
          outcome: normalizeStep(result.step) === 'ready' ? 'success' : 'continue',
          recoveryCodeLength: code.length
        });

        return save(normalizeTwoFactorAuthState({ ...baseInput, ...result }, { settings }));
      } catch (error) {
        const attempts = {
          ...state.attempts,
          recovery: state.attempts.recovery + 1
        };
        safeLog(logger, {
          event: 'auth.two_factor.recovery_failed',
          outcome: 'failure',
          code: error?.code ?? null,
          message: sanitizeTwoFactorFeedback(error?.message)
        });

        return save(invalidRecoveryState(error, attempts, baseInput, settings));
      }
    },
    async cancel() {
      passwordDraft = '';
      recoveryCodeDraft = '';

      if (typeof bridge.cancel === 'function') {
        await bridge.cancel();
      }

      safeLog(logger, {
        event: 'auth.two_factor.cancelled',
        outcome: 'cancelled'
      });

      return save(normalizeTwoFactorAuthState({ ...baseInput, step: 'cancelled' }, { settings }));
    }
  });
}
