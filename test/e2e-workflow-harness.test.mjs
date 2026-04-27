import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TELETON_E2E_ENVIRONMENT,
  createTeletonE2eWorkflowHarness
} from '../src/foundation/e2e-workflow-harness.mjs';

function safeStringify(value) {
  return JSON.stringify(value, (_key, fieldValue) =>
    typeof fieldValue === 'bigint' ? `${fieldValue.toString()}n` : fieldValue
  );
}

test('E2E workflow harness runs auth, messaging, agent reply, and TON flows in mock mode', async () => {
  const harness = createTeletonE2eWorkflowHarness({
    env: {},
    now: () => '2026-04-27T00:00:00.000Z'
  });

  const result = await harness.runCoreWorkflows();

  assert.equal(result.mode, 'mock');
  assert.equal(result.liveEnabled, false);
  assert.deepEqual(result.missingEnvironment, ['TELETON_E2E_LIVE_ENABLED']);

  assert.equal(result.auth.authorizationState, 'ready');
  assert.equal(result.messaging.chatCount, 1);
  assert.equal(result.messaging.sentMessageStatus, 'sent');
  assert.deepEqual(result.messaging.updateTypes, ['authorizationState', 'message', 'message']);

  assert.equal(result.agentReply.proposalRequiresConfirmation, true);
  assert.equal(result.agentReply.confirmationStatus, 'approved');
  assert.equal(result.agentReply.sentMessageStatus, 'sent');
  assert.deepEqual(result.agentReply.historyStatuses, ['proposed', 'completed']);

  assert.equal(result.tonTransaction.draftStatus, 'draft');
  assert.equal(result.tonTransaction.transferStatus, 'draft');
  assert.equal(result.tonTransaction.confirmationStatus, 'approved');
  assert.equal(result.tonTransaction.signed, false);

  assert.ok(result.artifacts.logs.length >= 8);
  assert.deepEqual(result.artifacts.screenshots, []);
  assert.doesNotMatch(
    safeStringify(result),
    /env:|keychain:|keystore:|secret:|private key|mnemonic|seed phrase|mock user message body|mock agent reply body/i
  );
});

test('E2E workflow harness gates live checks behind explicit protected credentials', () => {
  const harness = createTeletonE2eWorkflowHarness({
    env: {
      TELETON_E2E_LIVE_ENABLED: 'true',
      TELETON_E2E_TDLIB_API_ID_REF: 'env:TELETON_E2E_TDLIB_API_ID',
      TELETON_E2E_TDLIB_API_HASH_REF: 'secret:teleton/e2e/tdlib-api-hash',
      TELETON_E2E_TDLIB_PHONE_NUMBER_REF: 'keychain:teleton-e2e-phone',
      TELETON_E2E_AGENT_TRANSPORT_REF: 'secret:teleton/e2e/agent-transport',
      TELETON_E2E_TON_WALLET_ADDRESS: 'EQDliveWalletAddress',
      TELETON_E2E_TON_PROVIDER_REF: 'secret:teleton/e2e/ton-provider',
      TELETON_E2E_TON_RECIPIENT_ADDRESS: 'EQDliveRecipientAddress'
    }
  });

  assert.equal(harness.mode, 'live');
  assert.equal(harness.liveEnabled, true);
  assert.deepEqual(harness.missingEnvironment, []);

  assert.throws(
    () =>
      createTeletonE2eWorkflowHarness({
        env: {
          TELETON_E2E_LIVE_ENABLED: 'true',
          TELETON_E2E_TDLIB_API_ID_REF: 'env:TELETON_E2E_TDLIB_API_ID'
        }
      }),
    /missing required environment variables/i
  );

  assert.throws(
    () =>
      createTeletonE2eWorkflowHarness({
        env: {
          TELETON_E2E_LIVE_ENABLED: 'true',
          TELETON_E2E_TDLIB_API_ID_REF: 'env:TELETON_E2E_TDLIB_API_ID',
          TELETON_E2E_TDLIB_API_HASH_REF: 'plain-api-hash',
          TELETON_E2E_TDLIB_PHONE_NUMBER_REF: 'keychain:teleton-e2e-phone',
          TELETON_E2E_AGENT_TRANSPORT_REF: 'secret:teleton/e2e/agent-transport',
          TELETON_E2E_TON_WALLET_ADDRESS: 'EQDliveWalletAddress',
          TELETON_E2E_TON_PROVIDER_REF: 'secret:teleton/e2e/ton-provider',
          TELETON_E2E_TON_RECIPIENT_ADDRESS: 'EQDliveRecipientAddress'
        }
      }),
    /must be secure references/i
  );
});

test('E2E workflow failures include redacted logs and screenshots when a capture hook is available', async () => {
  const captured = [];
  const harness = createTeletonE2eWorkflowHarness({
    env: {},
    now: () => '2026-04-27T00:00:00.000Z',
    mockFixture: {
      chats: [{ id: '', title: 'Private broken chat', unreadCount: 1 }]
    },
    captureScreenshot: async ({ step }) => {
      captured.push(step);
      return {
        path: 'artifacts/e2e/auth-messaging-failure.png',
        label: 'Auth and messaging failure'
      };
    }
  });

  await assert.rejects(
    () => harness.runCoreWorkflows(),
    (error) => {
      assert.equal(error.code, 'e2e_workflow_failed');
      assert.equal(error.step, 'auth-and-messaging');
      assert.match(error.message, /auth and messaging/i);
      assert.ok(error.artifacts.logs.some((entry) => entry.status === 'failed'));
      assert.deepEqual(error.artifacts.screenshots, [
        {
          step: 'auth-and-messaging',
          path: 'artifacts/e2e/auth-messaging-failure.png',
          label: 'Auth and messaging failure'
        }
      ]);
      assert.doesNotMatch(
        safeStringify({ message: error.message, artifacts: error.artifacts }),
        /Private broken chat|env:|keychain:|keystore:|secret:|mock user message body|mock agent reply body/i
      );
      return true;
    }
  );
  assert.deepEqual(captured, ['auth-and-messaging']);
});

test('E2E environment contract documents protected live variables', () => {
  assert.deepEqual(
    TELETON_E2E_ENVIRONMENT.map((entry) => entry.name),
    [
      'TELETON_E2E_LIVE_ENABLED',
      'TELETON_E2E_TDLIB_API_ID_REF',
      'TELETON_E2E_TDLIB_API_HASH_REF',
      'TELETON_E2E_TDLIB_PHONE_NUMBER_REF',
      'TELETON_E2E_AGENT_TRANSPORT_REF',
      'TELETON_E2E_TON_WALLET_ADDRESS',
      'TELETON_E2E_TON_PROVIDER_REF',
      'TELETON_E2E_TON_RECIPIENT_ADDRESS',
      'TELETON_E2E_TON_TRANSFER_NANOTON'
    ]
  );

  assert.equal(TELETON_E2E_ENVIRONMENT.find((entry) => entry.name === 'TELETON_E2E_TDLIB_API_HASH_REF').secret, true);
  assert.equal(TELETON_E2E_ENVIRONMENT.find((entry) => entry.name === 'TELETON_E2E_TON_PROVIDER_REF').secret, true);
});
