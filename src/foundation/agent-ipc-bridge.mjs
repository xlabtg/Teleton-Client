export const AGENT_IPC_VERSION = 1;

export const AGENT_IPC_KINDS = Object.freeze(['request', 'event', 'response', 'error', 'cancel']);
export const AGENT_IPC_EVENT_TYPES = Object.freeze([
  'agent.info',
  'agent.message.received',
  'agent.action.proposed',
  'agent.task.updated'
]);

const CONFIRMATION_REQUIRED_TYPES = new Set(['agent.action.proposed']);

function clone(value) {
  return structuredClone(value);
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

function normalizeTimestamp(value) {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = String(value).trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('IPC envelope timestamp must be an ISO-compatible date string.');
  }

  return timestamp;
}

function normalizePayload(value) {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error('IPC envelope payload must be an object.');
  }

  return clone(value);
}

function normalizeKind(value) {
  const kind = String(value ?? '').trim();

  if (!AGENT_IPC_KINDS.includes(kind)) {
    throw new Error(`Unsupported IPC envelope kind: ${value}`);
  }

  return kind;
}

function normalizeEventType(value) {
  const type = String(value ?? '').trim();

  if (!AGENT_IPC_EVENT_TYPES.includes(type)) {
    throw new Error(`Unsupported IPC event type: ${value}`);
  }

  return type;
}

function validateKindSpecificShape(envelope) {
  if (envelope.kind === 'request' && !envelope.action) {
    throw new Error('IPC request envelopes require an action.');
  }

  if (envelope.kind === 'event') {
    envelope.eventType = normalizeEventType(envelope.eventType);
    envelope.requiresConfirmation = CONFIRMATION_REQUIRED_TYPES.has(envelope.eventType);
  }

  if (envelope.kind === 'response' && !envelope.replyTo) {
    throw new Error('IPC response envelopes require replyTo.');
  }

  if (envelope.kind === 'error') {
    if (!envelope.replyTo) {
      throw new Error('IPC error envelopes require replyTo.');
    }

    if (!isPlainObject(envelope.error) || !envelope.error.message) {
      throw new Error('IPC error envelopes require an error message.');
    }
  }

  if (envelope.kind === 'cancel' && !envelope.cancelId) {
    throw new Error('IPC cancel envelopes require cancelId.');
  }
}

export function createAgentIpcEnvelope(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('IPC envelope must be an object.');
  }

  const version = input.version ?? AGENT_IPC_VERSION;
  if (version !== AGENT_IPC_VERSION) {
    throw new Error(`Unsupported IPC envelope version: ${version}`);
  }

  const envelope = {
    version,
    id: normalizeId(input.id, 'IPC envelope id'),
    kind: normalizeKind(input.kind),
    source: normalizeId(input.source, 'IPC envelope source'),
    target: normalizeId(input.target, 'IPC envelope target'),
    timestamp: normalizeTimestamp(input.timestamp),
    payload: normalizePayload(input.payload)
  };

  if (input.action !== undefined) {
    envelope.action = normalizeId(input.action, 'IPC request action');
  }

  if (input.eventType !== undefined) {
    envelope.eventType = input.eventType;
  }

  if (input.replyTo !== undefined) {
    envelope.replyTo = normalizeId(input.replyTo, 'IPC replyTo');
  }

  if (input.cancelId !== undefined) {
    envelope.cancelId = normalizeId(input.cancelId, 'IPC cancelId');
  }

  if (input.error !== undefined) {
    if (!isPlainObject(input.error)) {
      throw new Error('IPC envelope error must be an object.');
    }

    envelope.error = {
      code: String(input.error.code ?? 'agent.ipc.error'),
      message: normalizeId(input.error.message, 'IPC error message')
    };
  }

  validateKindSpecificShape(envelope);

  return Object.freeze(envelope);
}

export function parseAgentIpcEnvelope(message) {
  if (typeof message === 'string') {
    try {
      return createAgentIpcEnvelope(JSON.parse(message));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Malformed IPC message JSON: ${error.message}`);
      }

      throw error;
    }
  }

  return createAgentIpcEnvelope(message);
}

export function createAgentIpcBridge({ localId = 'ui', remoteId = 'agent', transport, onEvent, onRequest, onError } = {}) {
  if (!transport || typeof transport.send !== 'function' || typeof transport.subscribe !== 'function') {
    throw new Error('Agent IPC bridge requires a transport with send and subscribe hooks.');
  }

  const pending = new Map();
  let sequence = 0;

  function nextId(prefix) {
    sequence += 1;
    return `${localId}.${prefix}.${sequence}`;
  }

  async function send(envelope) {
    await transport.send(clone(envelope));
    return envelope;
  }

  function receive(rawMessage) {
    let envelope;

    try {
      envelope = parseAgentIpcEnvelope(rawMessage);
    } catch (error) {
      onError?.(error);
      throw error;
    }

    if (envelope.kind === 'event') {
      onEvent?.(envelope);
      return envelope;
    }

    if (envelope.kind === 'request') {
      onRequest?.(envelope);
      return envelope;
    }

    if (envelope.kind === 'response' || envelope.kind === 'error') {
      const pendingRequest = pending.get(envelope.replyTo);
      if (pendingRequest) {
        pending.delete(envelope.replyTo);
        if (envelope.kind === 'error') {
          pendingRequest.reject(new Error(envelope.error.message));
        } else {
          pendingRequest.resolve(envelope);
        }
      }
    }

    return envelope;
  }

  const unsubscribe = transport.subscribe(receive);

  return {
    request(action, payload = {}) {
      const envelope = createAgentIpcEnvelope({
        id: nextId('request'),
        kind: 'request',
        source: localId,
        target: remoteId,
        action,
        payload
      });

      const response = new Promise((resolve, reject) => {
        pending.set(envelope.id, { resolve, reject });
      });

      return send(envelope).then(() => response);
    },
    emitEvent(eventType, payload = {}) {
      return send(
        createAgentIpcEnvelope({
          id: nextId('event'),
          kind: 'event',
          source: localId,
          target: remoteId,
          eventType,
          payload
        })
      );
    },
    cancel(cancelId, payload = {}) {
      pending.delete(cancelId);

      return send(
        createAgentIpcEnvelope({
          id: nextId('cancel'),
          kind: 'cancel',
          source: localId,
          target: remoteId,
          cancelId,
          payload
        })
      );
    },
    receive,
    close() {
      pending.clear();
      unsubscribe?.();
    },
    pendingRequestIds() {
      return Array.from(pending.keys());
    }
  };
}

export function createMockAgentIpcTransport() {
  const subscribers = new Set();
  const sent = [];

  return {
    sent,
    async send(message) {
      sent.push(clone(message));
    },
    subscribe(handler) {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    deliver(message) {
      for (const handler of subscribers) {
        handler(message);
      }
    }
  };
}
