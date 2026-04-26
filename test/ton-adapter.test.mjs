import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonWalletAdapter,
  createTonWalletManager,
  createTonWalletAdapter,
  normalizeJettonMetadata,
  validateJettonTransferRequest,
  validateTonTransferRequest,
  validateTonWalletConfig
} from '../src/ton/wallet-adapter.mjs';

test('TON wallet manager adds, switches, renames, and removes wallet references without exposing secrets', () => {
  const manager = createTonWalletManager();

  const primary = manager.addWallet({
    id: 'wallet-primary',
    label: 'Primary',
    address: 'EQDprimaryAddress',
    walletProviderRef: 'wallet:tonkeeper:primary'
  });
  const savings = manager.addWallet({
    id: 'wallet-savings',
    label: 'Savings',
    address: 'EQDsavingsAddress',
    secureStorageRef: 'keystore:ton-wallet-savings',
    network: 'mainnet'
  });

  assert.equal(primary.active, true);
  assert.equal(savings.active, false);
  assert.equal(manager.getActiveWallet().id, 'wallet-primary');

  manager.switchWallet('wallet-savings');
  assert.equal(manager.getActiveWallet().id, 'wallet-savings');
  assert.deepEqual(
    manager.listWallets().map((wallet) => ({ id: wallet.id, label: wallet.label, active: wallet.active })),
    [
      { id: 'wallet-primary', label: 'Primary', active: false },
      { id: 'wallet-savings', label: 'Savings', active: true }
    ]
  );

  assert.deepEqual(manager.renameWallet('wallet-savings', 'Long-term savings'), {
    id: 'wallet-savings',
    label: 'Long-term savings',
    address: 'EQDsavingsAddress',
    network: 'mainnet',
    secureStorageRef: 'keystore:ton-wallet-savings',
    active: true
  });

  const removal = manager.removeWallet('wallet-savings');
  assert.deepEqual(removal.removed.secureRefs, ['keystore:ton-wallet-savings']);
  assert.equal(manager.getActiveWallet().id, 'wallet-primary');
});

test('TON wallet manager prepares transfers with the selected wallet signing boundary', async () => {
  const manager = createTonWalletManager({
    wallets: [
      {
        id: 'wallet-primary',
        label: 'Primary',
        address: 'EQDprimaryAddress',
        walletProviderRef: 'wallet:tonkeeper:primary'
      },
      {
        id: 'wallet-savings',
        label: 'Savings',
        address: 'EQDsavingsAddress',
        walletProviderRef: 'wallet:tonkeeper:savings'
      }
    ],
    activeWalletId: 'wallet-savings'
  });

  const adapter = manager.createActiveWalletAdapter((wallet) =>
    createMockTonWalletAdapter({
      id: wallet.id,
      label: wallet.label,
      address: wallet.address,
      walletProviderRef: wallet.walletProviderRef,
      network: wallet.network
    })
  );

  const draft = await adapter.prepareTransfer({
    to: 'EQDreceiverAddress',
    amountNanoTon: 25n,
    confirmed: true
  });

  assert.equal(draft.from, 'EQDsavingsAddress');
  assert.equal(draft.wallet.id, 'wallet-savings');
  assert.equal(draft.wallet.label, 'Savings');
  assert.equal(draft.wallet.address, 'EQDsavingsAddress');
});

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

test('TON adapter exposes provider failures while blocking invalid status queries before provider calls', async () => {
  const calls = [];
  const adapter = createTonWalletAdapter(
    {
      async getBalance() {
        calls.push({ method: 'getBalance' });
        throw new Error('wallet provider unavailable');
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
        return { id, status: 'pending' };
      }
    },
    {
      address: 'EQDsenderAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(() => adapter.getBalance(), /wallet provider unavailable/);
  await assert.rejects(() => adapter.getTransferStatus('   '), /transfer status id/);
  assert.deepEqual(calls, [{ method: 'getBalance' }]);

  assert.deepEqual(await adapter.getTransferStatus('draft-1'), {
    id: 'draft-1',
    status: 'pending'
  });
  assert.deepEqual(calls.at(-1), { method: 'getTransferStatus', id: 'draft-1' });
});

test('TON adapter reports unsupported optional Jetton transfer capability explicitly', async () => {
  const adapter = createTonWalletAdapter(
    {
      async getBalance() {
        return { balanceNanoTon: 1n };
      },
      async getReceiveAddress() {
        return { address: 'EQDsenderAddress' };
      },
      async prepareTransfer(request) {
        return { id: 'draft-1', ...request, status: 'draft', signed: false, requiresSigningConfirmation: true };
      },
      async getTransferStatus(id) {
        return { id, status: 'draft' };
      }
    },
    {
      address: 'EQDsenderAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(
    () =>
      adapter.prepareJettonTransfer({
        jettonMasterAddress: 'EQDjettonMaster',
        to: 'EQDreceiverAddress',
        amountAtomic: 100n,
        confirmed: true
      }),
    (error) => {
      assert.equal(error.name, 'TonWalletAdapterError');
      assert.equal(error.code, 'unsupported_jetton_transfer');
      assert.match(error.message, /does not support Jetton transfer/);
      return true;
    }
  );
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

test('Jetton metadata normalizes unknown and malformed token details safely', () => {
  assert.deepEqual(normalizeJettonMetadata(), {
    address: '',
    symbol: 'UNKNOWN',
    name: 'Unknown Jetton',
    decimals: 0,
    imageUrl: null,
    verified: false,
    unknown: true,
    warnings: ['Jetton metadata address is missing.', 'Jetton metadata is unavailable.']
  });

  assert.deepEqual(
    normalizeJettonMetadata({
      address: ' EQDjettonMaster ',
      symbol: '   ',
      name: 123,
      decimals: 'not-a-number',
      imageUrl: 'javascript:alert(1)',
      verified: true
    }),
    {
      address: 'EQDjettonMaster',
      symbol: 'UNKNOWN',
      name: '123',
      decimals: 0,
      imageUrl: null,
      verified: false,
      unknown: true,
      warnings: [
        'Jetton metadata symbol is missing.',
        'Jetton metadata decimals must be an integer between 0 and 255.',
        'Jetton metadata imageUrl must be an http(s) URL.'
      ]
    }
  );
});

test('mock TON adapter returns Jetton balances with safe metadata fallbacks', async () => {
  const adapter = createMockTonWalletAdapter({
    address: 'EQDownerAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet',
    jettonBalances: [
      {
        walletAddress: 'EQDjettonWallet',
        masterAddress: 'EQDjettonMaster',
        balanceAtomic: 2500000n,
        metadata: {
          address: 'EQDjettonMaster',
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          imageUrl: 'https://static.example/usdt.png',
          verified: true
        }
      },
      {
        masterAddress: 'EQDunknownMaster',
        balanceAtomic: 5n,
        metadata: {
          address: 'EQDunknownMaster',
          symbol: '',
          decimals: -1
        }
      }
    ]
  });

  assert.deepEqual(await adapter.getJettonBalances(), {
    address: 'EQDownerAddress',
    network: 'testnet',
    jettons: [
      {
        walletAddress: 'EQDjettonWallet',
        masterAddress: 'EQDjettonMaster',
        balanceAtomic: 2500000n,
        metadata: {
          address: 'EQDjettonMaster',
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          imageUrl: 'https://static.example/usdt.png',
          verified: true,
          unknown: false,
          warnings: []
        }
      },
      {
        walletAddress: null,
        masterAddress: 'EQDunknownMaster',
        balanceAtomic: 5n,
        metadata: {
          address: 'EQDunknownMaster',
          symbol: 'UNKNOWN',
          name: 'Unknown Jetton',
          decimals: 0,
          imageUrl: null,
          verified: false,
          unknown: true,
          warnings: [
            'Jetton metadata symbol is missing.',
            'Jetton metadata decimals must be an integer between 0 and 255.'
          ]
        }
      }
    ]
  });
});

test('Jetton transfer preparation requires explicit confirmation and validates token inputs', async () => {
  const adapter = createMockTonWalletAdapter({
    address: 'EQDsenderAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });

  await assert.rejects(
    () =>
      adapter.prepareJettonTransfer({
        jettonMasterAddress: 'EQDjettonMaster',
        to: 'EQDreceiverAddress',
        amountAtomic: 100n
      }),
    /explicit confirmation/
  );

  await assert.rejects(
    () =>
      adapter.prepareJettonTransfer({
        jettonMasterAddress: '',
        to: 'EQDreceiverAddress',
        amountAtomic: 100n,
        confirmed: true
      }),
    /Jetton master/
  );

  const draft = await adapter.prepareJettonTransfer({
    jettonMasterAddress: 'EQDjettonMaster',
    jettonWalletAddress: 'EQDjettonWallet',
    to: 'EQDreceiverAddress',
    amountAtomic: 100n,
    memo: 'token payout',
    confirmed: true
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.requiresSigningConfirmation, true);
  assert.equal(draft.signed, false);
  assert.equal(draft.assetType, 'jetton');
  assert.equal(draft.from, 'EQDsenderAddress');
  assert.equal(draft.to, 'EQDreceiverAddress');
  assert.equal(draft.amountAtomic, 100n);
  assert.deepEqual(adapter.getCommands().at(-1), {
    method: 'prepareJettonTransfer',
    request: {
      from: 'EQDsenderAddress',
      to: 'EQDreceiverAddress',
      jettonMasterAddress: 'EQDjettonMaster',
      jettonWalletAddress: 'EQDjettonWallet',
      amountAtomic: 100n,
      memo: 'token payout',
      confirmed: true
    }
  });
});

test('Jetton transfer validation rejects secret material', () => {
  const validation = validateJettonTransferRequest(
    {
      to: 'EQDreceiverAddress',
      jettonMasterAddress: 'EQDjettonMaster',
      amountAtomic: 1n,
      confirmed: true,
      mnemonic: 'secret words'
    },
    { address: 'EQDsenderAddress' }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /private keys are not accepted/i);
});
