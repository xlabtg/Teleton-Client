import type { AgentStatus, TonBalance, TonTransactionDraft } from '../shared/types';

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: TParams;
}

interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: TResult;
}

interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcFailure;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export interface AgentEnableParams {
  session: string;
  userId?: string | number;
}

export interface AgentManagementOptions {
  baseUrl: string;
  apiKey?: string;
}

const DEFAULT_RPC_TIMEOUT_MS = 10_000;

function randomId() {
  if ('crypto' in globalThis && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `rpc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function problemMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const detail = 'detail' in payload ? String(payload.detail) : '';
    const title = 'title' in payload ? String(payload.title) : '';
    return detail || title || fallback;
  }

  return fallback;
}

export function createJsonRpcRequest<TParams>(method: string, params?: TParams, id = randomId()): JsonRpcRequest<TParams> {
  return params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params };
}

export function parseJsonRpcResponse<TResult = unknown>(payload: string): JsonRpcResponse<TResult> {
  const parsed = JSON.parse(payload) as JsonRpcResponse<TResult>;

  if (!parsed || parsed.jsonrpc !== '2.0' || typeof parsed.id !== 'string') {
    throw new Error('Invalid JSON-RPC 2.0 response.');
  }

  return parsed;
}

export class TeletonAgentService {
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(url: string) {
    this.disconnect();

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener(
        'error',
        () => {
          reject(new Error('Unable to connect to Teleton Agent WebSocket.'));
        },
        { once: true }
      );
      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => this.rejectPending('Teleton Agent WebSocket closed.'));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.rejectPending('Teleton Agent WebSocket disconnected.');
  }

  enable(params: AgentEnableParams) {
    return this.call<{ success: boolean }>('agent.enable', params);
  }

  disable() {
    return this.call<{ success: boolean }>('agent.disable');
  }

  getTonBalance(address: string) {
    return this.call<TonBalance>('ton.getBalance', { address });
  }

  sendTx(draft: TonTransactionDraft) {
    return this.call<{ txHash: string }>('ton.sendTx', draft);
  }

  private call<TResult>(method: string, params?: unknown, timeoutMs = DEFAULT_RPC_TIMEOUT_MS) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Teleton Agent is not connected.'));
    }

    const request = createJsonRpcRequest(method, params);

    return new Promise<TResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve: (value) => resolve(value as TResult),
        reject,
        timer
      });

      this.socket?.send(JSON.stringify(request));
    });
  }

  private handleMessage(data: unknown) {
    if (typeof data !== 'string') {
      return;
    }

    let response: JsonRpcResponse;

    try {
      response = parseJsonRpcResponse(data);
    } catch {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) return;

    window.clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if ('error' in response) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result);
  }

  private rejectPending(message: string) {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer);
      request.reject(new Error(message));
    }

    this.pending.clear();
  }
}

export async function getManagementAgentStatus(options: AgentManagementOptions): Promise<AgentStatus> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/v1/agent/status`, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    throw new Error(problemMessage(body, `Management API returned ${response.status}.`));
  }

  const payload = (await response.json()) as { state?: AgentStatus['lifecycle']; uptime?: number; error?: string | null };
  return {
    connection: 'connected',
    lifecycle: payload.state,
    uptime: payload.uptime,
    error: payload.error ?? undefined
  };
}

export async function validateManagementApi(options: AgentManagementOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/v1/auth/validate`, {
    method: 'POST',
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined
  });

  if (!response.ok) {
    return { valid: false, message: `Management API returned ${response.status}.` };
  }

  const payload = (await response.json()) as { valid?: boolean; keyPrefix?: string };
  return {
    valid: payload.valid === true,
    keyPrefix: payload.keyPrefix
  };
}
