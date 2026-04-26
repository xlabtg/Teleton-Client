import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPublicProxyCatalog,
  validatePublicProxyCatalog,
  validatePublicProxyCatalogRelease
} from '../src/foundation/public-proxy-catalog.mjs';
import { createTeletonSettings, validateTeletonSettings } from '../src/foundation/settings-model.mjs';

const reviewedAt = '2026-04-25T12:00:00.000Z';

const catalogInput = {
  enabled: true,
  reviewedByHuman: true,
  reviewedAt,
  entries: [
    {
      id: 'public-mtproto-example',
      protocol: 'mtproto',
      host: 'mtproxy.example',
      port: 443,
      secretRef: 'env:PUBLIC_MTPROTO_SECRET',
      source: {
        name: 'Example proxy directory',
        url: 'https://example.com/mtproto-proxies',
        verifiedAt: reviewedAt,
        verificationNotes: 'Maintainer reviewed source ownership and freshness before inclusion.'
      },
      freshness: {
        checkedAt: reviewedAt,
        expiresAt: '2026-05-25T12:00:00.000Z'
      },
      review: {
        required: true,
        status: 'approved',
        reviewer: 'maintainer',
        reviewedAt
      }
    }
  ]
};

test('public proxy catalog defaults to disabled opt-in settings', () => {
  const settings = createTeletonSettings();

  assert.equal(settings.proxy.publicCatalog.enabled, false);
  assert.equal(settings.proxy.publicCatalog.reviewedByHuman, false);
  assert.deepEqual(settings.proxy.publicCatalog.entries, []);
});

test('public proxy catalog requires source, freshness, and human review metadata', () => {
  const catalog = createPublicProxyCatalog(catalogInput);

  assert.equal(catalog.enabled, true);
  assert.equal(catalog.reviewedByHuman, true);
  assert.equal(catalog.entries[0].source.url, 'https://example.com/mtproto-proxies');
  assert.equal(catalog.entries[0].freshness.expiresAt, '2026-05-25T12:00:00.000Z');
  assert.equal(catalog.entries[0].review.status, 'approved');

  const invalid = validatePublicProxyCatalog({
    enabled: true,
    reviewedByHuman: false,
    entries: [
      {
        id: 'missing-review',
        protocol: 'mtproto',
        host: 'mtproxy.example',
        port: 443,
        secretRef: 'env:PUBLIC_MTPROTO_SECRET'
      }
    ]
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /source metadata/);
  assert.match(invalid.errors.join('\n'), /freshness metadata/);
  assert.match(invalid.errors.join('\n'), /Human review is required/);
});

test('settings can store a reviewed catalog without enabling proxy routing', () => {
  const settings = createTeletonSettings({
    proxy: {
      publicCatalog: catalogInput
    }
  });

  assert.equal(settings.proxy.enabled, false);
  assert.equal(settings.proxy.activeProxyId, null);
  assert.deepEqual(settings.proxy.entries, []);
  assert.equal(settings.proxy.publicCatalog.enabled, true);
  assert.equal(validateTeletonSettings(settings).valid, true);
});

test('shipping a public proxy catalog is blocked until all entries are approved', () => {
  assert.equal(validatePublicProxyCatalogRelease(catalogInput).valid, true);

  const invalid = validatePublicProxyCatalogRelease({
    ...catalogInput,
    entries: [
      {
        ...catalogInput.entries[0],
        review: {
          ...catalogInput.entries[0].review,
          status: 'pending'
        }
      }
    ]
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /approved human review/);
});
