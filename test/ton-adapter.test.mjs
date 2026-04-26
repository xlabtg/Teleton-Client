import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonWalletAdapter,
  createTonWalletAdapter,
  validateTonTransferRequest,
  validateTonWalletConfig
} from '../src/ton/wallet-adapter.mjs';

test('TON wallet config rejects plaintext private keys and accepts provider references', () => {
  const invalid = validateTonWalletConfig({
    address: 'EQDmockWalletAddress',
    privateKey: 'plaintext-key'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /private keys are not accepted/i);

  const valid = validateTonWalletConfig({
    address: 'EQDmockWalletAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });

  assert.equal(valid.valid, true);
  assert.deepEqual(valid.config, {
    address: 'EQDmockWalletAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet',
    network: 'testnet'
  });
});

test('mock TON adapter retrieves balance and receive address without live credentials', async () => {
  const adapter = createMockTonWalletAdapter({
    address: 'EQDmockWalletAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet',
    balanceNanoTon: 1250000000n
  });

  assert.equal(adapter.network, 'testnet');
  assert.deepEqual(await adapter.getReceiveAddress(), {
    address: 'EQDmockWalletAddress',
    network: 'testnet'
  });
  assert.deepEqual(await adapter.getBalance(), {
    address: 'EQDmockWalletAddress',
    balanceNanoTon: 1250000000n,
    network: 'testnet'
  });
});

test('TON transfer preparation requires explicit confirmation before signing', async () => {
  const adapter = createMockTonWalletAdapter({
    address: 'EQDsenderAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet',
    balanceNanoTon: 5000000000n
  });

  await assert.rejects(
    () => adapter.prepareTransfer({ to: 'EQDreceiverAddress', amountNanoTon: 1000000000n }),
    /explicit confirmation/
  );

  const draft = await adapter.prepareTransfer({
    to: 'EQDreceiverAddress',
    amountNanoTon: 1000000000n,
    memo: 'agent payout',
    confirmed: true
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.requiresSigningConfirmation, true);
  assert.equal(draft.signed, false);
  assert.equal(draft.from, 'EQDsenderAddress');
  assert.equal(draft.to, 'EQDreceiverAddress');
  assert.equal(draft.amountNanoTon, 1000000000n);
  assert.deepEqual(adapter.getCommands().at(-1), {
    method: 'prepareTransfer',
    request: {
      from: 'EQDsenderAddress',
      to: 'EQDreceiverAddress',
      amountNanoTon: 1000000000n,
      memo: 'agent payout',
      confirmed: true
    }
  });
});

test('TON adapter validates bridge inputs before provider calls', async () => {
  const calls = [];
  const adapter = createTonWalletAdapter(
    {
      async getBalance() {
        calls.push({ method: 'getBalance' });
        return { balanceNanoTon: 42n };
      },
      async getReceiveAddress() {
        calls.push({ method: 'getReceiveAddress' });
        return { address: 'EQDsenderAddress' };
      },
      async prepareTransfer(request) {
        calls.push({ method: 'prepareTransfer', request });
        return { id: 'draft-1', ...request, status: 'draft', signed: false, requiresSigningConfirmation: true };
      },
      async getTransferStatus(id) {
        calls.push({ method: 'getTransferStatus', id });
        return { id, status: 'draft' };
      }
    },
    {
      address: 'EQDsenderAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet',
      network: 'mainnet'
    }
  );

  await assert.rejects(() => adapter.prepareTransfer({ to: '', amountNanoTon: 1n, confirmed: true }), /recipient/);
  await assert.rejects(
    () => adapter.prepareTransfer({ to: 'EQDreceiverAddress', amountNanoTon: 0n, confirmed: true }),
    /positive/
  );

  await adapter.getBalance();
  await adapter.getReceiveAddress();
  await adapter.prepareTransfer({ to: 'EQDreceiverAddress', amountNanoTon: 1n, confirmed: true });
  await adapter.getTransferStatus('draft-1');

  assert.deepEqual(calls, [
    { method: 'getBalance' },
    { method: 'getReceiveAddress' },
    {
      method: 'prepareTransfer',
      request: {
        from: 'EQDsenderAddress',
        to: 'EQDreceiverAddress',
        amountNanoTon: 1n,
        confirmed: true
      }
    },
    { method: 'getTransferStatus', id: 'draft-1' }
  ]);
});

test('TON transfer validation rejects secret material in transfer requests', () => {
  const validation = validateTonTransferRequest(
    {
      to: 'EQDreceiverAddress',
      amountNanoTon: 1n,
      confirmed: true,
      privateKey: 'plaintext-key'
    },
    { address: 'EQDsenderAddress' }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /private keys are not accepted/i);
});
