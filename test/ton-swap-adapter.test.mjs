import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonSwapAdapter,
  createTonSwapAdapter,
  sanitizeTonSwapProviderError,
  validateTonSwapQuoteRequest,
  validateTonSwapTransactionRequest
} from '../src/ton/swap-adapter.mjs';

test('TON swap quote validation normalizes provider, assets, and slippage without confirmation', () => {
  const validation = validateTonSwapQuoteRequest({
    provider: 'stonfi',
    fromAsset: 'TON',
    toAsset: 'USDT',
    amountNanoUnits: 1000000000n,
    slippageBps: 75
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.request, {
    provider: 'stonfi',
    fromAsset: 'TON',
    toAsset: 'USDT',
    amountNanoUnits: 1000000000n,
    slippageBps: 75,
    network: 'testnet'
  });
});

test('mock TON swap adapter exposes STON.fi and DeDust quote adapters without signing', async () => {
  const adapter = createMockTonSwapAdapter({
    address: 'EQDsenderAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });

  const stonfiQuote = await adapter.getQuote({
    provider: 'stonfi',
    fromAsset: 'TON',
    toAsset: 'USDT',
    amountNanoUnits: 1000000000n
  });
  const dedustQuote = await adapter.getQuote({
    provider: 'dedust',
    fromAsset: 'TON',
    toAsset: 'USDT',
    amountNanoUnits: 2000000000n
  });

  assert.equal(stonfiQuote.provider, 'stonfi');
  assert.equal(stonfiQuote.requiresTransactionConfirmation, false);
  assert.equal(stonfiQuote.signed, false);
  assert.equal(dedustQuote.provider, 'dedust');
  assert.equal(dedustQuote.requiresTransactionConfirmation, false);
  assert.equal(dedustQuote.signed, false);
  assert.deepEqual(
    adapter.getCommands().map((command) => command.method),
    ['getQuote', 'getQuote']
  );
});

test('TON swap transaction preparation is blocked until explicit user confirmation', async () => {
  const adapter = createMockTonSwapAdapter({
    address: 'EQDsenderAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });
  const quote = await adapter.getQuote({
    provider: 'stonfi',
    fromAsset: 'TON',
    toAsset: 'USDT',
    amountNanoUnits: 1000000000n
  });

  await assert.rejects(() => adapter.prepareSwapTransaction({ quoteId: quote.id }), /requires explicit confirmation/);

  const draft = await adapter.prepareSwapTransaction({
    quoteId: quote.id,
    confirmed: true
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.provider, 'stonfi');
  assert.equal(draft.from, 'EQDsenderAddress');
  assert.equal(draft.signed, false);
  assert.equal(draft.requiresSigningConfirmation, true);
  assert.deepEqual(adapter.getCommands().at(-1), {
    method: 'prepareSwapTransaction',
    request: {
      quoteId: quote.id,
      from: 'EQDsenderAddress',
      confirmed: true,
      network: 'testnet'
    }
  });
});

test('TON swap adapter validates requests before provider calls', async () => {
  const calls = [];
  const adapter = createTonSwapAdapter(
    {
      stonfi: {
        async getQuote(request) {
          calls.push({ method: 'stonfi.getQuote', request });
          return { id: 'quote-1', provider: request.provider };
        },
        async prepareSwapTransaction(request) {
          calls.push({ method: 'stonfi.prepareSwapTransaction', request });
          return { id: 'draft-1', status: 'draft', signed: false, requiresSigningConfirmation: true };
        }
      },
      dedust: {
        async getQuote(request) {
          calls.push({ method: 'dedust.getQuote', request });
          return { id: 'quote-2', provider: request.provider };
        },
        async prepareSwapTransaction(request) {
          calls.push({ method: 'dedust.prepareSwapTransaction', request });
          return { id: 'draft-2', status: 'draft', signed: false, requiresSigningConfirmation: true };
        }
      }
    },
    {
      address: 'EQDsenderAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet',
      network: 'mainnet'
    }
  );

  await assert.rejects(() => adapter.getQuote({ provider: 'unknown', fromAsset: 'TON', toAsset: 'USDT', amountNanoUnits: 1n }), /Unsupported TON swap provider/);
  await assert.rejects(() => adapter.getQuote({ provider: 'stonfi', fromAsset: 'TON', toAsset: 'TON', amountNanoUnits: 1n }), /must differ/);
  await assert.rejects(() => adapter.prepareSwapTransaction({ quoteId: 'quote-1', confirmed: false }), /requires explicit confirmation/);

  await adapter.getQuote({ provider: 'stonfi', fromAsset: 'TON', toAsset: 'USDT', amountNanoUnits: 1n });
  await adapter.prepareSwapTransaction({ provider: 'stonfi', quoteId: 'quote-1', confirmed: true });

  assert.deepEqual(calls, [
    {
      method: 'stonfi.getQuote',
      request: {
        provider: 'stonfi',
        fromAsset: 'TON',
        toAsset: 'USDT',
        amountNanoUnits: 1n,
        slippageBps: 50,
        network: 'mainnet'
      }
    },
    {
      method: 'stonfi.prepareSwapTransaction',
      request: {
        provider: 'stonfi',
        quoteId: 'quote-1',
        from: 'EQDsenderAddress',
        confirmed: true,
        network: 'mainnet'
      }
    }
  ]);
});

test('TON swap provider errors are surfaced without leaking wallet secrets', async () => {
  const adapter = createTonSwapAdapter(
    {
      stonfi: {
        async getQuote() {
          throw new Error('STON.fi timeout for privateKey=plaintext seedPhrase=words wallet env:TON_SECRET');
        },
        async prepareSwapTransaction() {
          throw new Error('not used');
        }
      },
      dedust: {
        async getQuote() {
          throw new Error('not used');
        },
        async prepareSwapTransaction() {
          throw new Error('not used');
        }
      }
    },
    {
      address: 'EQDsenderAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(
    () => adapter.getQuote({ provider: 'stonfi', fromAsset: 'TON', toAsset: 'USDT', amountNanoUnits: 1n }),
    (error) => {
      assert.equal(error.code, 'swap_provider_error');
      assert.match(error.message, /STON\.fi timeout/);
      assert.doesNotMatch(error.message, /plaintext|words|TON_SECRET|privateKey|seedPhrase/);
      return true;
    }
  );

  assert.equal(
    sanitizeTonSwapProviderError(new Error('failed with mnemonic=alpha secureRef=env:TON_SECRET')).message,
    'failed with [redacted] [redacted]'
  );
});

test('TON swap transaction validation rejects secret material', () => {
  const validation = validateTonSwapTransactionRequest(
    {
      quoteId: 'quote-1',
      confirmed: true,
      privateKey: 'plaintext-key'
    },
    { address: 'EQDsenderAddress' }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /private keys are not accepted/i);
});
