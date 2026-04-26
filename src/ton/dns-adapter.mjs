import { TON_NETWORKS } from './wallet-adapter.mjs';

export const TON_DNS_RESOLUTION_STATUSES = Object.freeze(['resolved', 'not_found', 'failed', 'invalid']);

const DEFAULT_SUCCESS_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 30 * 1000;
const TON_DNS_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,124}[a-z0-9])?\.ton$/;

export class TonDnsAdapterError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonDnsAdapterError';
    this.code = code;
    this.details = details;
  }
}

function normalizeNetwork(value = 'mainnet') {
  const network = String(value ?? '').trim().toLowerCase();

  if (!TON_NETWORKS.includes(network)) {
    throw new TonDnsAdapterError(`Unsupported TON network: ${value}`, 'unsupported_network');
  }

  return network;
}

function adapterError(errors, code) {
  return new TonDnsAdapterError(errors.join(' '), code, errors);
}

function nowFrom(options) {
  return typeof options.now === 'function' ? options.now() : Date.now();
}

function sanitizeProviderError(error) {
  const code = error instanceof TonDnsAdapterError ? error.code : 'provider_error';
  return {
    code,
    message: 'TON DNS provider unavailable. Falling back to the original address.'
  };
}

function cloneValue(value) {
  return structuredClone(value);
}

export function validateTonDnsName(value) {
  const errors = [];
  const rawName = String(value ?? '').trim();
  const name = rawName.toLowerCase();

  if (!rawName) {
    errors.push('TON DNS name is required.');
  } else if (rawName !== name && rawName.toLowerCase() !== name) {
    errors.push('TON DNS name must use ASCII letters, digits, hyphens, and the .ton suffix.');
  } else if (!/^[\x20-\x7E]+$/.test(rawName)) {
    errors.push('TON DNS name must use ASCII letters, digits, hyphens, and the .ton suffix.');
  } else if (!TON_DNS_NAME_PATTERN.test(name)) {
    errors.push('TON DNS name must use a single label with letters, digits, hyphens, and the .ton suffix.');
  }

  return {
    valid: errors.length === 0,
    errors,
    name,
    input: rawName
  };
}

function normalizeRecords(records = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(records ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = String(value).trim();
  }
  return normalized;
}

function normalizeResolution(providerResolution, context) {
  const records = normalizeRecords(providerResolution.records ?? providerResolution);
  const walletAddress = String(providerResolution.walletAddress ?? providerResolution.wallet ?? records.wallet ?? '').trim();
  const hasRecords = walletAddress || Object.keys(records).length > 0;

  if (!hasRecords) {
    return {
      input: context.input,
      name: context.name,
      network: context.network,
      status: 'not_found',
      verified: false,
      fallbackAddress: context.fallbackAddress,
      expiresAt: context.expiresAt,
      warnings: ['TON DNS name did not return a wallet or supported resource record.']
    };
  }

  if (walletAddress) {
    records.wallet = walletAddress;
  }

  return {
    input: context.input,
    name: context.name,
    network: context.network,
    status: 'resolved',
    verified: true,
    walletAddress,
    records,
    expiresAt: context.expiresAt,
    warnings: []
  };
}

function makeFallbackResolution(validation, context, status, warnings, error) {
  const resolution = {
    input: validation.input,
    name: validation.name,
    network: context.network,
    status,
    verified: false,
    fallbackAddress: context.fallbackAddress,
    expiresAt: context.expiresAt,
    warnings
  };

  if (error) {
    resolution.error = error;
  }

  return resolution;
}

export function createTonDnsAdapter(implementation, options = {}) {
  if (!implementation || typeof implementation !== 'object' || typeof implementation.resolve !== 'function') {
    throw new TonDnsAdapterError('TON DNS adapter implementation must provide a resolve(name, context) method.', 'invalid_implementation');
  }

  const network = normalizeNetwork(options.network ?? 'mainnet');
  const successTtlMs = Number.isSafeInteger(options.successTtlMs) && options.successTtlMs > 0 ? options.successTtlMs : DEFAULT_SUCCESS_TTL_MS;
  const failureTtlMs = Number.isSafeInteger(options.failureTtlMs) && options.failureTtlMs > 0 ? options.failureTtlMs : DEFAULT_FAILURE_TTL_MS;
  const cache = new Map();

  return Object.freeze({
    network,
    async resolve(value, resolveOptions = {}) {
      const validation = validateTonDnsName(value);
      const fallbackAddress = String(resolveOptions.fallbackAddress ?? '').trim();
      const currentTime = nowFrom(options);

      if (!validation.valid) {
        return makeFallbackResolution(
          validation,
          {
            network,
            fallbackAddress,
            expiresAt: currentTime
          },
          'invalid',
          validation.errors
        );
      }

      const cached = cache.get(validation.name);
      if (cached && cached.expiresAt > currentTime) {
        return cloneValue({ ...cached.resolution, input: validation.input, fallbackAddress });
      }

      try {
        const expiresAt = currentTime + successTtlMs;
        const providerResolution = await implementation.resolve(validation.name, {
          network,
          fallbackAddress,
          now: currentTime
        });
        const resolution = normalizeResolution(providerResolution ?? {}, {
          input: validation.input,
          name: validation.name,
          network,
          fallbackAddress,
          expiresAt
        });

        if (resolution.status === 'resolved') {
          cache.set(validation.name, { expiresAt, resolution: cloneValue(resolution) });
        } else {
          cache.set(validation.name, {
            expiresAt: currentTime + failureTtlMs,
            resolution: cloneValue({ ...resolution, expiresAt: currentTime + failureTtlMs })
          });
        }

        return resolution;
      } catch (error) {
        const expiresAt = currentTime + failureTtlMs;
        const resolution = makeFallbackResolution(
          validation,
          { network, fallbackAddress, expiresAt },
          'failed',
          ['TON DNS resolution failed; displaying the original address.'],
          sanitizeProviderError(error)
        );
        cache.set(validation.name, { expiresAt, resolution: cloneValue(resolution) });
        return resolution;
      }
    },
    clearCache() {
      cache.clear();
    }
  });
}

export function createTonDnsResolutionView(resolution = {}) {
  const fallbackAddress = String(resolution.fallbackAddress ?? '').trim();
  const displayAddress = resolution.verified
    ? String(resolution.walletAddress ?? resolution.records?.wallet ?? fallbackAddress).trim()
    : fallbackAddress;

  return {
    input: String(resolution.input ?? resolution.name ?? '').trim(),
    displayName: String(resolution.name ?? '').trim(),
    displayAddress,
    verified: resolution.verified === true,
    status: TON_DNS_RESOLUTION_STATUSES.includes(resolution.status) ? resolution.status : 'failed',
    fallbackUsed: resolution.verified !== true,
    warnings: Array.isArray(resolution.warnings) ? [...resolution.warnings] : []
  };
}

export function createMockTonDnsAdapter(seed = {}) {
  const recordsByName = new Map();
  for (const [name, records] of Object.entries(seed.records ?? {})) {
    const validation = validateTonDnsName(name);
    if (!validation.valid) {
      throw adapterError(validation.errors, 'invalid_dns_fixture');
    }
    recordsByName.set(validation.name, cloneValue(records));
  }

  const commands = [];
  const adapter = createTonDnsAdapter(
    {
      async resolve(name, context) {
        commands.push({ method: 'resolve', name, context: cloneValue(context) });
        return recordsByName.get(name) ?? null;
      }
    },
    {
      network: seed.network ?? 'mainnet',
      now: seed.now,
      successTtlMs: seed.successTtlMs,
      failureTtlMs: seed.failureTtlMs
    }
  );

  return Object.freeze({
    ...adapter,
    getCommands() {
      return cloneValue(commands);
    }
  });
}
