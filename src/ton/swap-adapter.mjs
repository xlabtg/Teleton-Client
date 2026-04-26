import { TON_NETWORKS, validateTonWalletConfig } from './wallet-adapter.mjs';

export const TON_SWAP_PROVIDERS = Object.freeze(['stonfi', 'dedust']);
export const TON_SWAP_TRANSACTION_STATUSES = Object.freeze(['draft', 'pending', 'confirmed', 'failed', 'cancelled']);

const REQUIRED_PROVIDER_METHODS = ['getQuote', 'prepareSwapTransaction'];
const PRIVATE_KEY_FIELDS = ['privateKey', 'private_key', 'mnemonic', 'seedPhrase', 'seed_phrase'];
const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 5000;

export class TonSwapAdapterError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonSwapAdapterError';
    this.code = code;
    this.details = details;
  }
}

function cloneValue(value) {
  return structuredClone(value);
}

function adapterError(errors, code) {
  return new TonSwapAdapterError(errors.join(' '), code, errors);
}

function collectPrivateKeyErrors(input, errors) {
  for (const field of PRIVATE_KEY_FIELDS) {
    if (input[field] !== undefined) {
      errors.push(
        `TON private keys are not accepted by the shared swap adapter boundary. Use a wallet provider or secure storage reference instead of ${field}.`
      );
    }
  }
}

function normalizeNetwork(value = 'testnet') {
  const network = String(value ?? '').trim().toLowerCase();

  if (!TON_NETWORKS.includes(network)) {
    throw new TonSwapAdapterError(`Unsupported TON network: ${value}`, 'unsupported_network');
  }

  return network;
}

function normalizeProvider(value, errors) {
  const provider = String(value ?? '').trim().toLowerCase();

  if (!TON_SWAP_PROVIDERS.includes(provider)) {
    errors.push(`Unsupported TON swap provider: ${value}. Supported providers: ${TON_SWAP_PROVIDERS.join(', ')}.`);
  }

  return provider;
}

function normalizeAsset(value, label, errors) {
  const asset = String(value ?? '').trim();
  if (!asset) {
    errors.push(`TON swap ${label} asset is required.`);
  }

  return asset;
}

function normalizePositiveUnits(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount <= 0n) {
    errors.push(`TON swap ${fieldName} must be a positive bigint or safe integer.`);
  }

  return amount;
}

function normalizeSlippageBps(value, errors) {
  const slippageBps = value ?? DEFAULT_SLIPPAGE_BPS;

  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    errors.push(`TON swap slippageBps must be an integer from 0 to ${MAX_SLIPPAGE_BPS}.`);
  }

  return slippageBps;
}

function normalizeQuoteId(value, errors) {
  const quoteId = String(value ?? '').trim();

  if (!quoteId) {
    errors.push('TON swap quoteId is required.');
  }

  return quoteId;
}

function assertProviderImplementations(providers) {
  if (!providers || typeof providers !== 'object') {
    throw new TonSwapAdapterError('TON swap adapter providers must be an object.', 'invalid_implementation');
  }

  for (const provider of TON_SWAP_PROVIDERS) {
    const implementation = providers[provider];
    if (!implementation || typeof implementation !== 'object') {
      throw new TonSwapAdapterError(`TON swap adapter is missing ${provider} provider implementation.`, 'invalid_implementation');
    }

    const missingMethods = REQUIRED_PROVIDER_METHODS.filter((method) => typeof implementation[method] !== 'function');
    if (missingMethods.length > 0) {
      throw new TonSwapAdapterError(
        `TON swap ${provider} provider is missing methods: ${missingMethods.join(', ')}.`,
        'invalid_implementation',
        missingMethods
      );
    }
  }
}

export function validateTonSwapQuoteRequest(input = {}, defaults = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const provider = normalizeProvider(input.provider ?? defaults.provider, errors);
  const fromAsset = normalizeAsset(input.fromAsset, 'source', errors);
  const toAsset = normalizeAsset(input.toAsset, 'destination', errors);
  const amountNanoUnits = normalizePositiveUnits(input.amountNanoUnits, 'amountNanoUnits', errors);
  const slippageBps = normalizeSlippageBps(input.slippageBps, errors);
  const network = normalizeNetwork(input.network ?? defaults.network ?? 'testnet');

  if (fromAsset && toAsset && fromAsset === toAsset) {
    errors.push('TON swap source and destination assets must differ.');
  }

  return {
    valid: errors.length === 0,
    errors,
    request: {
      provider,
      fromAsset,
      toAsset,
      amountNanoUnits,
      slippageBps,
      network
    }
  };
}

export function validateTonSwapTransactionRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const provider = input.provider === undefined ? undefined : normalizeProvider(input.provider, errors);
  const request = {
    quoteId: normalizeQuoteId(input.quoteId, errors),
    from: String(walletConfig.address ?? input.from ?? '').trim(),
    confirmed: input.confirmed === true,
    network: normalizeNetwork(input.network ?? walletConfig.network ?? 'testnet')
  };

  if (!request.from) {
    errors.push('TON swap sender address is required.');
  }

  if (provider !== undefined) {
    request.provider = provider;
  }

  if (input.confirmed !== true) {
    errors.push('TON swap transaction preparation requires explicit confirmation before signing.');
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function sanitizeTonSwapProviderError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown TON swap provider error.');
  const message = rawMessage
    .replace(/\b(privateKey|private_key|mnemonic|seedPhrase|seed_phrase)=[^\s]+/gi, '[redacted]')
    .replace(/\bsecureRef=env:[^\s]+/gi, '[redacted]')
    .replace(/\benv:[A-Z0-9_]+\b/g, '[redacted]');

  return new TonSwapAdapterError(message, 'swap_provider_error');
}

async function callProvider(provider, method, request) {
  try {
    return await provider[method](request);
  } catch (error) {
    throw sanitizeTonSwapProviderError(error);
  }
}

export function createTonSwapAdapter(providers, options = {}) {
  assertProviderImplementations(providers);

  const walletValidation = validateTonWalletConfig(options);
  if (!walletValidation.valid) {
    throw adapterError(walletValidation.errors, 'invalid_wallet_config');
  }

  const walletConfig = walletValidation.config;

  return Object.freeze({
    network: walletConfig.network,
    providers: TON_SWAP_PROVIDERS,
    async getQuote(input = {}) {
      const quoteValidation = validateTonSwapQuoteRequest(input, { network: walletConfig.network });
      if (!quoteValidation.valid) {
        throw adapterError(quoteValidation.errors, 'invalid_swap_quote_request');
      }

      const quote = await callProvider(providers[quoteValidation.request.provider], 'getQuote', quoteValidation.request);
      return {
        provider: quoteValidation.request.provider,
        network: walletConfig.network,
        requiresTransactionConfirmation: false,
        signed: false,
        ...quote
      };
    },
    async prepareSwapTransaction(input = {}) {
      const transactionValidation = validateTonSwapTransactionRequest(input, walletConfig);
      if (!transactionValidation.valid) {
        throw adapterError(transactionValidation.errors, 'invalid_swap_transaction_request');
      }

      const provider = transactionValidation.request.provider ?? 'stonfi';
      return callProvider(providers[provider], 'prepareSwapTransaction', transactionValidation.request);
    }
  });
}

export function createMockTonSwapAdapter(seed = {}) {
  const walletValidation = validateTonWalletConfig({
    address: seed.address,
    walletProviderRef: seed.walletProviderRef ?? 'wallet:mock-ton-provider',
    secureStorageRef: seed.secureStorageRef,
    network: seed.network ?? 'testnet'
  });

  if (!walletValidation.valid) {
    throw adapterError(walletValidation.errors, 'invalid_wallet_config');
  }

  const walletConfig = walletValidation.config;
  const commands = [];
  const quotes = new Map();
  let nextQuoteId = 1;
  let nextDraftId = 1;

  function makeProvider(provider) {
    return {
      async getQuote(request) {
        commands.push({ method: 'getQuote', request: cloneValue(request) });
        const quote = {
          id: `mock-${provider}-quote-${nextQuoteId}`,
          provider,
          network: walletConfig.network,
          fromAsset: request.fromAsset,
          toAsset: request.toAsset,
          amountNanoUnits: request.amountNanoUnits,
          expectedOutNanoUnits: request.amountNanoUnits,
          minOutNanoUnits: request.amountNanoUnits,
          priceImpactBps: 0,
          expiresAt: seed.expiresAt ?? '2026-04-26T00:05:00.000Z',
          requiresTransactionConfirmation: false,
          signed: false
        };
        nextQuoteId += 1;
        quotes.set(quote.id, quote);
        return cloneValue(quote);
      },
      async prepareSwapTransaction(request) {
        commands.push({ method: 'prepareSwapTransaction', request: cloneValue(request) });
        const quote = quotes.get(request.quoteId);
        const draft = {
          id: `mock-${provider}-swap-draft-${nextDraftId}`,
          quoteId: request.quoteId,
          provider: quote?.provider ?? provider,
          status: 'draft',
          from: request.from,
          network: walletConfig.network,
          signed: false,
          requiresSigningConfirmation: true
        };
        nextDraftId += 1;
        return cloneValue(draft);
      }
    };
  }

  const adapter = createTonSwapAdapter(
    {
      stonfi: makeProvider('stonfi'),
      dedust: makeProvider('dedust')
    },
    walletConfig
  );

  return Object.freeze({
    ...adapter,
    getCommands() {
      return commands.map(cloneValue);
    }
  });
}
