import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createTonTestnetWalletFlowHarness,
  TON_TESTNET_ENVIRONMENT
} from '../src/ton/testnet-coverage.mjs';

test('TON testnet wallet flow runs in mock mode without secrets', async () => {
  const harness = createTonTestnetWalletFlowHarness({
    env: {},
    now: () => '2026-04-26T12:00:00.000Z'
  });

  const result = await harness.runWalletFlow();

  assert.equal(result.mode, 'mock');
  assert.equal(result.testnetEnabled, false);
  assert.deepEqual(result.missingEnvironment, ['TELETON_TON_TESTNET_ENABLED']);
  assert.equal(result.balance.network, 'testnet');
  assert.equal(result.receiveAddress.address, 'EQDmockTestnetWalletAddress');
  assert.equal(result.transferDraft.status, 'draft');
  assert.equal(result.transferStatus.status, 'draft');
  assert.equal(result.confirmation.status, 'approved');
  assert.equal(result.confirmation.signed, false);
  assert.doesNotMatch(JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? value.toString() : value)), /private|mnemonic|seed|secret|plaintext/i);
});

test('TON testnet wallet flow requires an explicit protected CI environment gate', async () => {
  const harness = createTonTestnetWalletFlowHarness({
    env: {
      TELETON_TON_TESTNET_ENABLED: 'true',
      TELETON_TON_TESTNET_WALLET_ADDRESS: 'EQDtestnetWalletAddress',
      TELETON_TON_TESTNET_PROVIDER_REF: 'env:TELETON_TON_TESTNET_PROVIDER_REF',
      TELETON_TON_TESTNET_RECIPIENT_ADDRESS: 'EQDtestnetRecipientAddress'
    }
  });

  assert.equal(harness.mode, 'testnet');
  assert.deepEqual(harness.missingEnvironment, []);
});

test('TON testnet wallet flow refuses partial testnet credentials', () => {
  assert.throws(
    () =>
      createTonTestnetWalletFlowHarness({
        env: {
          TELETON_TON_TESTNET_ENABLED: 'true',
          TELETON_TON_TESTNET_WALLET_ADDRESS: 'EQDtestnetWalletAddress'
        }
      }),
    /missing required environment variables/i
  );
});

test('TON testnet environment contract documents protected variables', () => {
  assert.deepEqual(
    TON_TESTNET_ENVIRONMENT.map((entry) => entry.name),
    [
      'TELETON_TON_TESTNET_ENABLED',
      'TELETON_TON_TESTNET_WALLET_ADDRESS',
      'TELETON_TON_TESTNET_PROVIDER_REF',
      'TELETON_TON_TESTNET_RECIPIENT_ADDRESS',
      'TELETON_TON_TESTNET_TRANSFER_NANOTON'
    ]
  );

  assert.equal(TON_TESTNET_ENVIRONMENT.find((entry) => entry.name === 'TELETON_TON_TESTNET_PROVIDER_REF').secret, true);
});
