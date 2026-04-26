export const TON_NETWORKS = Object.freeze(['mainnet', 'testnet']);
export const TON_TRANSFER_STATUSES = Object.freeze(['draft', 'pending', 'confirmed', 'failed', 'cancelled']);

const REQUIRED_IMPLEMENTATION_METHODS = ['getBalance', 'getReceiveAddress', 'prepareTransfer', 'getTransferStatus'];
const PRIVATE_KEY_FIELDS = ['privateKey', 'private_key', 'mnemonic', 'seedPhrase', 'seed_phrase'];

export class TonWalletAdapterError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonWalletAdapterError';
    this.code = code;
    this.details = details;
  }
}

function adapterError(errors, code) {
  return new TonWalletAdapterError(errors.join(' '), code, errors);
}

function normalizeNetwork(value = 'testnet') {
  const network = String(value ?? '').trim().toLowerCase();

  if (!TON_NETWORKS.includes(network)) {
    throw new TonWalletAdapterError(`Unsupported TON network: ${value}`, 'unsupported_network');
  }

  return network;
}

function assertBridgeImplementation(implementation) {
  if (!implementation || typeof implementation !== 'object') {
    throw new TonWalletAdapterError('TON wallet adapter implementation must be an object.', 'invalid_implementation');
  }

  const missingMethods = REQUIRED_IMPLEMENTATION_METHODS.filter((method) => typeof implementation[method] !== 'function');
  if (missingMethods.length > 0) {
    throw new TonWalletAdapterError(
      `TON wallet adapter implementation is missing methods: ${missingMethods.join(', ')}.`,
      'invalid_implementation',
      missingMethods
    );
  }
}

function collectPrivateKeyErrors(input, errors) {
  for (const field of PRIVATE_KEY_FIELDS) {
    if (input[field] !== undefined) {
      errors.push(
        `TON private keys are not accepted by the shared adapter boundary. Use a wallet provider or secure storage reference instead of ${field}.`
      );
    }
  }
}

function normalizeAddress(value, label, errors) {
  const address = String(value ?? '').trim();
  if (!address) {
    errors.push(`TON ${label} address is required.`);
  }

  return address;
}

function normalizeWalletId(value, errors) {
  const id = String(value ?? '').trim();
  if (!id) {
    errors.push('TON wallet id is required.');
  }

  return id;
}

function normalizeWalletLabel(value, address) {
  const label = String(value ?? '').trim();
  return label || address;
}

function normalizeWalletIdentity(input = {}, active = false) {
  const validation = validateTonWalletConfig(input);
  const errors = [...validation.errors];
  const id = normalizeWalletId(input.id, errors);
  const label = normalizeWalletLabel(input.label, validation.config.address);

  if (errors.length > 0) {
    throw adapterError(errors, 'invalid_wallet_identity');
  }

  return Object.freeze({
    id,
    label,
    ...validation.config,
    active
  });
}

function toWalletSigningContext(wallet) {
  return Object.freeze({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    network: wallet.network
  });
}

function normalizeNanoTon(value, errors) {
  let amountNanoTon = value;
  if (typeof amountNanoTon === 'number' && Number.isSafeInteger(amountNanoTon)) {
    amountNanoTon = BigInt(amountNanoTon);
  }

  if (typeof amountNanoTon !== 'bigint' || amountNanoTon <= 0n) {
    errors.push('TON transfer amountNanoTon must be a positive bigint or safe integer.');
  }

  return amountNanoTon;
}

function normalizePositiveAtomicAmount(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount <= 0n) {
    errors.push(`Jetton transfer ${fieldName} must be a positive bigint or safe integer.`);
  }

  return amount;
}

function normalizeNonNegativeAtomicAmount(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount < 0n) {
    errors.push(`Jetton balance ${fieldName} must be a non-negative bigint or safe integer.`);
  }

  return amount;
}

function normalizeOptionalAddress(value) {
  const address = String(value ?? '').trim();
  return address || null;
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeJettonMetadata(input) {
  if (input === undefined || input === null) {
    return {
      address: '',
      symbol: 'UNKNOWN',
      name: 'Unknown Jetton',
      decimals: 0,
      imageUrl: null,
      verified: false,
      unknown: true,
      warnings: ['Jetton metadata address is missing.', 'Jetton metadata is unavailable.']
    };
  }

  const metadata = input && typeof input === 'object' ? input : {};
  const warnings = [];
  const address = String(metadata.address ?? metadata.masterAddress ?? '').trim();
  const symbol = String(metadata.symbol ?? '').trim().toUpperCase();
  const name = String(metadata.name ?? '').trim();
  const decimals = Number(metadata.decimals);
  const imageUrl = metadata.imageUrl ?? metadata.image ?? null;

  if (!address) {
    warnings.push('Jetton metadata address is missing.');
  }

  if (!symbol) {
    warnings.push('Jetton metadata symbol is missing.');
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    warnings.push('Jetton metadata decimals must be an integer between 0 and 255.');
  }

  if (imageUrl !== null && imageUrl !== undefined && !isSafeHttpUrl(imageUrl)) {
    warnings.push('Jetton metadata imageUrl must be an http(s) URL.');
  }

  const unknown = warnings.length > 0;

  return {
    address,
    symbol: symbol || 'UNKNOWN',
    name: name || 'Unknown Jetton',
    decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : 0,
    imageUrl: imageUrl !== null && imageUrl !== undefined && isSafeHttpUrl(imageUrl) ? String(imageUrl) : null,
    verified: unknown ? false : metadata.verified === true,
    unknown,
    warnings
  };
}

function normalizeJettonBalance(input = {}) {
  const errors = [];
  const masterAddress = normalizeAddress(input.masterAddress ?? input.jettonMasterAddress, 'Jetton master', errors);
  const balanceAtomic = normalizeNonNegativeAtomicAmount(input.balanceAtomic, 'balanceAtomic', errors);

  if (errors.length > 0) {
    throw adapterError(errors, 'invalid_jetton_balance');
  }

  return {
    walletAddress: normalizeOptionalAddress(input.walletAddress ?? input.jettonWalletAddress),
    masterAddress,
    balanceAtomic,
    metadata: normalizeJettonMetadata({
      address: masterAddress,
      ...(input.metadata ?? {})
    })
  };
}

export function validateTonWalletConfig(input = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const address = normalizeAddress(input.address, 'wallet', errors);
  const walletProviderRef = String(input.walletProviderRef ?? input.providerRef ?? '').trim();
  const secureStorageRef = String(input.secureStorageRef ?? '').trim();
  const network = normalizeNetwork(input.network ?? 'testnet');

  if (!walletProviderRef && !secureStorageRef) {
    errors.push('TON walletProviderRef or secureStorageRef is required so private keys stay outside shared settings.');
  }

  const config = {
    address,
    network
  };

  if (walletProviderRef) {
    config.walletProviderRef = walletProviderRef;
  }

  if (secureStorageRef) {
    config.secureStorageRef = secureStorageRef;
  }

  return {
    valid: errors.length === 0,
    errors,
    config
  };
}

export function validateTonTransferRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const request = {
    from: normalizeAddress(walletConfig.address ?? input.from, 'sender', errors),
    to: normalizeAddress(input.to, 'recipient', errors),
    amountNanoTon: normalizeNanoTon(input.amountNanoTon, errors)
  };

  if (input.memo !== undefined) {
    request.memo = String(input.memo);
  }

  if (input.confirmed !== true) {
    errors.push('TON transfer preparation requires explicit confirmation before signing.');
  } else {
    request.confirmed = true;
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function validateJettonTransferRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const request = {
    from: normalizeAddress(walletConfig.address ?? input.from, 'sender', errors),
    to: normalizeAddress(input.to, 'recipient', errors),
    jettonMasterAddress: normalizeAddress(input.jettonMasterAddress ?? input.masterAddress, 'Jetton master', errors),
    amountAtomic: normalizePositiveAtomicAmount(input.amountAtomic, 'amountAtomic', errors)
  };

  const jettonWalletAddress = normalizeOptionalAddress(input.jettonWalletAddress ?? input.walletAddress);
  if (jettonWalletAddress) {
    request.jettonWalletAddress = jettonWalletAddress;
  }

  if (input.memo !== undefined) {
    request.memo = String(input.memo);
  }

  if (input.confirmed !== true) {
    errors.push('Jetton transfer preparation requires explicit confirmation before signing.');
  } else {
    request.confirmed = true;
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

function validateTransferStatusId(id) {
  const errors = [];
  const transferId = String(id ?? '').trim();

  if (!transferId) {
    errors.push('TON transfer status id is required.');
  }

  return {
    valid: errors.length === 0,
    errors,
    transferId
  };
}

export function createTonWalletAdapter(implementation, options = {}) {
  assertBridgeImplementation(implementation);

  const validation = validateTonWalletConfig(options);
  if (!validation.valid) {
    throw adapterError(validation.errors, 'invalid_wallet_config');
  }

  const walletConfig = {
    ...(options.id === undefined ? {} : { id: String(options.id).trim() }),
    ...(options.label === undefined ? {} : { label: normalizeWalletLabel(options.label, validation.config.address) }),
    ...validation.config
  };

  return Object.freeze({
    network: walletConfig.network,
    async getBalance() {
      const balance = await implementation.getBalance();
      return {
        address: walletConfig.address,
        network: walletConfig.network,
        ...balance
      };
    },
    async getJettonBalances() {
      if (typeof implementation.getJettonBalances !== 'function') {
        return {
          address: walletConfig.address,
          network: walletConfig.network,
          jettons: []
        };
      }

      const balances = await implementation.getJettonBalances();
      const jettons = Array.isArray(balances?.jettons) ? balances.jettons : balances;

      return {
        address: walletConfig.address,
        network: walletConfig.network,
        jettons: (Array.isArray(jettons) ? jettons : []).map(normalizeJettonBalance)
      };
    },
    async getReceiveAddress() {
      const receiveAddress = await implementation.getReceiveAddress();
      return {
        address: walletConfig.address,
        network: walletConfig.network,
        ...receiveAddress
      };
    },
    async prepareTransfer(input = {}) {
      const transferValidation = validateTonTransferRequest(input, walletConfig);
      if (!transferValidation.valid) {
        throw adapterError(transferValidation.errors, 'invalid_transfer_request');
      }

      const draft = await implementation.prepareTransfer(transferValidation.request);
      return walletConfig.id
        ? {
            ...draft,
            wallet: toWalletSigningContext(walletConfig)
          }
        : draft;
    },
    async prepareJettonTransfer(input = {}) {
      if (typeof implementation.prepareJettonTransfer !== 'function') {
        throw new TonWalletAdapterError(
          'TON wallet adapter implementation does not support Jetton transfer preparation.',
          'unsupported_jetton_transfer'
        );
      }

      const transferValidation = validateJettonTransferRequest(input, walletConfig);
      if (!transferValidation.valid) {
        throw adapterError(transferValidation.errors, 'invalid_jetton_transfer_request');
      }

      return implementation.prepareJettonTransfer(transferValidation.request);
    },
    async getTransferStatus(id) {
      const statusValidation = validateTransferStatusId(id);
      if (!statusValidation.valid) {
        throw adapterError(statusValidation.errors, 'invalid_transfer_status_query');
      }

      return implementation.getTransferStatus(statusValidation.transferId);
    }
  });
}

export function createTonWalletManager(options = {}) {
  const wallets = new Map();
  let activeWalletId = null;

  function listWallets() {
    return [...wallets.values()].map((wallet) => ({ ...wallet, active: wallet.id === activeWalletId }));
  }

  function getWallet(id) {
    const walletId = String(id ?? '').trim();
    const wallet = wallets.get(walletId);
    if (!wallet) {
      throw new TonWalletAdapterError(`Unknown TON wallet: ${walletId}`, 'unknown_wallet');
    }

    return wallet;
  }

  function setWallet(wallet) {
    wallets.set(wallet.id, Object.freeze({ ...wallet, active: false }));
  }

  const manager = {
    listWallets,
    getWallet(id) {
      const wallet = getWallet(id);
      return { ...wallet, active: wallet.id === activeWalletId };
    },
    getActiveWallet() {
      if (!activeWalletId) {
        throw new TonWalletAdapterError('No active TON wallet is selected.', 'missing_active_wallet');
      }

      return manager.getWallet(activeWalletId);
    },
    addWallet(input = {}) {
      const wallet = normalizeWalletIdentity(input, wallets.size === 0);
      if (wallets.has(wallet.id)) {
        throw new TonWalletAdapterError(`TON wallet already exists: ${wallet.id}`, 'duplicate_wallet');
      }

      setWallet(wallet);
      if (!activeWalletId || input.active === true) {
        activeWalletId = wallet.id;
      }

      return manager.getWallet(wallet.id);
    },
    switchWallet(id) {
      const wallet = getWallet(id);
      activeWalletId = wallet.id;
      return manager.getWallet(wallet.id);
    },
    renameWallet(id, label) {
      const wallet = getWallet(id);
      const renamed = Object.freeze({
        ...wallet,
        label: normalizeWalletLabel(label, wallet.address)
      });
      setWallet(renamed);
      return manager.getWallet(renamed.id);
    },
    removeWallet(id) {
      const wallet = getWallet(id);
      wallets.delete(wallet.id);

      if (activeWalletId === wallet.id) {
        activeWalletId = wallets.size > 0 ? wallets.keys().next().value : null;
      }

      const secureRefs = [wallet.secureStorageRef, wallet.walletProviderRef].filter(Boolean);

      return Object.freeze({
        removed: Object.freeze({
          id: wallet.id,
          address: wallet.address,
          secureRefs: Object.freeze(secureRefs)
        }),
        activeWallet: activeWalletId ? manager.getActiveWallet() : null
      });
    },
    createActiveWalletAdapter(factory) {
      if (typeof factory !== 'function') {
        throw new TonWalletAdapterError('TON wallet manager requires an adapter factory function.', 'invalid_adapter_factory');
      }

      return factory(manager.getActiveWallet());
    }
  };

  for (const wallet of options.wallets ?? []) {
    manager.addWallet(wallet);
  }

  if (options.activeWalletId !== undefined) {
    manager.switchWallet(options.activeWalletId);
  }

  return Object.freeze(manager);
}

function cloneValue(value) {
  return structuredClone(value);
}

export function createMockTonWalletAdapter(seed = {}) {
  const walletInput = {
    address: seed.address,
    walletProviderRef: seed.walletProviderRef ?? 'wallet:mock-ton-provider',
    secureStorageRef: seed.secureStorageRef,
    network: seed.network ?? 'testnet'
  };
  const validation = validateTonWalletConfig(walletInput);

  if (!validation.valid) {
    throw adapterError(validation.errors, 'invalid_wallet_config');
  }

  const walletConfig =
    seed.id === undefined
      ? validation.config
      : {
          id: String(seed.id).trim(),
          label: normalizeWalletLabel(seed.label, validation.config.address),
          ...validation.config
        };
  const commands = [];
  const transferDrafts = new Map();
  let nextDraftId = 1;

  const implementation = {
    async getBalance() {
      commands.push({ method: 'getBalance' });
      return {
        balanceNanoTon: seed.balanceNanoTon ?? 0n
      };
    },
    async getJettonBalances() {
      commands.push({ method: 'getJettonBalances' });
      return {
        jettons: (seed.jettonBalances ?? []).map(cloneValue)
      };
    },
    async getReceiveAddress() {
      commands.push({ method: 'getReceiveAddress' });
      return {
        address: walletConfig.address
      };
    },
    async prepareTransfer(request) {
      commands.push({ method: 'prepareTransfer', request: cloneValue(request) });
      const draft = {
        id: `mock-ton-draft-${nextDraftId}`,
        status: 'draft',
        signed: false,
        requiresSigningConfirmation: true,
        network: walletConfig.network,
        ...request
      };
      nextDraftId += 1;
      transferDrafts.set(draft.id, draft);

      return cloneValue(draft);
    },
    async prepareJettonTransfer(request) {
      commands.push({ method: 'prepareJettonTransfer', request: cloneValue(request) });
      const draft = {
        id: `mock-jetton-draft-${nextDraftId}`,
        status: 'draft',
        signed: false,
        requiresSigningConfirmation: true,
        assetType: 'jetton',
        network: walletConfig.network,
        ...request
      };
      nextDraftId += 1;
      transferDrafts.set(draft.id, draft);

      return cloneValue(draft);
    },
    async getTransferStatus(id) {
      commands.push({ method: 'getTransferStatus', id });
      const draft = transferDrafts.get(id);
      if (!draft) {
        return {
          id,
          status: 'failed',
          network: walletConfig.network
        };
      }

      return {
        id: draft.id,
        status: draft.status,
        signed: draft.signed,
        network: draft.network
      };
    }
  };

  const adapter = createTonWalletAdapter(implementation, walletConfig);

  return Object.freeze({
    ...adapter,
    getCommands() {
      return commands.map(cloneValue);
    }
  });
}
