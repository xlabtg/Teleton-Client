export const TON_TRANSACTION_HISTORY_STATUSES = Object.freeze(['approved', 'rejected', 'failed', 'pending']);
export const TON_CONFIRMATION_METHODS = Object.freeze(['biometric', 'password']);

const DEFAULT_LIMITS = Object.freeze({
  perTransactionLimitNanoTon: null,
  remainingDailyLimitNanoTon: null,
  highFeeNanoTon: null
});

export class TonTransactionConfirmationError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonTransactionConfirmationError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function adapterError(errors, code) {
  return new TonTransactionConfirmationError(errors.join(' '), code, errors);
}

function normalizeId(value, label, errors) {
  const id = String(value ?? '').trim();
  if (!id) {
    errors.push(`TON transaction ${label} is required.`);
  }

  return id;
}

function normalizeWalletContext(input, errors) {
  if (input === undefined || input === null) {
    errors.push('TON transaction signing wallet is required.');
    return null;
  }

  if (!isPlainObject(input)) {
    errors.push('TON transaction signing wallet must be an object.');
    return null;
  }

  return {
    id: normalizeId(input.id, 'wallet id', errors),
    label: String(input.label ?? '').trim() || normalizeId(input.address, 'wallet address', errors),
    address: normalizeId(input.address, 'wallet address', errors),
    network: String(input.network ?? '').trim() || null
  };
}

function normalizePositiveNanoTon(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount <= 0n) {
    errors.push(`TON transaction ${fieldName} must be a positive bigint or safe integer.`);
  }

  return amount;
}

function normalizeNonNegativeNanoTon(value, fieldName, errors) {
  let amount = value;
  if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    amount = BigInt(amount);
  }

  if (typeof amount !== 'bigint' || amount < 0n) {
    errors.push(`TON transaction ${fieldName} must be a non-negative bigint or safe integer.`);
  }

  return amount;
}

function normalizeOptionalLimit(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizePositiveNanoTon(value, fieldName, errors);
}

function normalizeTimestamp(value, fieldName = 'TON transaction timestamp') {
  const timestamp = String(value ?? '').trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new TonTransactionConfirmationError(`${fieldName} must be an ISO-compatible date string.`, 'invalid_timestamp');
  }

  return timestamp;
}

function normalizeLimits(input = {}) {
  const errors = [];
  const limits = {
    perTransactionLimitNanoTon: normalizeOptionalLimit(input.perTransactionLimitNanoTon, 'perTransactionLimitNanoTon', errors),
    remainingDailyLimitNanoTon: normalizeOptionalLimit(input.remainingDailyLimitNanoTon, 'remainingDailyLimitNanoTon', errors),
    highFeeNanoTon: normalizeOptionalLimit(input.highFeeNanoTon, 'highFeeNanoTon', errors)
  };

  if (errors.length > 0) {
    throw adapterError(errors, 'invalid_transaction_limits');
  }

  return limits;
}

function createRiskIndicators(review, limits) {
  const riskIndicators = [];

  if (limits.perTransactionLimitNanoTon !== null && review.amountNanoTon > limits.perTransactionLimitNanoTon) {
    riskIndicators.push({
      code: 'amount_exceeds_limit',
      severity: 'high',
      message: 'TON transaction amount exceeds the configured per-transaction limit.'
    });
  }

  if (limits.remainingDailyLimitNanoTon !== null && review.amountNanoTon > limits.remainingDailyLimitNanoTon) {
    riskIndicators.push({
      code: 'daily_limit_exceeded',
      severity: 'high',
      message: 'TON transaction amount exceeds the remaining daily limit.'
    });
  }

  if (limits.highFeeNanoTon !== null && review.networkFeeNanoTon > limits.highFeeNanoTon) {
    riskIndicators.push({
      code: 'network_fee_high',
      severity: 'medium',
      message: 'TON transaction network fee is higher than the configured review threshold.'
    });
  }

  return riskIndicators;
}

function assertApprovalBridge(approval) {
  if (!approval || typeof approval.confirm !== 'function') {
    throw new TonTransactionConfirmationError(
      'TON transaction confirmation workflow requires an approval bridge with a confirm method.',
      'invalid_approval_bridge'
    );
  }
}

function normalizeApprovalMethods(methods) {
  const availableMethods = [...new Set((methods ?? []).map((method) => String(method).trim()).filter(Boolean))];
  const unsupported = availableMethods.filter((method) => !TON_CONFIRMATION_METHODS.includes(method));

  if (availableMethods.length === 0) {
    throw new TonTransactionConfirmationError(
      'TON transaction approval requires at least one biometric or password method.',
      'missing_approval_method'
    );
  }

  if (unsupported.length > 0) {
    throw new TonTransactionConfirmationError(
      `Unsupported TON transaction approval methods: ${unsupported.join(', ')}.`,
      'unsupported_approval_method',
      unsupported
    );
  }

  return availableMethods;
}

export function validateTonTransactionReview(input = {}, limitInput = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: ['TON transaction review must be an object.'],
      review: null
    };
  }

  const limits = normalizeLimits({ ...DEFAULT_LIMITS, ...limitInput });
  const amountNanoTon = normalizePositiveNanoTon(input.amountNanoTon, 'amountNanoTon', errors);
  const networkFeeNanoTon = normalizeNonNegativeNanoTon(input.networkFeeNanoTon, 'networkFeeNanoTon', errors);
  const totalNanoTon =
    input.totalNanoTon === undefined || input.totalNanoTon === null
      ? typeof amountNanoTon === 'bigint' && typeof networkFeeNanoTon === 'bigint'
        ? amountNanoTon + networkFeeNanoTon
        : input.totalNanoTon
      : normalizePositiveNanoTon(input.totalNanoTon, 'totalNanoTon', errors);

  const review = {
    id: normalizeId(input.id, 'id', errors),
    amountNanoTon,
    recipient: normalizeId(input.recipient ?? input.to, 'recipient', errors),
    networkFeeNanoTon,
    provider: normalizeId(input.provider, 'provider', errors),
    wallet: normalizeWalletContext(input.wallet, errors),
    totalNanoTon,
    memo: input.memo === undefined || input.memo === null ? null : String(input.memo)
  };

  if (typeof review.totalNanoTon === 'bigint' && typeof review.amountNanoTon === 'bigint' && review.totalNanoTon < review.amountNanoTon) {
    errors.push('TON transaction totalNanoTon cannot be less than amountNanoTon.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      review
    };
  }

  const limitState = {
    perTransactionLimitNanoTon: limits.perTransactionLimitNanoTon,
    remainingDailyLimitNanoTon: limits.remainingDailyLimitNanoTon,
    exceedsPerTransactionLimit:
      limits.perTransactionLimitNanoTon !== null && review.amountNanoTon > limits.perTransactionLimitNanoTon,
    exceedsRemainingDailyLimit:
      limits.remainingDailyLimitNanoTon !== null && review.amountNanoTon > limits.remainingDailyLimitNanoTon
  };

  return {
    valid: true,
    errors: [],
    review: Object.freeze({
      ...review,
      riskIndicators: Object.freeze(createRiskIndicators(review, limits).map(Object.freeze)),
      limitState: Object.freeze(limitState)
    })
  };
}

function createHistoryEntry(status, review, input = {}, now) {
  if (!TON_TRANSACTION_HISTORY_STATUSES.includes(status)) {
    throw new TonTransactionConfirmationError(`Unsupported TON transaction history status: ${status}`, 'unsupported_history_status');
  }

  return Object.freeze({
    id: `${review.id}:${status}:${Date.parse(now)}`,
    status,
    transaction: clone(review),
    timestamp: normalizeTimestamp(input.timestamp ?? now),
    approval: input.approval === undefined ? null : clone(input.approval),
    signed: input.signed === true,
    requestedBy: input.requestedBy === undefined ? null : String(input.requestedBy),
    reason: input.reason === undefined ? null : String(input.reason)
  });
}

export function createTonTransactionConfirmationWorkflow(options = {}) {
  assertApprovalBridge(options.approval);

  const limits = normalizeLimits({ ...DEFAULT_LIMITS, ...(options.limits ?? {}) });
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const approval = options.approval;
  const reviews = new Map();
  const history = [];

  function recordHistory(status, review, input = {}) {
    const entry = createHistoryEntry(status, review, input, normalizeTimestamp(now()));
    history.push(entry);
    return entry;
  }

  return Object.freeze({
    createReview(input = {}) {
      const validation = validateTonTransactionReview(input, limits);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_transaction_review');
      }

      reviews.set(validation.review.id, validation.review);
      recordHistory('pending', validation.review);
      return clone(validation.review);
    },
    async approveTransaction(id, input = {}) {
      const review = reviews.get(String(id ?? '').trim());
      if (!review) {
        throw new TonTransactionConfirmationError(`Unknown TON transaction review: ${id}`, 'unknown_transaction_review');
      }

      const availableMethods = normalizeApprovalMethods(input.approvalMethods ?? input.availableMethods);
      const result = await approval.confirm({
        transaction: clone(review),
        availableMethods,
        requestedBy: input.requestedBy === undefined ? null : String(input.requestedBy),
        riskIndicators: clone(review.riskIndicators)
      });

      const approved = result?.approved === true;
      const approvalRecord = {
        method: String(result?.method ?? availableMethods[0]),
        approvedAt: normalizeTimestamp(result?.approvedAt ?? now(), 'TON transaction approval timestamp')
      };

      if (approved) {
        return recordHistory('approved', review, {
          approval: approvalRecord,
          requestedBy: input.requestedBy,
          signed: false
        });
      }

      return recordHistory('rejected', review, {
        approval: approvalRecord,
        requestedBy: input.requestedBy,
        reason: result?.reason ?? 'TON transaction approval was rejected.'
      });
    },
    markTransactionFailed(id, reason, input = {}) {
      const review = reviews.get(String(id ?? '').trim());
      if (!review) {
        throw new TonTransactionConfirmationError(`Unknown TON transaction review: ${id}`, 'unknown_transaction_review');
      }

      return recordHistory('failed', review, {
        ...input,
        reason: reason ?? 'TON transaction failed.'
      });
    },
    listHistory(filters = {}) {
      let entries = history;
      if (filters.status !== undefined) {
        const status = String(filters.status).trim();
        if (!TON_TRANSACTION_HISTORY_STATUSES.includes(status)) {
          throw new TonTransactionConfirmationError(`Unsupported TON transaction history status: ${filters.status}`, 'unsupported_history_status');
        }
        entries = entries.filter((entry) => entry.status === status);
      }

      const latestByTransaction = new Map();
      for (const entry of entries) {
        latestByTransaction.set(entry.transaction.id, entry);
      }

      return [...latestByTransaction.values()].map(clone);
    },
    getReview(id) {
      const review = reviews.get(String(id ?? '').trim());
      return review === undefined ? null : clone(review);
    }
  });
}

export function createMockTonTransactionConfirmationWorkflow(seed = {}) {
  const approvalRequests = [];
  const approvalResults = [...(seed.approvalResults ?? [{ approved: true, method: 'biometric' }])];

  const workflow = createTonTransactionConfirmationWorkflow({
    limits: seed.limits,
    now: seed.now,
    approval: {
      async confirm(request) {
        approvalRequests.push(clone(request));
        const result = approvalResults.length > 0 ? approvalResults.shift() : { approved: true, method: request.availableMethods[0] };
        return clone(result);
      }
    }
  });

  return Object.freeze({
    ...workflow,
    getApprovalRequests() {
      return approvalRequests.map(clone);
    }
  });
}
