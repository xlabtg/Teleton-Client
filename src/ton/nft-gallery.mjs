import { TON_NETWORKS, validateTonWalletConfig } from './wallet-adapter.mjs';

export const TON_NFT_GALLERY_STATES = Object.freeze(['loading', 'empty', 'ready', 'failed']);
export const TON_NFT_METADATA_STATUSES = Object.freeze(['verified', 'unverified', 'malformed']);

const REQUIRED_PROVIDER_METHODS = ['getOwnedNfts', 'getCollection', 'getItem'];
const PRIVATE_KEY_FIELDS = ['privateKey', 'private_key', 'mnemonic', 'seedPhrase', 'seed_phrase'];
const URL_FIELDS = ['imageUrl', 'animationUrl', 'externalUrl'];
const TEXT_LIMITS = Object.freeze({
  name: 120,
  description: 1000,
  collectionName: 120
});

export class TonNftGalleryError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonNftGalleryError';
    this.code = code;
    this.details = details;
  }
}

function adapterError(errors, code) {
  return new TonNftGalleryError(errors.join(' '), code, errors);
}

function cloneValue(value) {
  return structuredClone(value);
}

function collectPrivateKeyErrors(input = {}, errors) {
  for (const field of PRIVATE_KEY_FIELDS) {
    if (input[field] !== undefined) {
      errors.push(
        `TON private keys are not accepted by the shared NFT gallery boundary. Use a wallet provider or secure storage reference instead of ${field}.`
      );
    }
  }
}

function normalizeNetwork(value = 'testnet') {
  const network = String(value ?? '').trim().toLowerCase();

  if (!TON_NETWORKS.includes(network)) {
    throw new TonNftGalleryError(`Unsupported TON network: ${value}`, 'unsupported_network');
  }

  return network;
}

function assertProviderImplementation(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TonNftGalleryError('TON NFT gallery provider must be an object.', 'invalid_implementation');
  }

  const missingMethods = REQUIRED_PROVIDER_METHODS.filter((method) => typeof provider[method] !== 'function');
  if (missingMethods.length > 0) {
    throw new TonNftGalleryError(
      `TON NFT gallery provider is missing methods: ${missingMethods.join(', ')}.`,
      'invalid_implementation',
      missingMethods
    );
  }
}

function normalizeAddress(value, label, errors) {
  const address = String(value ?? '').trim();
  if (!address) {
    errors.push(`TON NFT ${label} address is required.`);
  }

  return address;
}

function safeText(value, limit) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function safeUrl(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    if (!['https:', 'ipfs:'].includes(url.protocol)) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeAttributes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const traitType = safeText(entry.traitType ?? entry.trait_type ?? entry.name, 80);
      const traitValue = safeText(entry.value, 160);

      if (!traitType || !traitValue) {
        return null;
      }

      return { traitType, value: traitValue };
    })
    .filter(Boolean);
}

export function sanitizeTonNftMetadata(input = {}) {
  const warnings = [];
  const metadata = input && typeof input === 'object' ? input : {};

  const sanitized = {};
  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    const value = safeText(metadata[field], limit);
    if (value) {
      sanitized[field] = value;
    }
  }

  for (const field of URL_FIELDS) {
    const value = safeUrl(metadata[field] ?? metadata[field.replace('Url', '_url')]);
    if (value) {
      sanitized[field] = value;
    } else if (metadata[field] !== undefined || metadata[field.replace('Url', '_url')] !== undefined) {
      warnings.push(`${field} was removed because it is not an allowed HTTPS or IPFS URL.`);
    }
  }

  sanitized.attributes = normalizeAttributes(metadata.attributes);

  if (!sanitized.name) {
    warnings.push('NFT metadata is missing a displayable name.');
  }

  if (!sanitized.imageUrl && !sanitized.animationUrl) {
    warnings.push('NFT metadata is missing safe media.');
  }

  return {
    metadata: sanitized,
    status: warnings.length > 0 ? 'malformed' : metadata.verified === true ? 'verified' : 'unverified',
    warnings
  };
}

export function validateTonNftOwnershipRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const request = {
    ownerAddress: normalizeAddress(input.ownerAddress ?? walletConfig.address, 'owner', errors),
    network: normalizeNetwork(input.network ?? walletConfig.network ?? 'testnet')
  };

  if (input.collectionAddress !== undefined) {
    request.collectionAddress = normalizeAddress(input.collectionAddress, 'collection', errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function validateTonNftLookupRequest(input = {}, walletConfig = {}) {
  const errors = [];
  collectPrivateKeyErrors(input, errors);

  const request = {
    address: normalizeAddress(input.address, 'item', errors),
    network: normalizeNetwork(input.network ?? walletConfig.network ?? 'testnet')
  };

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function createTonNftGalleryState(input = {}) {
  const status = TON_NFT_GALLERY_STATES.includes(input.status) ? input.status : 'loading';
  const items = Array.isArray(input.items) ? input.items.map(cloneValue) : [];

  return Object.freeze({
    status,
    items,
    totalCount: Number.isSafeInteger(input.totalCount) ? input.totalCount : items.length,
    error: input.error ? safeText(input.error, 240) : undefined
  });
}

function normalizeGalleryItem(item = {}, walletConfig = {}) {
  const { metadata, status, warnings } = sanitizeTonNftMetadata(item.metadata ?? item);
  const address = String(item.address ?? item.itemAddress ?? '').trim();
  const collectionAddress = String(item.collectionAddress ?? item.collection?.address ?? '').trim();

  if (!address) {
    throw new TonNftGalleryError('TON NFT item address is required.', 'invalid_nft_item');
  }

  return {
    address,
    collectionAddress: collectionAddress || undefined,
    ownerAddress: String(item.ownerAddress ?? walletConfig.address ?? '').trim(),
    network: normalizeNetwork(item.network ?? walletConfig.network ?? 'testnet'),
    metadata,
    metadataStatus: status,
    metadataWarnings: warnings,
    verified: status === 'verified'
  };
}

async function callProvider(provider, method, request) {
  try {
    return await provider[method](request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown TON NFT provider error.');
    const sanitized = message
      .replace(/\b(privateKey|private_key|mnemonic|seedPhrase|seed_phrase)=[^\s]+/gi, '[redacted]')
      .replace(/\benv:[A-Z0-9_]+\b/g, '[redacted]');
    throw new TonNftGalleryError(sanitized, 'nft_provider_error');
  }
}

export function createTonNftGalleryAdapter(provider, options = {}) {
  assertProviderImplementation(provider);

  const walletValidation = validateTonWalletConfig(options);
  if (!walletValidation.valid) {
    throw adapterError(walletValidation.errors, 'invalid_wallet_config');
  }

  const walletConfig = walletValidation.config;

  return Object.freeze({
    network: walletConfig.network,
    async getOwnedNfts(input = {}) {
      const ownershipValidation = validateTonNftOwnershipRequest(input, walletConfig);
      if (!ownershipValidation.valid) {
        throw adapterError(ownershipValidation.errors, 'invalid_nft_ownership_request');
      }

      const response = await callProvider(provider, 'getOwnedNfts', ownershipValidation.request);
      const rawItems = Array.isArray(response?.items) ? response.items : [];
      const items = rawItems.map((item) => normalizeGalleryItem(item, walletConfig));

      return createTonNftGalleryState({
        status: items.length > 0 ? 'ready' : 'empty',
        items,
        totalCount: Number.isSafeInteger(response?.totalCount) ? response.totalCount : items.length
      });
    },
    async getCollection(input = {}) {
      const lookupValidation = validateTonNftLookupRequest(input, walletConfig);
      if (!lookupValidation.valid) {
        throw adapterError(lookupValidation.errors, 'invalid_nft_collection_request');
      }

      const collection = await callProvider(provider, 'getCollection', lookupValidation.request);
      return {
        address: lookupValidation.request.address,
        network: walletConfig.network,
        ...sanitizeTonNftMetadata(collection).metadata
      };
    },
    async getItem(input = {}) {
      const lookupValidation = validateTonNftLookupRequest(input, walletConfig);
      if (!lookupValidation.valid) {
        throw adapterError(lookupValidation.errors, 'invalid_nft_item_request');
      }

      const item = await callProvider(provider, 'getItem', lookupValidation.request);
      return normalizeGalleryItem({ address: lookupValidation.request.address, ...item }, walletConfig);
    }
  });
}

export function createMockTonNftGalleryAdapter(seed = {}) {
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
  const items = Array.isArray(seed.items) ? seed.items.map(cloneValue) : [];
  const collections = new Map((seed.collections ?? []).map((collection) => [collection.address, collection]));

  const provider = {
    async getOwnedNfts(request) {
      commands.push({ method: 'getOwnedNfts', request: cloneValue(request) });
      const filteredItems = request.collectionAddress
        ? items.filter((item) => item.collectionAddress === request.collectionAddress)
        : items;

      return {
        items: cloneValue(filteredItems),
        totalCount: filteredItems.length
      };
    },
    async getCollection(request) {
      commands.push({ method: 'getCollection', request: cloneValue(request) });
      return cloneValue(collections.get(request.address) ?? { name: 'Unknown collection' });
    },
    async getItem(request) {
      commands.push({ method: 'getItem', request: cloneValue(request) });
      return cloneValue(items.find((item) => item.address === request.address) ?? { address: request.address });
    }
  };

  const adapter = createTonNftGalleryAdapter(provider, walletConfig);

  return Object.freeze({
    ...adapter,
    getCommands() {
      return commands.map(cloneValue);
    }
  });
}
