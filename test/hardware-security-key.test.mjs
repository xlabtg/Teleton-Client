import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS,
  HARDWARE_SECURITY_KEY_PROTOCOLS,
  createHardwareSecurityKeyActionGate,
  createHardwareSecurityKeyCapabilityPlan,
  createHardwareSecurityKeyController
} from '../src/foundation/hardware-security-key.mjs';
import { createTeletonSettings, validateTeletonSettings } from '../src/foundation/settings-model.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('hardware security key capability plans gate platform APIs before exposing flows', () => {
  assert.deepEqual(HARDWARE_SECURITY_KEY_PROTOCOLS, ['fido2-webauthn', 'fido2-ctap2', 'fido-u2f-ctap1']);

  const web = createHardwareSecurityKeyCapabilityPlan('web', {
    capabilities: {
      secureContext: true,
      publicKeyCredential: true
    }
  });

  assert.equal(web.supported, true);
  assert.match(web.api, /PublicKeyCredential/);
  assert.deepEqual(web.protocols, HARDWARE_SECURITY_KEY_PROTOCOLS);
  assert.equal(web.flows.registration.challengeBoundary, 'server:hardwareKeys.registrationChallenge');
  assert.equal(web.flows.registration.platformBoundary, 'platform:hardwareKeys.createCredential');
  assert.equal(web.flows.registration.verificationBoundary, 'server:hardwareKeys.verifyRegistration');
  assert.equal(web.flows.challenge.platformBoundary, 'platform:hardwareKeys.getAssertion');
  assert.equal(web.release.humanReviewRequired, true);

  const unsupported = createHardwareSecurityKeyCapabilityPlan('ios', {
    capabilities: {
      authenticationServices: true,
      securityKeyCredentialProvider: false
    }
  });

  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.reason, 'security-key-provider-unavailable');
  assert.equal(unsupported.fallback.behavior, 'two_factor_or_password');
  assert.match(unsupported.fallback.description, /Two-factor/);
});

test('hardware key settings require release review and gate high-risk actions by capability', () => {
  const settings = createTeletonSettings();

  assert.deepEqual(settings.security.hardwareKeys, DEFAULT_HARDWARE_SECURITY_KEY_SETTINGS);

  const invalid = validateTeletonSettings({
    security: {
      hardwareKeys: {
        enabled: true,
        requireForHighRiskActions: true,
        releaseReviewed: false
      }
    }
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /Human security review is required/);

  const reviewed = createTeletonSettings({
    security: {
      hardwareKeys: {
        enabled: true,
        requireForHighRiskActions: true,
        requireForAccountProtection: true,
        fallbackBehavior: 'block_high_risk_action',
        releaseReviewed: true
      }
    }
  });
  const supportedPlan = createHardwareSecurityKeyCapabilityPlan('android', {
    capabilities: {
      credentialManager: true,
      publicKeyCredentials: true
    },
    settings: reviewed.security.hardwareKeys
  });
  const gate = createHardwareSecurityKeyActionGate(
    {
      id: 'wallet.transferReview',
      riskLevel: 'review-required'
    },
    {
      settings: reviewed.security.hardwareKeys,
      capabilityPlan: supportedPlan
    }
  );

  assert.equal(gate.required, true);
  assert.equal(gate.allowed, true);
  assert.equal(gate.approvalMethod, 'hardware_security_key');

  const unsupportedPlan = createHardwareSecurityKeyCapabilityPlan('android', {
    capabilities: {
      credentialManager: false,
      publicKeyCredentials: true
    },
    settings: reviewed.security.hardwareKeys
  });
  const blockedGate = createHardwareSecurityKeyActionGate(
    {
      id: 'wallet.transferReview',
      riskLevel: 'review-required'
    },
    {
      settings: reviewed.security.hardwareKeys,
      capabilityPlan: unsupportedPlan
    }
  );

  assert.equal(blockedGate.required, true);
  assert.equal(blockedGate.allowed, false);
  assert.equal(blockedGate.reason, 'hardware-security-key-unavailable');
});

test('hardware key controller abstracts registration, challenge, and verification without leaking ceremony payloads', async () => {
  const logs = [];
  const calls = [];
  const controller = createHardwareSecurityKeyController({
    platform: 'desktop',
    capabilities: {
      nativeFido2Bridge: true
    },
    logger: (entry) => logs.push(entry),
    bridge: {
      async createRegistrationChallenge(request) {
        calls.push({ method: 'createRegistrationChallenge', accountId: request.accountId });
        return {
          challengeId: 'registration-challenge-1',
          publicKey: {
            challenge: 'server-registration-challenge-secret',
            rp: { id: 'teleton.example', name: 'Teleton Client' }
          }
        };
      },
      async createCredential(request) {
        calls.push({ method: 'createCredential', challengeId: request.challengeId });
        return {
          id: 'credential-1',
          transports: ['usb'],
          response: {
            attestationObject: 'attestation-secret',
            clientDataJSON: 'client-data-secret'
          }
        };
      },
      async verifyRegistration(request) {
        calls.push({ method: 'verifyRegistration', credentialId: request.credential.id });
        return {
          verified: true,
          credentialId: request.credential.id,
          registeredAt: '2026-04-26T12:00:00.000Z'
        };
      },
      async createAuthenticationChallenge(request) {
        calls.push({ method: 'createAuthenticationChallenge', actionId: request.actionId });
        return {
          challengeId: 'authentication-challenge-1',
          publicKey: {
            challenge: 'server-authentication-challenge-secret',
            allowCredentials: [{ id: 'credential-1', type: 'public-key' }]
          }
        };
      },
      async getAssertion(request) {
        calls.push({ method: 'getAssertion', challengeId: request.challengeId });
        return {
          id: 'credential-1',
          response: {
            authenticatorData: 'authenticator-data-secret',
            clientDataJSON: 'auth-client-data-secret',
            signature: 'signature-secret'
          }
        };
      },
      async verifyAuthentication(request) {
        calls.push({ method: 'verifyAuthentication', credentialId: request.assertion.id });
        return {
          verified: true,
          credentialId: request.assertion.id,
          verifiedAt: '2026-04-26T12:01:00.000Z'
        };
      }
    }
  });

  const registered = await controller.registerCredential({
    accountId: 'account-1',
    userHandle: 'user-1',
    displayName: 'Alice'
  });
  const verified = await controller.verifyChallenge({
    accountId: 'account-1',
    actionId: 'wallet.transferReview',
    riskLevel: 'review-required'
  });

  assert.equal(registered.step, 'registered');
  assert.equal(registered.credential.id, 'credential-1');
  assert.equal(registered.credential.transports.includes('usb'), true);
  assert.equal(verified.step, 'verified');
  assert.equal(verified.assertion.verified, true);
  assert.deepEqual(
    calls.map((call) => call.method),
    [
      'createRegistrationChallenge',
      'createCredential',
      'verifyRegistration',
      'createAuthenticationChallenge',
      'getAssertion',
      'verifyAuthentication'
    ]
  );

  const serialized = JSON.stringify({ registered, verified, logs });
  assert.doesNotMatch(serialized, /server-registration-challenge-secret/);
  assert.doesNotMatch(serialized, /attestation-secret|client-data-secret/);
  assert.doesNotMatch(serialized, /server-authentication-challenge-secret/);
  assert.doesNotMatch(serialized, /authenticator-data-secret|signature-secret/);
});

test('hardware key documentation records platform APIs, fallback behavior, and review gates', async () => {
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const audit = await readFile(pathFor('docs/security-audit.md'), 'utf8');

  assert.match(architecture, /hardware security key/i);
  assert.match(architecture, /WebAuthn PublicKeyCredential/i);
  assert.match(architecture, /ASAuthorizationSecurityKeyPublicKeyCredentialProvider/i);
  assert.match(architecture, /Credential Manager/i);
  assert.match(architecture, /fallback/i);
  assert.match(audit, /Hardware security key/i);
  assert.match(audit, /human security review/i);
});
