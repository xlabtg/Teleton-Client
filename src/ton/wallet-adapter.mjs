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

  const walletConfig = validation.config;

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

      return implementation.prepareTransfer(transferValidation.request);
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

function cloneValue(value) {
  return structuredClone(value);
}

export function createMockTonWalletAdapter(seed = {}) {
  const validation = validateTonWalletConfig({
    address: seed.address,
    walletProviderRef: seed.walletProviderRef ?? 'wallet:mock-ton-provider',
    secureStorageRef: seed.secureStorageRef,
    network: seed.network ?? 'testnet'
  });

  if (!validation.valid) {
    throw adapterError(validation.errors, 'invalid_wallet_config');
  }

  const walletConfig = validation.config;
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
