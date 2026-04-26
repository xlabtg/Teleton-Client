import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonTransactionHistoryStore,
  filterTonTransactionHistory,
  normalizeTonTransactionHistoryRecord,
  TON_TRANSACTION_HISTORY_EMPTY_STATE,
  TON_TRANSACTION_HISTORY_STATUSES,
  TON_TRANSACTION_HISTORY_TYPES
} from '../src/ton/transaction-history.mjs';

const seedRecords = [
  {
    id: 'ton-out-1',
    type: 'transfer',
    token: 'ton',
    status: 'confirmed',
    timestamp: '2026-04-26T10:00:00.000Z',
    direction: 'out',
    amountAtomic: 1000000000n,
    from: 'EQDwallet',
    to: 'EQDmerchant',
    feeNanoTon: 1200000n,
    lt: '1001',
    hash: 'hash-1'
  },
  {
    id: 'jetton-in-1',
    type: 'jetton-transfer',
    token: {
      masterAddress: 'EQDusdtMaster',
      symbol: 'usdt',
      name: 'Tether USD',
      decimals: 6
    },
    status: 'pending',
    timestamp: '2026-04-26T09:00:00.000Z',
    direction: 'in',
    amountAtomic: 2500000n,
    from: 'EQDcustomer',
    to: 'EQDwallet',
    counterparty: 'EQDcustomer'
  },
  {
    id: 'swap-failed-1',
    type: 'swap',
    token: 'TON',
    status: 'failed',
    timestamp: '2026-04-25T09:00:00.000Z',
    direction: 'out',
    amountAtomic: 500000000n,
    from: 'EQDwallet',
    to: 'EQDdedustRouter',
    counterparty: 'EQDdedustRouter',
    reason: 'Provider route expired.'
  }
];

test('TON transaction history normalizes TON and Jetton records with clear status state', () => {
  assert.deepEqual(TON_TRANSACTION_HISTORY_TYPES, ['transfer', 'jetton-transfer', 'swap', 'stake', 'unstake', 'nft']);
  assert.deepEqual(TON_TRANSACTION_HISTORY_STATUSES, ['confirmed', 'pending', 'failed', 'cancelled']);

  const ton = normalizeTonTransactionHistoryRecord(seedRecords[0]);
  assert.deepEqual(ton, {
    id: 'ton-out-1',
    type: 'transfer',
    token: {
      type: 'ton',
      symbol: 'TON',
      name: 'Toncoin',
      decimals: 9,
      masterAddress: null
    },
    status: 'confirmed',
    statusState: {
      label: 'Confirmed',
      terminal: true,
      failed: false,
      pending: false
    },
    timestamp: '2026-04-26T10:00:00.000Z',
    direction: 'out',
    amountAtomic: 1000000000n,
    from: 'EQDwallet',
    to: 'EQDmerchant',
    counterparty: 'EQDmerchant',
    feeNanoTon: 1200000n,
    lt: '1001',
    hash: 'hash-1',
    reason: null,
    metadata: {}
  });

  const jetton = normalizeTonTransactionHistoryRecord(seedRecords[1]);
  assert.equal(jetton.token.type, 'jetton');
  assert.equal(jetton.token.symbol, 'USDT');
  assert.equal(jetton.token.masterAddress, 'EQDusdtMaster');
  assert.equal(jetton.statusState.pending, true);
  assert.equal(jetton.statusState.terminal, false);
});

test('TON transaction history filters by type, token, status, date range, and counterparty', () => {
  const result = filterTonTransactionHistory(seedRecords, {
    type: 'jetton-transfer',
    token: 'usdt',
    status: 'pending',
    from: '2026-04-26T00:00:00.000Z',
    to: '2026-04-26T23:59:59.999Z',
    counterparty: 'EQDcustomer'
  });

  assert.equal(result.empty, false);
  assert.equal(result.total, 1);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['jetton-in-1']
  );
});

test('TON transaction history pagination is deterministic with stable cursors', () => {
  const store = createMockTonTransactionHistoryStore({ records: seedRecords });

  const firstPage = store.listTransactions({ limit: 2 });
  assert.deepEqual(
    firstPage.items.map((item) => item.id),
    ['ton-out-1', 'jetton-in-1']
  );
  assert.equal(firstPage.nextCursor, '2');
  assert.equal(firstPage.page.limit, 2);
  assert.equal(firstPage.page.offset, 0);

  const secondPage = store.listTransactions({ cursor: firstPage.nextCursor, limit: 2 });
  assert.deepEqual(
    secondPage.items.map((item) => item.id),
    ['swap-failed-1']
  );
  assert.equal(secondPage.nextCursor, null);
  assert.equal(secondPage.page.offset, 2);
});

test('TON transaction history reports empty-state metadata and malformed records', () => {
  const result = filterTonTransactionHistory(
    [
      ...seedRecords,
      {
        id: '',
        type: 'transfer',
        token: 'TON',
        status: 'confirmed',
        timestamp: 'not-a-date',
        amountAtomic: 0n
      }
    ],
    { status: 'cancelled' }
  );

  assert.equal(result.empty, true);
  assert.deepEqual(result.emptyState, TON_TRANSACTION_HISTORY_EMPTY_STATE);
  assert.equal(result.total, 0);
  assert.equal(result.diagnostics.skippedRecords, 1);
  assert.match(result.diagnostics.warnings.at(0), /record 3/i);
});
