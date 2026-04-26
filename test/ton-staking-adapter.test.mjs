import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonStakingAdapter,
  createTonStakingAdapter,
  sanitizeTonStakingProviderError,
  validateTonStakingActionRequest,
  validateTonStakingPreviewRequest
} from '../src/ton/staking-adapter.mjs';

test('TON staking preview validation exposes provider boundaries and risk metadata without confirmation', () => {
  const validation = validateTonStakingPreviewRequest({
    provider: 'tonstakers',
    amountNanoTon: 1000000000n
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.request, {
    provider: 'tonstakers',
    amountNanoTon: 1000000000n,
    network: 'testnet'
  });
});

test('mock TON staking adapter previews stake, unstake, and rewards flows without signing', async () => {
  const adapter = createMockTonStakingAdapter({
    address: 'EQDstakerAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });

  const stakePreview = await adapter.previewStake({
    provider: 'tonstakers',
    amountNanoTon: 5000000000n
  });
  const unstakePreview = await adapter.previewUnstake({
    provider: 'whales',
    amountNanoTon: 2000000000n
  });
  const rewardsPreview = await adapter.previewRewards({ provider: 'tonstakers' });

  assert.equal(stakePreview.provider, 'tonstakers');
  assert.equal(stakePreview.action, 'stake');
  assert.equal(stakePreview.requiresTransactionConfirmation, false);
  assert.equal(stakePreview.signed, false);
  assert.equal(stakePreview.fees.visibleBeforeApproval, true);
  assert.equal(stakePreview.risks.visibleBeforeApproval, true);
  assert.ok(stakePreview.risks.items.length > 0);
  assert.equal(unstakePreview.provider, 'whales');
  assert.equal(unstakePreview.action, 'unstake');
  assert.equal(unstakePreview.signed, false);
  assert.equal(rewardsPreview.action, 'rewards');
  assert.equal(rewardsPreview.claimableRewardsNanoTon, 0n);
  assert.equal(rewardsPreview.signed, false);
  assert.deepEqual(
    adapter.getCommands().map((command) => command.method),
    ['previewStake', 'previewUnstake', 'previewRewards']
  );
});

test('TON staking action preparation is blocked until explicit user confirmation', async () => {
  const adapter = createMockTonStakingAdapter({
    address: 'EQDstakerAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });
  const preview = await adapter.previewStake({
    provider: 'tonstakers',
    amountNanoTon: 5000000000n
  });

  await assert.rejects(() => adapter.prepareStakeTransaction({ previewId: preview.id }), /requires explicit confirmation/);

  const draft = await adapter.prepareStakeTransaction({
    provider: 'tonstakers',
    previewId: preview.id,
    confirmed: true
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.provider, 'tonstakers');
  assert.equal(draft.from, 'EQDstakerAddress');
  assert.equal(draft.signed, false);
  assert.equal(draft.requiresSigningConfirmation, true);
  assert.deepEqual(adapter.getCommands().at(-1), {
    method: 'prepareStakeTransaction',
    request: {
      provider: 'tonstakers',
      previewId: preview.id,
      from: 'EQDstakerAddress',
      confirmed: true,
      network: 'testnet'
    }
  });
});

test('TON staking adapter validates requests before provider calls', async () => {
  const calls = [];
  const adapter = createTonStakingAdapter(
    {
      tonstakers: {
        async previewStake(request) {
          calls.push({ method: 'tonstakers.previewStake', request });
          return { id: 'stake-preview-1', provider: request.provider, risks: { items: [] }, fees: {} };
        },
        async previewUnstake() {
          throw new Error('not used');
        },
        async previewRewards() {
          throw new Error('not used');
        },
        async prepareStakeTransaction(request) {
          calls.push({ method: 'tonstakers.prepareStakeTransaction', request });
          return { id: 'stake-draft-1', status: 'draft', signed: false, requiresSigningConfirmation: true };
        },
        async prepareUnstakeTransaction() {
          throw new Error('not used');
        }
      },
      whales: {
        async previewStake() {
          throw new Error('not used');
        },
        async previewUnstake() {
          throw new Error('not used');
        },
        async previewRewards() {
          throw new Error('not used');
        },
        async prepareStakeTransaction() {
          throw new Error('not used');
        },
        async prepareUnstakeTransaction() {
          throw new Error('not used');
        }
      }
    },
    {
      address: 'EQDstakerAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet',
      network: 'mainnet'
    }
  );

  await assert.rejects(() => adapter.previewStake({ provider: 'unknown', amountNanoTon: 1n }), /Unsupported TON staking provider/);
  await assert.rejects(() => adapter.previewStake({ provider: 'tonstakers', amountNanoTon: 0n }), /positive bigint/);
  await assert.rejects(() => adapter.prepareStakeTransaction({ previewId: 'stake-preview-1', confirmed: false }), /requires explicit confirmation/);

  await adapter.previewStake({ provider: 'tonstakers', amountNanoTon: 1n });
  await adapter.prepareStakeTransaction({ provider: 'tonstakers', previewId: 'stake-preview-1', confirmed: true });

  assert.deepEqual(calls, [
    {
      method: 'tonstakers.previewStake',
      request: {
        provider: 'tonstakers',
        amountNanoTon: 1n,
        network: 'mainnet'
      }
    },
    {
      method: 'tonstakers.prepareStakeTransaction',
      request: {
        provider: 'tonstakers',
        previewId: 'stake-preview-1',
        from: 'EQDstakerAddress',
        confirmed: true,
        network: 'mainnet'
      }
    }
  ]);
});

test('TON staking provider errors are surfaced without leaking wallet secrets', async () => {
  const adapter = createTonStakingAdapter(
    {
      tonstakers: {
        async previewStake() {
          throw new Error('staking provider failed for privateKey=plaintext mnemonic=words env:TON_SECRET');
        },
        async previewUnstake() {
          throw new Error('not used');
        },
        async previewRewards() {
          throw new Error('not used');
        },
        async prepareStakeTransaction() {
          throw new Error('not used');
        },
        async prepareUnstakeTransaction() {
          throw new Error('not used');
        }
      },
      whales: {
        async previewStake() {
          throw new Error('not used');
        },
        async previewUnstake() {
          throw new Error('not used');
        },
        async previewRewards() {
          throw new Error('not used');
        },
        async prepareStakeTransaction() {
          throw new Error('not used');
        },
        async prepareUnstakeTransaction() {
          throw new Error('not used');
        }
      }
    },
    {
      address: 'EQDstakerAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(
    () => adapter.previewStake({ provider: 'tonstakers', amountNanoTon: 1n }),
    (error) => {
      assert.equal(error.code, 'staking_provider_error');
      assert.match(error.message, /staking provider failed/);
      assert.doesNotMatch(error.message, /plaintext|words|TON_SECRET|privateKey|mnemonic/);
      return true;
    }
  );

  assert.equal(
    sanitizeTonStakingProviderError(new Error('failed with seedPhrase=alpha secureRef=env:TON_SECRET')).message,
    'failed with [redacted] [redacted]'
  );
});

test('TON staking action validation rejects secret material', () => {
  const validation = validateTonStakingActionRequest(
    {
      provider: 'tonstakers',
      previewId: 'stake-preview-1',
      confirmed: true,
      privateKey: 'plaintext-key'
    },
    { address: 'EQDstakerAddress' }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /private keys are not accepted/i);
});
