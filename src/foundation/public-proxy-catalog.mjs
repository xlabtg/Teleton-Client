import { validateProxyConfig } from './proxy-settings.mjs';

const REVIEW_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
const DEFAULT_PUBLIC_PROXY_CATALOG = Object.freeze({
  enabled: false,
  reviewedByHuman: false,
  reviewedAt: null,
  entries: []
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function booleanError(value, label, errors) {
  if (typeof value !== 'boolean') {
    errors.push(`${label} must be true or false.`);
  }
}

function normalizeIsoTimestamp(value, label, errors, { required = true } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) {
      errors.push(`${label} is required.`);
    }
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp.`);
  }

  return value;
}

function normalizeSource(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} requires source metadata.`);
    return null;
  }

  const source = {
    name: String(value.name ?? '').trim(),
    url: String(value.url ?? '').trim(),
    verifiedAt: normalizeIsoTimestamp(value.verifiedAt, `${label} source verifiedAt`, errors),
    verificationNotes: String(value.verificationNotes ?? '').trim()
  };

  if (!source.name) {
    errors.push(`${label} source name is required.`);
  }

  try {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${label} source url must use http or https.`);
    }
  } catch {
    errors.push(`${label} source url must be a valid URL.`);
  }

  if (!source.verificationNotes) {
    errors.push(`${label} source verificationNotes are required.`);
  }

  return source;
}

function normalizeFreshness(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} requires freshness metadata.`);
    return null;
  }

  const freshness = {
    checkedAt: normalizeIsoTimestamp(value.checkedAt, `${label} freshness checkedAt`, errors),
    expiresAt: normalizeIsoTimestamp(value.expiresAt, `${label} freshness expiresAt`, errors)
  };

  if (
    freshness.checkedAt &&
    freshness.expiresAt &&
    !Number.isNaN(Date.parse(freshness.checkedAt)) &&
    !Number.isNaN(Date.parse(freshness.expiresAt)) &&
    Date.parse(freshness.expiresAt) <= Date.parse(freshness.checkedAt)
  ) {
    errors.push(`${label} freshness expiresAt must be after checkedAt.`);
  }

  return freshness;
}

function normalizeReview(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label}: Human review is required before shipping public proxy sources.`);
    return null;
  }

  const review = {
    required: value.required ?? true,
    status: String(value.status ?? 'pending').trim().toLowerCase(),
    reviewer: String(value.reviewer ?? '').trim(),
    reviewedAt: normalizeIsoTimestamp(value.reviewedAt, `${label} review reviewedAt`, errors, { required: false })
  };

  booleanError(review.required, `${label} review required`, errors);

  if (review.required !== true) {
    errors.push(`${label}: Human review is required before shipping public proxy sources.`);
  }

  if (!REVIEW_STATUSES.includes(review.status)) {
    errors.push(`${label} review status must be one of: ${REVIEW_STATUSES.join(', ')}.`);
  }

  if (review.status === 'approved') {
    if (!review.reviewer) {
      errors.push(`${label} approved review requires a reviewer.`);
    }

    if (!review.reviewedAt) {
      errors.push(`${label} approved review requires reviewedAt.`);
    }
  }

  return review;
}

function normalizeCatalogEntry(entry, index, errors) {
  const label = `Public proxy catalog entry ${entry?.id ?? index + 1}`;

  if (!isPlainObject(entry)) {
    errors.push(`${label} must be an object.`);
    return null;
  }

  const id = String(entry.id ?? '').trim();
  if (!id) {
    errors.push(`${label} requires a stable id.`);
  }

  const proxyValidation = validateProxyConfig({
    protocol: entry.protocol,
    host: entry.host,
    port: entry.port,
    secret: entry.secretRef ?? entry.secret,
    username: entry.usernameRef ?? entry.username,
    password: entry.passwordRef ?? entry.password
  });

  for (const error of proxyValidation.errors) {
    errors.push(`${label}: ${error}`);
  }

  return {
    id,
    ...proxyValidation.config,
    source: normalizeSource(entry.source, label, errors),
    freshness: normalizeFreshness(entry.freshness, label, errors),
    review: normalizeReview(entry.review, label, errors)
  };
}

export function validatePublicProxyCatalog(input = {}) {
  const errors = [];
  const catalogInput = input === undefined ? DEFAULT_PUBLIC_PROXY_CATALOG : input;

  if (!isPlainObject(catalogInput)) {
    return {
      valid: false,
      errors: ['Public proxy catalog must be an object.'],
      catalog: undefined
    };
  }

  const enabled = catalogInput.enabled ?? DEFAULT_PUBLIC_PROXY_CATALOG.enabled;
  const reviewedByHuman = catalogInput.reviewedByHuman ?? DEFAULT_PUBLIC_PROXY_CATALOG.reviewedByHuman;
  const reviewedAt = normalizeIsoTimestamp(
    catalogInput.reviewedAt ?? DEFAULT_PUBLIC_PROXY_CATALOG.reviewedAt,
    'Public proxy catalog reviewedAt',
    errors,
    { required: enabled === true || reviewedByHuman === true }
  );
  const entriesInput = catalogInput.entries ?? DEFAULT_PUBLIC_PROXY_CATALOG.entries;
  const entries = [];
  const ids = new Set();

  booleanError(enabled, 'Public proxy catalog enabled', errors);
  booleanError(reviewedByHuman, 'Public proxy catalog reviewedByHuman', errors);

  if (!Array.isArray(entriesInput)) {
    errors.push('Public proxy catalog entries must be an array.');
  } else {
    for (const [index, entry] of entriesInput.entries()) {
      const normalized = normalizeCatalogEntry(entry, index, errors);
      if (!normalized) {
        continue;
      }

      if (normalized.id && ids.has(normalized.id)) {
        errors.push(`Public proxy catalog entry ${normalized.id} uses a duplicate id.`);
      }

      ids.add(normalized.id);
      entries.push(normalized);
    }
  }

  if (enabled === true && reviewedByHuman !== true) {
    errors.push('Human review is required before enabling the public proxy catalog.');
  }

  if (enabled === true && entries.length === 0) {
    errors.push('Public proxy catalog enabled requires at least one entry.');
  }

  return {
    valid: errors.length === 0,
    errors,
    catalog: {
      enabled,
      reviewedByHuman,
      reviewedAt,
      entries
    }
  };
}

export function createPublicProxyCatalog(input = {}) {
  const result = validatePublicProxyCatalog(input);

  if (!result.valid) {
    throw new Error(result.errors.join(' '));
  }

  return result.catalog;
}

export function validatePublicProxyCatalogRelease(input = {}) {
  const result = validatePublicProxyCatalog(input);
  const errors = [...result.errors];
  const catalog = result.catalog;

  if (catalog?.enabled === true) {
    for (const entry of catalog.entries) {
      if (entry.review?.status !== 'approved') {
        errors.push(`Public proxy catalog entry ${entry.id} requires approved human review before release.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    catalog
  };
}
