export const TON_TRANSACTION_HISTORY_TYPES = Object.freeze(['transfer', 'jetton-transfer', 'swap', 'stake', 'unstake', 'nft']);
export const TON_TRANSACTION_HISTORY_STATUSES = Object.freeze(['confirmed', 'pending', 'failed', 'cancelled']);
export const TON_TRANSACTION_HISTORY_DIRECTIONS = Object.freeze(['in', 'out', 'self']);

export const TON_TRANSACTION_HISTORY_EMPTY_STATE = Object.freeze({
  title: 'No transactions found',
  message: 'Adjust filters or wait for new TON wallet activity.'
});

const STATUS_STATES = Object.freeze({
  confirmed: Object.freeze({
    label: 'Confirmed',
    terminal: true,
    failed: false,
    pending: false
  }),
  pending: Object.freeze({
    label: 'Pending',
    terminal: false,
    failed: false,
    pending: true
  }),
  failed: Object.freeze({
    label: 'Failed',
    terminal: true,
    failed: true,
    pending: false
  }),
  cancelled: Object.freeze({
    label: 'Cancelled',
    terminal: true,
    failed: true,
    pending: false
  })
});

const TON_TOKEN = Object.freeze({
  type: 'ton',
  symbol: 'TON',
  name: 'Toncoin',
  decimals: 9,
  masterAddress: null
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export class TonTransactionHistoryError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonTransactionHistoryError';
    this.code = code;
    this.details = details;
  }
}

function cloneValue(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function adapterError(errors, code) {
  return new TonTransactionHistoryError(errors.join(' '), code, errors);
}

function normalizeEnum(value, allowed, fieldName, errors) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    errors.push(`TON transaction history ${fieldName} must be one of: ${allowed.join(', ')}.`);
  }

  return normalized;
}

function normalizeTimestamp(value, errors) {
  const timestamp = String(value ?? '').trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    errors.push('TON transaction history timestamp must be an ISO-compatible date string.');
  }

  return timestamp;
}

function normalizeAtomicAmount(value, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount <= 0n) {
    errors.push('TON transaction history amountAtomic must be a positive bigint or safe integer.');
  }

  return amount;
}

function normalizeOptionalNanoTon(value, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount < 0n) {
    errors.push('TON transaction history feeNanoTon must be a non-negative bigint or safe integer.');
  }

  return amount;
}

function normalizeAddress(value) {
  const address = String(value ?? '').trim();
  return address || null;
}

function normalizeId(value, errors) {
  const id = String(value ?? '').trim();
  if (!id) {
    errors.push('TON transaction history id is required.');
  }

  return id;
}

function normalizeToken(input, errors) {
  if (String(input ?? '').trim().toLowerCase() === 'ton') {
    return TON_TOKEN;
  }

  if (!isPlainObject(input)) {
    errors.push('TON transaction history token must be TON or a Jetton metadata object.');
    return {
      type: 'jetton',
      symbol: 'UNKNOWN',
      name: 'Unknown Jetton',
      decimals: 0,
      masterAddress: ''
    };
  }

  const masterAddress = String(input.masterAddress ?? input.address ?? input.jettonMasterAddress ?? '').trim();
  const symbol = String(input.symbol ?? '').trim().toUpperCase();
  const name = String(input.name ?? '').trim();
  const decimals = Number(input.decimals);

  if (!masterAddress) {
    errors.push('TON transaction history Jetton masterAddress is required.');
  }

  if (!symbol) {
    errors.push('TON transaction history Jetton symbol is required.');
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    errors.push('TON transaction history Jetton decimals must be an integer between 0 and 255.');
  }

  return {
    type: 'jetton',
    symbol: symbol || 'UNKNOWN',
    name: name || 'Unknown Jetton',
    decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : 0,
    masterAddress
  };
}

function deriveCounterparty(input, direction, from, to) {
  const explicit = normalizeAddress(input.counterparty);
  if (explicit) {
    return explicit;
  }

  if (direction === 'in') {
    return from;
  }

  if (direction === 'out') {
    return to;
  }

  return null;
}

function normalizeMetadata(input) {
  return isPlainObject(input) ? cloneValue(input) : {};
}

export function normalizeTonTransactionHistoryRecord(input = {}) {
  if (!isPlainObject(input)) {
    throw new TonTransactionHistoryError('TON transaction history record must be an object.', 'invalid_history_record');
  }

  const errors = [];
  const type = normalizeEnum(input.type, TON_TRANSACTION_HISTORY_TYPES, 'type', errors);
  const status = normalizeEnum(input.status, TON_TRANSACTION_HISTORY_STATUSES, 'status', errors);
  const direction = normalizeEnum(input.direction ?? 'self', TON_TRANSACTION_HISTORY_DIRECTIONS, 'direction', errors);
  const from = normalizeAddress(input.from);
  const to = normalizeAddress(input.to);
  const token = normalizeToken(input.token ?? input.asset ?? 'TON', errors);

  const record = {
    id: normalizeId(input.id ?? input.hash, errors),
    type,
    token,
    status,
    statusState: cloneValue(STATUS_STATES[status] ?? STATUS_STATES.failed),
    timestamp: normalizeTimestamp(input.timestamp ?? input.createdAt, errors),
    direction,
    amountAtomic: normalizeAtomicAmount(input.amountAtomic ?? input.amountNanoTon ?? input.amount, errors),
    from,
    to,
    counterparty: deriveCounterparty(input, direction, from, to),
    feeNanoTon: normalizeOptionalNanoTon(input.feeNanoTon ?? input.networkFeeNanoTon, errors),
    lt: input.lt === undefined || input.lt === null ? null : String(input.lt),
    hash: input.hash === undefined || input.hash === null ? null : String(input.hash),
    reason: input.reason === undefined || input.reason === null ? null : String(input.reason),
    metadata: normalizeMetadata(input.metadata)
  };

  if (errors.length > 0) {
    throw adapterError(errors, 'invalid_history_record');
  }

  return Object.freeze({
    ...record,
    token: Object.freeze(record.token),
    statusState: Object.freeze(record.statusState),
    metadata: Object.freeze(record.metadata)
  });
}

function normalizeDateFilter(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = Date.parse(String(value));
  if (Number.isNaN(date)) {
    throw new TonTransactionHistoryError(`TON transaction history ${fieldName} filter must be an ISO-compatible date string.`, 'invalid_filter');
  }

  return date;
}

function normalizeOptionalFilterEnum(value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new TonTransactionHistoryError(
      `TON transaction history ${fieldName} filter must be one of: ${allowed.join(', ')}.`,
      'invalid_filter'
    );
  }

  return normalized;
}

function normalizePagination(input = {}) {
  const limitInput = input.limit === undefined || input.limit === null ? DEFAULT_LIMIT : Number(input.limit);
  const cursorInput = input.cursor === undefined || input.cursor === null || input.cursor === '' ? input.offset ?? 0 : input.cursor;
  const limit = Number.isSafeInteger(limitInput) ? Math.max(1, Math.min(limitInput, MAX_LIMIT)) : DEFAULT_LIMIT;
  const offset = Number(cursorInput);

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TonTransactionHistoryError('TON transaction history cursor must be a non-negative integer offset.', 'invalid_cursor');
  }

  return {
    limit,
    offset
  };
}

function normalizeFilters(filters = {}) {
  return {
    type: normalizeOptionalFilterEnum(filters.type, TON_TRANSACTION_HISTORY_TYPES, 'type'),
    status: normalizeOptionalFilterEnum(filters.status, TON_TRANSACTION_HISTORY_STATUSES, 'status'),
    token: filters.token === undefined || filters.token === null || filters.token === '' ? null : String(filters.token).trim().toLowerCase(),
    counterparty:
      filters.counterparty === undefined || filters.counterparty === null || filters.counterparty === ''
        ? null
        : String(filters.counterparty).trim().toLowerCase(),
    from: normalizeDateFilter(filters.from ?? filters.startDate, 'from'),
    to: normalizeDateFilter(filters.to ?? filters.endDate, 'to')
  };
}

function tokenMatches(token, filter) {
  if (filter === null) {
    return true;
  }

  return (
    token.symbol.toLowerCase() === filter ||
    token.type.toLowerCase() === filter ||
    (token.masterAddress !== null && token.masterAddress.toLowerCase() === filter)
  );
}

function recordMatches(record, filters) {
  if (filters.type !== null && record.type !== filters.type) {
    return false;
  }

  if (filters.status !== null && record.status !== filters.status) {
    return false;
  }

  if (!tokenMatches(record.token, filters.token)) {
    return false;
  }

  if (filters.counterparty !== null && String(record.counterparty ?? '').toLowerCase() !== filters.counterparty) {
    return false;
  }

  const timestamp = Date.parse(record.timestamp);
  if (filters.from !== null && timestamp < filters.from) {
    return false;
  }

  if (filters.to !== null && timestamp > filters.to) {
    return false;
  }

  return true;
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const timestampDelta = Date.parse(right.timestamp) - Date.parse(left.timestamp);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

export function filterTonTransactionHistory(records = [], query = {}) {
  if (!Array.isArray(records)) {
    throw new TonTransactionHistoryError('TON transaction history records must be an array.', 'invalid_history_records');
  }

  const filters = normalizeFilters(query);
  const page = normalizePagination(query);
  const warnings = [];
  const normalized = [];

  records.forEach((record, index) => {
    try {
      normalized.push(normalizeTonTransactionHistoryRecord(record));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Skipped TON transaction history record ${index}: ${message}`);
    }
  });

  const filtered = sortRecords(normalized.filter((record) => recordMatches(record, filters)));
  const items = filtered.slice(page.offset, page.offset + page.limit);
  const nextOffset = page.offset + items.length;
  const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

  return {
    items: items.map(cloneValue),
    total: filtered.length,
    nextCursor,
    page,
    filters,
    empty: filtered.length === 0,
    emptyState: filtered.length === 0 ? cloneValue(TON_TRANSACTION_HISTORY_EMPTY_STATE) : null,
    diagnostics: {
      sourceRecords: records.length,
      skippedRecords: warnings.length,
      warnings
    }
  };
}

export function createMockTonTransactionHistoryStore(seed = {}) {
  const records = [...(seed.records ?? [])];

  return Object.freeze({
    addTransaction(input = {}) {
      const record = normalizeTonTransactionHistoryRecord(input);
      records.push(record);
      return cloneValue(record);
    },
    listTransactions(query = {}) {
      return filterTonTransactionHistory(records, query);
    },
    getTransactions() {
      return records.map(cloneValue);
    }
  });
}
