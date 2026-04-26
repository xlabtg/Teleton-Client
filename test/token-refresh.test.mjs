import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TOKEN_REFRESH_INTEGRATION_CATALOG,
  TOKEN_REFRESH_INTEGRATIONS,
  createTokenRefreshController,
  createTokenRefreshPlan,
  validateTokenRefreshRecord
} from '../src/foundation/token-refresh.mjs';

const now = '2026-04-26T12:00:00.000Z';

test('token refresh inventory covers supported integrations and rejects plaintext credentials', () => {
  assert.deepEqual(TOKEN_REFRESH_INTEGRATIONS, ['telegram', 'agent-provider', 'settings-sync', 'ton']);
  assert.deepEqual(
    TOKEN_REFRESH_INTEGRATION_CATALOG.map((entry) => entry.integration),
    TOKEN_REFRESH_INTEGRATIONS
  );

  const telegram = TOKEN_REFRESH_INTEGRATION_CATALOG.find((entry) => entry.integration === 'telegram');
  const agent = TOKEN_REFRESH_INTEGRATION_CATALOG.find((entry) => entry.integration === 'agent-provider');
  const sync = TOKEN_REFRESH_INTEGRATION_CATALOG.find((entry) => entry.integration === 'settings-sync');
  const ton = TOKEN_REFRESH_INTEGRATION_CATALOG.find((entry) => entry.integration === 'ton');

  assert.ok(telegram.credentialFields.includes('botTokenRef'));
  assert.ok(agent.credentialFields.includes('apiKeyRef'));
  assert.ok(agent.credentialFields.includes('tokenRef'));
  assert.ok(sync.credentialFields.includes('encryptionKeyRef'));
  assert.ok(ton.credentialFields.includes('walletProviderRef'));

  const invalid = validateTokenRefreshRecord({
    id: 'agent-openai',
    integration: 'agent-provider',
    credentialRef: 'raw-agent-access-token',
    refreshToken: 'raw-refresh-token',
    expiresAt: '2026-04-26T12:00:00.000Z'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /secure reference/);
  assert.match(invalid.errors.join('\n'), /refreshToken/);
  assert.doesNotMatch(JSON.stringify(invalid), /raw-refresh-token/);
});

test('token refresh plan schedules expiring credentials and marks revoked tokens for reauthentication', () => {
  const plan = createTokenRefreshPlan(
    [
      {
        id: 'telegram-bot',
        integration: 'telegram',
        credentialField: 'botTokenRef',
        credentialRef: 'keychain:telegram-bot-token',
        refreshTokenRef: 'keychain:telegram-bot-refresh',
        expiresAt: '2026-04-26T12:03:00.000Z'
      },
      {
        id: 'settings-sync',
        integration: 'settings-sync',
        credentialField: 'encryptionKeyRef',
        credentialRef: 'keychain:settings-sync',
        refreshTokenRef: 'keychain:settings-sync-rotation',
        expiresAt: '2026-04-26T13:00:00.000Z'
      },
      {
        id: 'ton-provider',
        integration: 'ton',
        credentialField: 'walletProviderRef',
        credentialRef: 'wallet:tonkeeper:primary',
        refreshTokenRef: 'keychain:tonkeeper-refresh',
        revoked: true,
        expiresAt: '2026-04-26T12:30:00.000Z'
      }
    ],
    { now, refreshBeforeMs: 5 * 60 * 1000 }
  );

  assert.equal(plan.generatedAt, now);
  assert.deepEqual(plan.due.map((entry) => entry.id), ['telegram-bot']);
  assert.deepEqual(plan.reauthenticationRequired.map((entry) => entry.id), ['ton-provider']);
  assert.deepEqual(plan.retryableFailures, []);

  const telegram = plan.items.find((entry) => entry.id === 'telegram-bot');
  assert.equal(telegram.state, 'refresh_due');
  assert.equal(telegram.dueReason, 'expiring_soon');
  assert.equal(telegram.nextRefreshAt, now);

  const sync = plan.items.find((entry) => entry.id === 'settings-sync');
  assert.equal(sync.state, 'valid');
  assert.equal(sync.nextRefreshAt, '2026-04-26T12:55:00.000Z');

  const ton = plan.items.find((entry) => entry.id === 'ton-provider');
  assert.equal(ton.state, 'reauthentication_required');
  assert.equal(ton.reauthentication.required, true);
  assert.equal(ton.reauthentication.action, 'ton.wallet.reauthenticate');
  assert.equal(ton.reauthentication.reason, 'revoked');
});

test('expired refreshable tokens renew through secure references without exposing plaintext credentials', async () => {
  const calls = [];
  const controller = createTokenRefreshController(
    {
      async refreshToken(request) {
        calls.push(structuredClone(request));
        return {
          credentialRef: request.credentialRef,
          refreshTokenRef: 'keychain:agent-refresh-rotated',
          expiresAt: '2026-04-26T13:00:00.000Z'
        };
      }
    },
    { now }
  );

  const result = await controller.refresh({
    id: 'agent-openai',
    integration: 'agent-provider',
    credentialField: 'tokenRef',
    credentialRef: 'keychain:agent-access',
    refreshTokenRef: 'keychain:agent-refresh',
    expiresAt: '2026-04-26T11:59:00.000Z'
  });

  assert.equal(result.state, 'valid');
  assert.equal(result.refreshed, true);
  assert.equal(result.expiresAt, '2026-04-26T13:00:00.000Z');
  assert.equal(result.refreshTokenRef, 'keychain:agent-refresh-rotated');
  assert.deepEqual(calls, [
    {
      id: 'agent-openai',
      integration: 'agent-provider',
      credentialField: 'tokenRef',
      credentialRef: 'keychain:agent-access',
      refreshTokenRef: 'keychain:agent-refresh',
      expiresAt: '2026-04-26T11:59:00.000Z',
      requestedAt: now,
      attempt: 1
    }
  ]);
  assert.doesNotMatch(JSON.stringify({ calls, result }), /raw|plaintext|secret-value/);
});

test('revoked-token refresh failures move the integration to a clear reauthentication state', async () => {
  const controller = createTokenRefreshController(
    {
      async refreshToken() {
        const error = new Error('invalid_grant for keychain:agent-refresh and token 123456:abcdefghijklmnopqrstuvwx');
        error.code = 'invalid_grant';
        throw error;
      }
    },
    { now }
  );

  const result = await controller.refresh({
    id: 'agent-openai',
    integration: 'agent-provider',
    credentialField: 'tokenRef',
    credentialRef: 'keychain:agent-access',
    refreshTokenRef: 'keychain:agent-refresh',
    expiresAt: '2026-04-26T11:59:00.000Z'
  });

  assert.equal(result.state, 'reauthentication_required');
  assert.equal(result.reauthentication.required, true);
  assert.equal(result.reauthentication.action, 'agent.provider.reauthenticate');
  assert.equal(result.reauthentication.reason, 'revoked');
  assert.equal(result.nextAttemptAt, null);
  assert.doesNotMatch(JSON.stringify(result), /agent-refresh|123456:abcdefghijklmnopqrstuvwx/);
});

test('network refresh failures use bounded backoff without requiring reauthentication', async () => {
  const controller = createTokenRefreshController(
    {
      async refreshToken() {
        const error = new Error('network timeout through keychain:agent-refresh');
        error.code = 'ETIMEDOUT';
        throw error;
      }
    },
    { now, initialBackoffMs: 30_000, maxBackoffMs: 5 * 60_000 }
  );

  const result = await controller.refresh({
    id: 'agent-openai',
    integration: 'agent-provider',
    credentialField: 'tokenRef',
    credentialRef: 'keychain:agent-access',
    refreshTokenRef: 'keychain:agent-refresh',
    expiresAt: '2026-04-26T11:59:00.000Z',
    failure: {
      attempt: 1
    }
  });

  assert.equal(result.state, 'refresh_failed');
  assert.equal(result.failure.category, 'network_failed');
  assert.equal(result.failure.attempt, 2);
  assert.equal(result.nextAttemptAt, '2026-04-26T12:01:00.000Z');
  assert.equal(result.reauthentication.required, false);
  assert.doesNotMatch(JSON.stringify(result), /agent-refresh/);
});
