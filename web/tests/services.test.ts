import { describe, expect, it } from 'vitest';

import { createJsonRpcRequest, parseJsonRpcResponse } from '../src/services/agent.service';
import { defaultProxySettings, serializeProxyForDiagnostics, validateProxySettings } from '../src/services/proxy.service';

describe('proxy settings', () => {
  it('normalizes a disabled proxy to a direct route', () => {
    const result = validateProxySettings({
      ...defaultProxySettings(),
      enabled: false,
      type: 'socks5',
      host: 'proxy.local',
      port: 1080
    });

    expect(result.valid).toBe(true);
    expect(result.normalized).toEqual(defaultProxySettings());
  });

  it('requires a secure reference for MTProto secrets', () => {
    const invalid = validateProxySettings({
      enabled: true,
      type: 'mtproto',
      host: 'proxy.teleton.local',
      port: 443,
      secret: 'plaintext-secret'
    });
    const valid = validateProxySettings({
      enabled: true,
      type: 'mtproto',
      host: 'proxy.teleton.local',
      port: 443,
      secret: 'env:TELETON_MTPROTO_SECRET'
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/secure reference/i);
    expect(valid.valid).toBe(true);
  });

  it('redacts proxy credential presence in diagnostics', () => {
    expect(
      serializeProxyForDiagnostics({
        enabled: true,
        type: 'socks5',
        host: '127.0.0.1',
        port: 9050,
        username: 'user',
        password: 'secret'
      })
    ).toEqual({
      enabled: true,
      type: 'socks5',
      host: '127.0.0.1',
      port: 9050,
      hasUsername: true,
      hasPassword: true,
      hasSecret: false
    });
  });
});

describe('agent JSON-RPC helpers', () => {
  it('builds the WebSocket JSON-RPC methods required by the client contract', () => {
    expect(createJsonRpcRequest('agent.enable', { session: 'runtime-session' }, '1')).toEqual({
      jsonrpc: '2.0',
      id: '1',
      method: 'agent.enable',
      params: { session: 'runtime-session' }
    });
    expect(createJsonRpcRequest('ton.getBalance', { address: 'EQ...' }, '2').method).toBe('ton.getBalance');
    expect(createJsonRpcRequest('ton.sendTx', { to: 'EQ...', amount: '1' }, '3').method).toBe('ton.sendTx');
  });

  it('parses valid JSON-RPC responses and rejects malformed payloads', () => {
    expect(parseJsonRpcResponse('{"jsonrpc":"2.0","id":"1","result":{"success":true}}')).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { success: true }
    });
    expect(() => parseJsonRpcResponse('{"id":"1"}')).toThrow(/Invalid JSON-RPC/);
  });
});
