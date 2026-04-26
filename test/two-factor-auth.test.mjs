import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TWO_FACTOR_AUTH_STEPS,
  createTwoFactorAuthController,
  normalizeTwoFactorAuthState,
  sanitizeTwoFactorFeedback
} from '../src/tdlib/two-factor-auth.mjs';
import { createTeletonSettings, validateTeletonSettings } from '../src/foundation/settings-model.mjs';

test('two-factor auth state normalizes TDLib password and recovery prompts safely', () => {
  assert.deepEqual(TWO_FACTOR_AUTH_STEPS, [
    'idle',
    'password_required',
    'password_submitting',
    'recovery_required',
    'recovery_submitting',
    'ready',
    'failed',
    'cancelled'
  ]);

  const passwordState = normalizeTwoFactorAuthState({
    '@type': 'authorizationStateWaitPassword',
    password_hint: 'first pet',
    has_recovery_email_address: true,
    recovery_email_address_pattern: 'm***@example.test'
  });

  assert.equal(passwordState.step, 'password_required');
  assert.equal(passwordState.prompt.kind, 'password');
  assert.equal(passwordState.prompt.passwordPresent, false);
  assert.equal(passwordState.prompt.passwordLength, 0);
  assert.equal(passwordState.prompt.hint, 'first pet');
  assert.equal(passwordState.recovery.available, true);
  assert.equal(passwordState.recovery.emailPattern, 'm***@example.test');
  assert.equal(passwordState.ui.settingsRoute, 'settings.security.twoFactor');
  assert.ok(passwordState.ui.actions.includes('submit_password'));

  const recoveryState = normalizeTwoFactorAuthState({
    step: 'recovery_required',
    recoveryEmailPattern: 'm***@example.test',
    feedback: 'Recovery code 123456 failed for keychain:telegram-recovery'
  });

  assert.equal(recoveryState.prompt.kind, 'recovery_code');
  assert.equal(recoveryState.prompt.recoveryCodePresent, false);
  assert.match(recoveryState.feedback.message, /Recovery code \[redacted\]/);
  assert.doesNotMatch(JSON.stringify(recoveryState), /123456|telegram-recovery/);
});

test('two-factor auth controller covers failed, successful, recovery, and cancelled mock flows without leaking secrets', async () => {
  const logs = [];
  const calls = [];
  const controller = createTwoFactorAuthController({
    initialAuthorizationState: {
      '@type': 'authorizationStateWaitPassword',
      password_hint: 'first pet',
      has_recovery_email_address: true,
      recovery_email_address_pattern: 'm***@example.test'
    },
    logger: (entry) => logs.push(entry),
    bridge: {
      async submitPassword({ password }) {
        calls.push({ method: 'submitPassword', passwordLength: password.length });
        if (password === 'correct horse battery staple') {
          return { step: 'ready', userId: 'mock-user' };
        }

        const error = new Error(`Invalid password: ${password}`);
        error.code = 'PASSWORD_HASH_INVALID';
        throw error;
      },
      async requestRecoveryCode() {
        calls.push({ method: 'requestRecoveryCode' });
        return {
          step: 'recovery_required',
          recoveryEmailPattern: 'm***@example.test'
        };
      },
      async submitRecoveryCode({ code }) {
        calls.push({ method: 'submitRecoveryCode', codeLength: code.length });
        if (code === '654321') {
          return { step: 'ready', userId: 'mock-user' };
        }

        const error = new Error(`Recovery code ${code} is invalid`);
        error.code = 'RECOVERY_CODE_INVALID';
        throw error;
      },
      async cancel() {
        calls.push({ method: 'cancel' });
        return { step: 'cancelled', feedback: 'Two-factor authentication cancelled.' };
      }
    }
  });

  let state = controller.updatePassword('bad-password');
  assert.equal(state.prompt.passwordPresent, true);
  assert.equal(state.prompt.passwordLength, 'bad-password'.length);
  assert.doesNotMatch(JSON.stringify(state), /bad-password/);

  state = await controller.submitPassword();
  assert.equal(state.step, 'password_required');
  assert.equal(state.feedback.tone, 'danger');
  assert.match(state.feedback.message, /Invalid two-factor password/);
  assert.equal(state.attempts.password, 1);

  state = await controller.requestRecoveryCode();
  assert.equal(state.step, 'recovery_required');
  assert.equal(state.recovery.required, true);
  assert.ok(state.ui.actions.includes('submit_recovery_code'));

  state = controller.updateRecoveryCode('000000');
  assert.equal(state.prompt.recoveryCodePresent, true);
  assert.equal(state.prompt.recoveryCodeLength, 6);
  assert.doesNotMatch(JSON.stringify(state), /000000/);

  state = await controller.submitRecoveryCode();
  assert.equal(state.step, 'recovery_required');
  assert.equal(state.feedback.tone, 'danger');
  assert.match(state.feedback.message, /Invalid recovery code/);
  assert.equal(state.attempts.recovery, 1);

  state = controller.updateRecoveryCode('654321');
  state = await controller.submitRecoveryCode();
  assert.equal(state.step, 'ready');
  assert.equal(state.session.userId, 'mock-user');

  const cancelled = createTwoFactorAuthController({
    initialAuthorizationState: { '@type': 'authorizationStateWaitPassword' },
    bridge: {
      async cancel() {
        return { step: 'cancelled' };
      }
    }
  });
  state = cancelled.updatePassword('throwaway-secret');
  assert.equal(state.prompt.passwordPresent, true);
  state = await cancelled.cancel();
  assert.equal(state.step, 'cancelled');
  assert.match(state.feedback.message, /cancelled/i);

  const serialized = JSON.stringify({ logs, calls, state });
  assert.doesNotMatch(serialized, /bad-password|correct horse battery staple|000000|654321|throwaway-secret/);
  assert.deepEqual(calls, [
    { method: 'submitPassword', passwordLength: 12 },
    { method: 'requestRecoveryCode' },
    { method: 'submitRecoveryCode', codeLength: 6 },
    { method: 'submitRecoveryCode', codeLength: 6 }
  ]);
});

test('two-factor security settings expose prompt and recovery controls without storing credentials', () => {
  const settings = createTeletonSettings();

  assert.deepEqual(settings.security.twoFactor, {
    passwordHintsEnabled: true,
    recoveryGuidanceEnabled: true,
    failureFeedbackEnabled: true
  });

  const disabledGuidance = createTeletonSettings({
    security: {
      twoFactor: {
        passwordHintsEnabled: false,
        recoveryGuidanceEnabled: false,
        failureFeedbackEnabled: false
      }
    }
  });

  assert.equal(disabledGuidance.security.twoFactor.passwordHintsEnabled, false);
  assert.equal(disabledGuidance.security.twoFactor.recoveryGuidanceEnabled, false);
  assert.equal(disabledGuidance.security.twoFactor.failureFeedbackEnabled, false);

  const invalid = validateTeletonSettings({
    security: {
      twoFactor: {
        passwordHintsEnabled: 'yes'
      }
    }
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /Two-factor passwordHintsEnabled/);
  assert.doesNotMatch(JSON.stringify(disabledGuidance), /hunter2|654321|keychain:|secret:/);
});

test('two-factor feedback sanitizer redacts recovery codes and secure references', () => {
  assert.equal(
    sanitizeTwoFactorFeedback('Password hunter2 failed with recovery code 123456 sent to secret:telegram-recovery'),
    'Password [redacted] failed with recovery code [redacted] sent to [redacted]'
  );
});
