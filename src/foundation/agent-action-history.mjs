export const AGENT_ACTION_HISTORY_RETENTION_DAYS = 30;

export const AGENT_ACTION_STATUSES = Object.freeze(['proposed', 'started', 'completed', 'failed', 'cancelled', 'rolledBack']);
export const AGENT_ACTION_ACTOR_TYPES = Object.freeze(['agent', 'user', 'plugin', 'system']);
export const AGENT_ACTION_ROLLBACK_TYPES = Object.freeze(['none', 'direct', 'compensating-action']);

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const PRIVATE_PAYLOAD_FIELDS = new Set([
  'message',
  'messageText',
  'text',
  'content',
  'body',
  'chatTitle',
  'chatName',
  'senderName',
  'recipientName',
  'prompt',
  'context'
]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value;
  }

  Object.freeze(value);

  for (const fieldValue of Object.values(value)) {
    deepFreeze(fieldValue);
  }

  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '').trim();

  if (!id) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return id;
}

function normalizeOptionalLabel(value, fallback) {
  const label = String(value ?? '').trim();
  return label || fallback;
}

function normalizeTimestamp(value, fieldName = 'Agent action history timestamp') {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = String(value).trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${fieldName} must be an ISO-compatible date string.`);
  }

  return timestamp;
}

function normalizeOptionalTimestamp(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizeTimestamp(value, fieldName);
}

function normalizeStatus(value) {
  const status = String(value ?? 'proposed').trim();

  if (!AGENT_ACTION_STATUSES.includes(status)) {
    throw new Error(`Unsupported agent action status: ${value}`);
  }

  return status;
}

function normalizeActor(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Agent action actor must be an object.');
  }

  const type = String(input.type ?? 'agent').trim();
  if (!AGENT_ACTION_ACTOR_TYPES.includes(type)) {
    throw new Error(`Unsupported agent action actor type: ${input.type}`);
  }

  return Object.freeze({
    id: normalizeId(input.id ?? type, 'Agent action actor id'),
    type,
    displayName: input.displayName === undefined ? null : normalizeId(input.displayName, 'Agent action actor displayName')
  });
}

function redactPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const redacted = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (PRIVATE_PAYLOAD_FIELDS.has(key)) {
      continue;
    }

    if (isPlainObject(fieldValue)) {
      redacted[key] = redactPayload(fieldValue);
    } else if (Array.isArray(fieldValue)) {
      redacted[key] = fieldValue.map((item) => (isPlainObject(item) ? redactPayload(item) : item));
    } else {
      redacted[key] = fieldValue;
    }
  }

  return redacted;
}

function rollbackExpired(expiresAt, now) {
  return expiresAt !== null && Date.parse(expiresAt) <= Date.parse(now);
}

export function createRollbackMetadata(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Agent action rollback metadata must be an object.');
  }

  const now = normalizeTimestamp(options.now ?? new Date().toISOString());
  const type = String(input.type ?? (input.action ? 'compensating-action' : 'none')).trim();

  if (!AGENT_ACTION_ROLLBACK_TYPES.includes(type)) {
    throw new Error(`Unsupported agent action rollback type: ${input.type}`);
  }

  const expiresAt = normalizeOptionalTimestamp(input.expiresAt, 'Agent action rollback expiresAt');
  const action = input.action === undefined || input.action === null ? null : normalizeId(input.action, 'Agent action rollback action');
  const baseEligible = type !== 'none' && action !== null;
  const expired = rollbackExpired(expiresAt, now);
  const explicitReason = input.reason === undefined ? null : normalizeId(input.reason, 'Agent action rollback reason');
  const reason = explicitReason ?? (baseEligible && expired ? 'Rollback window expired.' : null);

  return Object.freeze({
    type,
    eligible: baseEligible && !expired,
    action,
    actionLabel: action === null ? null : normalizeOptionalLabel(input.actionLabel, action),
    expiresAt,
    reason,
    payload: deepFreeze(redactPayload(input.payload))
  });
}

function rollbackFromAction(input, now) {
  if (isPlainObject(input.rollback)) {
    return createRollbackMetadata(input.rollback, { now });
  }

  if (input.reversibility === 'irreversible') {
    return createRollbackMetadata(
      {
        type: 'none',
        reason: input.irreversibleReason ?? 'Action cannot be rolled back.'
      },
      { now }
    );
  }

  return createRollbackMetadata({ type: 'none' }, { now });
}

export function createAgentActionRecord(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Agent action history record must be an object.');
  }

  const now = normalizeTimestamp(options.now ?? input.timestamp ?? new Date().toISOString());
  const id = normalizeId(input.id, 'Agent action history record id');
  const action = normalizeId(input.action, 'Agent action history action');
  const status = normalizeStatus(input.status);
  const rollback = rollbackFromAction(input, now);
  const requiresIrreversibleConfirmation = status === 'proposed' && rollback.eligible === false && rollback.reason !== null;

  return Object.freeze({
    id,
    action,
    actionLabel: normalizeOptionalLabel(input.actionLabel, action),
    status,
    actor: normalizeActor(input.actor),
    timestamp: normalizeTimestamp(input.timestamp ?? now),
    startedAt: normalizeOptionalTimestamp(input.startedAt, 'Agent action startedAt'),
    completedAt: normalizeOptionalTimestamp(input.completedAt, 'Agent action completedAt'),
    payload: deepFreeze(redactPayload(input.payload)),
    rollback,
    requiresIrreversibleConfirmation,
    warning: requiresIrreversibleConfirmation ? `${normalizeOptionalLabel(input.actionLabel, action)} cannot be rolled back.` : null
  });
}

function recordFromEvent(event, now) {
  if (!isPlainObject(event) || event.kind !== 'event') {
    throw new Error('Agent action history preview requires an IPC event envelope.');
  }

  return createAgentActionRecord(
    {
      id: event.id,
      action: event.payload?.action,
      actionLabel: event.payload?.actionLabel,
      actor: { id: event.source, type: event.source === 'agent' ? 'agent' : 'system' },
      status: event.eventType === 'agent.action.started' ? 'started' : 'proposed',
      timestamp: event.timestamp,
      payload: event.payload,
      rollback: event.payload?.rollback,
      reversibility: event.payload?.reversibility,
      irreversibleReason: event.payload?.irreversibleReason
    },
    { now }
  );
}

function retentionCutoff(now, retentionDays) {
  return Date.parse(now) - retentionDays * MILLIS_PER_DAY;
}

export function createAgentActionHistoryStore(options = {}) {
  const retentionDays = Number.isInteger(options.retentionDays)
    ? options.retentionDays
    : AGENT_ACTION_HISTORY_RETENTION_DAYS;

  if (retentionDays < 1) {
    throw new Error('Agent action history retentionDays must be a positive integer.');
  }

  const now = () => normalizeTimestamp(options.now?.() ?? new Date().toISOString());
  const records = new Map();

  function pruneExpired() {
    const cutoff = retentionCutoff(now(), retentionDays);

    for (const [id, record] of records) {
      if (Date.parse(record.timestamp) < cutoff) {
        records.delete(id);
      }
    }
  }

  function cloneRecord(record) {
    return deepFreeze(clone(record));
  }

  return Object.freeze({
    recordAction(input) {
      pruneExpired();
      const record = createAgentActionRecord(input, { now: now() });
      records.set(record.id, record);
      pruneExpired();
      return cloneRecord(record);
    },
    previewAction(event) {
      return recordFromEvent(event, now());
    },
    listRecords(filters = {}) {
      pruneExpired();
      let values = Array.from(records.values()).sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

      if (filters.status !== undefined) {
        const status = normalizeStatus(filters.status);
        values = values.filter((record) => record.status === status);
      }

      if (filters.actorId !== undefined) {
        const actorId = normalizeId(filters.actorId, 'Agent action history actor filter');
        values = values.filter((record) => record.actor.id === actorId);
      }

      if (filters.rollbackEligible === true) {
        values = values.filter((record) => record.rollback.eligible === true);
      }

      return values.map(cloneRecord);
    },
    createRollbackRequest(recordId, payload = {}) {
      pruneExpired();
      const id = normalizeId(recordId, 'Agent action rollback record id');
      const record = records.get(id);

      if (!record) {
        throw new Error(`Unknown agent action history record: ${id}`);
      }

      if (!record.rollback.eligible || !record.rollback.action) {
        throw new Error(`Agent action history record ${id} is not rollback eligible.`);
      }

      return Object.freeze({
        action: record.rollback.action,
        actionLabel: record.rollback.actionLabel,
        payload: deepFreeze({
          ...clone(record.rollback.payload),
          ...redactPayload(payload),
          rollbackOf: record.id
        })
      });
    },
    retentionDays() {
      return retentionDays;
    }
  });
}
