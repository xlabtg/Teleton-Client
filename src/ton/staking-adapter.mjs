import { TON_NETWORKS, validateTonWalletConfig } from './wallet-adapter.mjs';

export const TON_STAKING_PROVIDERS = Object.freeze(['tonstakers', 'whales']);
export const TON_STAKING_ACTIONS = Object.freeze(['stake', 'unstake', 'rewards']);
export const TON_STAKING_TRANSACTION_STATUSES = Object.freeze(['draft', 'pending', 'confirmed', 'failed', 'cancelled']);

const REQUIRED_PROVIDER_METHODS = [
  'previewStake',
  'previewUnstake',
  'previewRewards',
  'prepareStakeTransaction',
  'prepareUnstakeTransaction'
];
const PRIVATE_KEY_FIELDS = ['privateKey', 'private_key', 'mnemonic', 'seedPhrase', 'seed_phrase'];

export class TonStakingAdapterError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonStakingAdapterError';
    this.code = code;
    this.details = details;
  }
}

function cloneValue(value) {
  return structuredClone(value);
}

function adapterError(errors, code) {
  return new TonStakingAdapterError(errors.join(' '), code, errors);
}

function collectPrivateKeyErrors(input, errors) {
  for (const field of PRIVATE_KEY_FIELDS) {
    if (input[field] !== undefined) {
      errors.push(
        `TON private keys are not accepted by the shared staking adapter boundary. Use a wallet provider or secure storage reference instead of ${field}.`
      );
    }
  }
}

function normalizeNetwork(value = 'testnet') {
  const network = String(value ?? '').trim().toLowerCase();

  if (!TON_NETWORKS.includes(network)) {
    throw new TonStakingAdapterError(`Unsupported TON network: ${value}`, 'unsupported_network');
  }

  return network;
}

function normalizeProvider(value, errors) {
  const provider = String(value ?? '').trim().toLowerCase();

  if (!TON_STAKING_PROVIDERS.includes(provider)) {
    errors.push(`Unsupported TON staking provider: ${value}. Supported providers: ${TON_STAKING_PROVIDERS.join(', ')}.`);
  }

  return provider;
}

function normalizePositiveNanoTon(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount <= 0n) {
    errors.push(`TON staking ${fieldName} must be a positive bigint or safe integer.`);
  }

  return amount;
}

function normalizeOptionalPositiveNanoTon(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizePositiveNanoTon(value, fieldName, errors);
}

function normalizePreviewId(value, errors) {
  const previewId = String(value ?? '').trim();

  if (!previewId) {
    errors.push('TON staking previewId is required.');
  }

  return previewId;
}

function assertProviderImplementations(providers) {
  if (!providers || typeof providers !== 'object') {
    throw new TonStakingAdapterError('TON staking adapter providers must be an object.', 'invalid_implementation');
  }

  for (const provider of TON_STAKING_PROVIDERS) {
    const implementation = providers[provider];
    if (!implementation || typeof implementation !== 'object') {
      throw new TonStakingAdapterError(`TON staking adapter is missing ${provider} provider implementation.`, 'invalid_implementation');
    }

    const missingMethods = REQUIRED_PROVIDER_METHODS.filter((method) => typeof implementation[method] !== 'function');
    if (missingMethods.length > 0) {
      throw new TonStakingAdapterError(
        `TON staking ${provider} provider is missing methods: ${missingMethods.join(', ')}.`,
        'invalid_implementation',
        missingMethods
      );
    }
  }
}

export function validateTonStakingPreviewRequest(input = {}, defaults = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const provider = normalizeProvider(input.provider ?? defaults.provider, errors);
  const amountNanoTon = normalizeOptionalPositiveNanoTon(input.amountNanoTon, 'amountNanoTon', errors);
  const network = normalizeNetwork(input.network ?? defaults.network ?? 'testnet');

  const request = {
    provider,
    network
  };

  if (amountNanoTon !== undefined) {
    request.amountNanoTon = amountNanoTon;
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function validateTonStakingActionRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const provider = input.provider === undefined ? undefined : normalizeProvider(input.provider, errors);
  const request = {
    previewId: normalizePreviewId(input.previewId, errors),
    from: String(walletConfig.address ?? input.from ?? '').trim(),
    confirmed: input.confirmed === true,
    network: normalizeNetwork(input.network ?? walletConfig.network ?? 'testnet')
  };

  if (!request.from) {
    errors.push('TON staking sender address is required.');
  }

  if (provider !== undefined) {
    request.provider = provider;
  }

  if (input.confirmed !== true) {
    errors.push('TON staking transaction preparation requires explicit confirmation before signing.');
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

function normalizeDisclosure(input = {}, provider) {
  const risks = input.risks && typeof input.risks === 'object' ? input.risks : {};
  const fees = input.fees && typeof input.fees === 'object' ? input.fees : {};

  return {
    risks: {
      visibleBeforeApproval: true,
      provider,
      items: Array.isArray(risks.items) ? risks.items.map(cloneValue) : []
    },
    fees: {
      visibleBeforeApproval: true,
      networkFeeNanoTon: fees.networkFeeNanoTon ?? 0n,
      providerFeeBps: fees.providerFeeBps ?? 0,
      withdrawalFeeNanoTon: fees.withdrawalFeeNanoTon ?? 0n
    }
  };
}

export function sanitizeTonStakingProviderError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown TON staking provider error.');
  const message = rawMessage
    .replace(/\b(privateKey|private_key|mnemonic|seedPhrase|seed_phrase)=[^\s]+/gi, '[redacted]')
    .replace(/\bsecureRef=env:[^\s]+/gi, '[redacted]')
    .replace(/\benv:[A-Z0-9_]+\b/g, '[redacted]');

  return new TonStakingAdapterError(message, 'staking_provider_error');
}

async function callProvider(provider, method, request) {
  try {
    return await provider[method](request);
  } catch (error) {
    throw sanitizeTonStakingProviderError(error);
  }
}

export function createTonStakingAdapter(providers, options = {}) {
  assertProviderImplementations(providers);

  const walletValidation = validateTonWalletConfig(options);
  if (!walletValidation.valid) {
    throw adapterError(walletValidation.errors, 'invalid_wallet_config');
  }

  const walletConfig = walletValidation.config;

  async function preview(method, action, input = {}) {
    const validation = validateTonStakingPreviewRequest(input, { network: walletConfig.network });
    if (!validation.valid) {
      throw adapterError(validation.errors, 'invalid_staking_preview_request');
    }

    const response = await callProvider(providers[validation.request.provider], method, validation.request);
    return {
      provider: validation.request.provider,
      action,
      network: walletConfig.network,
      requiresTransactionConfirmation: false,
      signed: false,
      ...response,
      ...normalizeDisclosure(response, validation.request.provider)
    };
  }

  async function prepare(method, input = {}) {
    const validation = validateTonStakingActionRequest(input, walletConfig);
    if (!validation.valid) {
      throw adapterError(validation.errors, 'invalid_staking_transaction_request');
    }

    const provider = validation.request.provider ?? 'tonstakers';
    return callProvider(providers[provider], method, validation.request);
  }

  return Object.freeze({
    network: walletConfig.network,
    providers: TON_STAKING_PROVIDERS,
    async previewStake(input = {}) {
      return preview('previewStake', 'stake', input);
    },
    async previewUnstake(input = {}) {
      return preview('previewUnstake', 'unstake', input);
    },
    async previewRewards(input = {}) {
      return preview('previewRewards', 'rewards', input);
    },
    async prepareStakeTransaction(input = {}) {
      return prepare('prepareStakeTransaction', input);
    },
    async prepareUnstakeTransaction(input = {}) {
      return prepare('prepareUnstakeTransaction', input);
    }
  });
}

function defaultRisks(provider) {
  return Object.freeze([
    {
      code: 'validator_performance',
      severity: 'medium',
      message: `Staking rewards depend on ${provider} validator uptime and performance.`
    },
    {
      code: 'liquidity_delay',
      severity: 'medium',
      message: 'Unstake requests may require a protocol or provider withdrawal period before funds are liquid.'
    },
    {
      code: 'financial_review_required',
      severity: 'high',
      message: 'Human review is required before enabling TON staking in a release.'
    }
  ]);
}

export function createMockTonStakingAdapter(seed = {}) {
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
  const previews = new Map();
  let nextPreviewId = 1;
  let nextDraftId = 1;

  function makePreview(provider, action, request) {
    const preview = {
      id: `mock-${provider}-${action}-preview-${nextPreviewId}`,
      provider,
      action,
      network: walletConfig.network,
      amountNanoTon: request.amountNanoTon ?? 0n,
      estimatedAnnualYieldBps: seed.estimatedAnnualYieldBps ?? 420,
      claimableRewardsNanoTon: action === 'rewards' ? seed.claimableRewardsNanoTon ?? 0n : 0n,
      unlocksAt: action === 'unstake' ? seed.unlocksAt ?? '2026-05-03T00:00:00.000Z' : null,
      risks: {
        visibleBeforeApproval: true,
        provider,
        items: defaultRisks(provider)
      },
      fees: {
        visibleBeforeApproval: true,
        networkFeeNanoTon: seed.networkFeeNanoTon ?? 5000000n,
        providerFeeBps: seed.providerFeeBps ?? 500,
        withdrawalFeeNanoTon: seed.withdrawalFeeNanoTon ?? 0n
      },
      requiresTransactionConfirmation: false,
      signed: false
    };
    nextPreviewId += 1;
    previews.set(preview.id, preview);
    return cloneValue(preview);
  }

  function makeProvider(provider) {
    return {
      async previewStake(request) {
        commands.push({ method: 'previewStake', request: cloneValue(request) });
        return makePreview(provider, 'stake', request);
      },
      async previewUnstake(request) {
        commands.push({ method: 'previewUnstake', request: cloneValue(request) });
        return makePreview(provider, 'unstake', request);
      },
      async previewRewards(request) {
        commands.push({ method: 'previewRewards', request: cloneValue(request) });
        return makePreview(provider, 'rewards', request);
      },
      async prepareStakeTransaction(request) {
        commands.push({ method: 'prepareStakeTransaction', request: cloneValue(request) });
        const preview = previews.get(request.previewId);
        const draft = {
          id: `mock-${provider}-stake-draft-${nextDraftId}`,
          previewId: request.previewId,
          provider: preview?.provider ?? provider,
          action: 'stake',
          status: 'draft',
          from: request.from,
          network: walletConfig.network,
          signed: false,
          requiresSigningConfirmation: true
        };
        nextDraftId += 1;
        return cloneValue(draft);
      },
      async prepareUnstakeTransaction(request) {
        commands.push({ method: 'prepareUnstakeTransaction', request: cloneValue(request) });
        const preview = previews.get(request.previewId);
        const draft = {
          id: `mock-${provider}-unstake-draft-${nextDraftId}`,
          previewId: request.previewId,
          provider: preview?.provider ?? provider,
          action: 'unstake',
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

  const adapter = createTonStakingAdapter(
    {
      tonstakers: makeProvider('tonstakers'),
      whales: makeProvider('whales')
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
