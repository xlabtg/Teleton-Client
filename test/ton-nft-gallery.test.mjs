import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonNftGalleryAdapter,
  createTonNftGalleryAdapter,
  createTonNftGalleryState,
  sanitizeTonNftMetadata,
  validateTonNftOwnershipRequest
} from '../src/ton/nft-gallery.mjs';

test('TON NFT gallery starts with a loading view state and returns empty ownership results', async () => {
  assert.deepEqual(createTonNftGalleryState(), {
    status: 'loading',
    items: [],
    totalCount: 0,
    error: undefined
  });

  const adapter = createMockTonNftGalleryAdapter({
    address: 'EQDownerAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet'
  });

  const gallery = await adapter.getOwnedNfts();

  assert.equal(gallery.status, 'empty');
  assert.deepEqual(gallery.items, []);
  assert.equal(gallery.totalCount, 0);
  assert.deepEqual(adapter.getCommands(), [
    {
      method: 'getOwnedNfts',
      request: {
        ownerAddress: 'EQDownerAddress',
        network: 'testnet'
      }
    }
  ]);
});

test('mock TON NFT gallery exposes owned items, collection lookup, and item lookup', async () => {
  const adapter = createMockTonNftGalleryAdapter({
    address: 'EQDownerAddress',
    walletProviderRef: 'wallet:tonkeeper:test-wallet',
    items: [
      {
        address: 'EQDnftItemAddress',
        collectionAddress: 'EQDcollectionAddress',
        metadata: {
          name: 'Genesis Pass',
          description: 'Early supporter badge',
          imageUrl: 'https://cdn.example.test/nft.png',
          attributes: [{ trait_type: 'Tier', value: 'Founder' }],
          verified: true
        }
      }
    ],
    collections: [
      {
        address: 'EQDcollectionAddress',
        name: 'Teleton Passes',
        imageUrl: 'https://cdn.example.test/collection.png'
      }
    ]
  });

  const gallery = await adapter.getOwnedNfts({ collectionAddress: 'EQDcollectionAddress' });
  const collection = await adapter.getCollection({ address: 'EQDcollectionAddress' });
  const item = await adapter.getItem({ address: 'EQDnftItemAddress' });

  assert.equal(gallery.status, 'ready');
  assert.equal(gallery.items[0].metadataStatus, 'verified');
  assert.equal(gallery.items[0].verified, true);
  assert.deepEqual(gallery.items[0].metadata.attributes, [{ traitType: 'Tier', value: 'Founder' }]);
  assert.deepEqual(collection, {
    address: 'EQDcollectionAddress',
    network: 'testnet',
    name: 'Teleton Passes',
    imageUrl: 'https://cdn.example.test/collection.png',
    attributes: []
  });
  assert.equal(item.address, 'EQDnftItemAddress');
  assert.deepEqual(
    adapter.getCommands().map((command) => command.method),
    ['getOwnedNfts', 'getCollection', 'getItem']
  );
});

test('TON NFT metadata sanitizer removes unsafe text, scripts, and media URLs', () => {
  const result = sanitizeTonNftMetadata({
    name: '<script>alert(1)</script>Rare NFT',
    description: 'Owned by <b>Alice</b>',
    imageUrl: 'javascript:alert(1)',
    animation_url: 'ipfs://bafybeigdyrzt',
    externalUrl: 'http://tracker.example.test/nft',
    attributes: [
      { trait_type: '<b>Rank</b>', value: '1' },
      { trait_type: 'Ignored' }
    ]
  });

  assert.equal(result.status, 'malformed');
  assert.equal(result.metadata.name, 'alert(1)Rare NFT');
  assert.equal(result.metadata.description, 'Owned by Alice');
  assert.equal(result.metadata.imageUrl, undefined);
  assert.equal(result.metadata.animationUrl, 'ipfs://bafybeigdyrzt');
  assert.equal(result.metadata.externalUrl, undefined);
  assert.deepEqual(result.metadata.attributes, [{ traitType: 'Rank', value: '1' }]);
  assert.match(result.warnings.join('\n'), /imageUrl was removed/);
  assert.match(result.warnings.join('\n'), /externalUrl was removed/);
});

test('TON NFT gallery validates ownership requests before provider calls', async () => {
  const calls = [];
  const adapter = createTonNftGalleryAdapter(
    {
      async getOwnedNfts(request) {
        calls.push({ method: 'getOwnedNfts', request });
        return {
          items: [
            {
              address: 'EQDitemAddress',
              metadata: {
                name: 'Unverified Item',
                imageUrl: 'https://cdn.example.test/item.png'
              }
            }
          ]
        };
      },
      async getCollection() {
        throw new Error('not used');
      },
      async getItem() {
        throw new Error('not used');
      }
    },
    {
      address: 'EQDownerAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet',
      network: 'mainnet'
    }
  );

  await assert.rejects(() => adapter.getOwnedNfts({ ownerAddress: '' }), /owner address/);
  await assert.rejects(() => adapter.getOwnedNfts({ privateKey: 'plaintext-key' }), /private keys are not accepted/i);

  const gallery = await adapter.getOwnedNfts();

  assert.equal(gallery.status, 'ready');
  assert.equal(gallery.items[0].metadataStatus, 'unverified');
  assert.deepEqual(calls, [
    {
      method: 'getOwnedNfts',
      request: {
        ownerAddress: 'EQDownerAddress',
        network: 'mainnet'
      }
    }
  ]);
});

test('TON NFT gallery rejects provider items without item addresses', async () => {
  const adapter = createTonNftGalleryAdapter(
    {
      async getOwnedNfts() {
        return {
          items: [
            {
              metadata: {
                name: 'Missing Address',
                imageUrl: 'https://cdn.example.test/missing.png'
              }
            }
          ]
        };
      },
      async getCollection() {
        throw new Error('not used');
      },
      async getItem() {
        throw new Error('not used');
      }
    },
    {
      address: 'EQDownerAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(() => adapter.getOwnedNfts(), /item address is required/);
});

test('TON NFT ownership validation rejects secret material', () => {
  const validation = validateTonNftOwnershipRequest(
    {
      ownerAddress: 'EQDownerAddress',
      privateKey: 'plaintext-key'
    },
    { address: 'EQDownerAddress' }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /private keys are not accepted/i);
});

test('TON NFT provider errors are redacted before crossing the shared boundary', async () => {
  const adapter = createTonNftGalleryAdapter(
    {
      async getOwnedNfts() {
        throw new Error('indexer failed for mnemonic=words env:TON_SECRET');
      },
      async getCollection() {
        throw new Error('not used');
      },
      async getItem() {
        throw new Error('not used');
      }
    },
    {
      address: 'EQDownerAddress',
      walletProviderRef: 'wallet:tonkeeper:test-wallet'
    }
  );

  await assert.rejects(
    () => adapter.getOwnedNfts(),
    (error) => {
      assert.equal(error.code, 'nft_provider_error');
      assert.match(error.message, /indexer failed/);
      assert.doesNotMatch(error.message, /words|TON_SECRET|mnemonic/);
      return true;
    }
  );
});
