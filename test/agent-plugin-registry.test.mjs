import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_PLUGIN_LIFECYCLE_STATES,
  AGENT_PLUGIN_PERMISSION_SCOPES,
  createAgentPluginRegistry,
  createMockAgentPluginBridge,
  normalizeAgentPluginManifest
} from '../src/foundation/agent-plugin-registry.mjs';

test('agent plugin manifests require explicit permissions and compatibility', () => {
  const manifest = normalizeAgentPluginManifest({
    id: ' summarize ',
    name: 'Summarizer',
    version: '1.2.0',
    permissions: [{ scope: 'messages.read', reason: 'Summarize selected chats' }],
    compatibility: { ipcVersion: 1, minClientVersion: '0.1.0' },
    lifecycle: { startMode: 'manual', healthTimeoutMs: 2500 }
  });

  assert.equal(manifest.id, 'summarize');
  assert.deepEqual(manifest.permissions, [{ scope: 'messages.read', reason: 'Summarize selected chats' }]);
  assert.equal(manifest.lifecycle.startMode, 'manual');
  assert.equal(manifest.lifecycle.healthTimeoutMs, 2500);
  assert.deepEqual(AGENT_PLUGIN_PERMISSION_SCOPES, [
    'messages.read',
    'messages.write',
    'agent.events.receive',
    'agent.actions.perform',
    'storage.read',
    'storage.write',
    'network.access'
  ]);

  assert.throws(
    () =>
      normalizeAgentPluginManifest({
        id: 'unsafe',
        name: 'Unsafe',
        version: '1.0.0',
        permissions: [],
        compatibility: { ipcVersion: 1 }
      }),
    /declare at least one permission/
  );
  assert.throws(
    () =>
      normalizeAgentPluginManifest({
        id: 'future',
        name: 'Future',
        version: '1.0.0',
        permissions: [{ scope: 'messages.read', reason: 'Read messages' }],
        compatibility: { ipcVersion: 99 }
      }),
    /Unsupported plugin IPC version/
  );
});

test('agent plugin registry gates lifecycle, events, and actions by enabled state and permissions', async () => {
  const bridge = createMockAgentPluginBridge({
    health: {
      summarizer: { ok: true, latencyMs: 12 }
    }
  });
  const registry = createAgentPluginRegistry({ bridge });
  const registered = await registry.register({
    id: 'summarizer',
    name: 'Summarizer',
    version: '1.0.0',
    permissions: [
      { scope: 'messages.read', reason: 'Summarize selected chats' },
      { scope: 'agent.events.receive', reason: 'Receive message events' }
    ],
    compatibility: { ipcVersion: 1 }
  });

  assert.equal(registered.state, 'disabled');
  assert.deepEqual(registry.list().map((plugin) => plugin.id), ['summarizer']);
  assert.equal(registry.canReceiveEvent('summarizer', 'agent.message.received'), false);
  assert.equal(registry.canPerformAction('summarizer', 'sendMessage'), false);

  const enabled = await registry.enable('summarizer');
  assert.equal(enabled.state, 'enabled');
  assert.equal(registry.canReceiveEvent('summarizer', 'agent.message.received'), true);
  assert.equal(registry.canPerformAction('summarizer', 'sendMessage'), false);
  assert.deepEqual(bridge.calls.map((call) => call.action), ['agent.plugin.enable']);

  const health = await registry.health('summarizer');
  assert.deepEqual(health, { ok: true, latencyMs: 12 });

  const disabled = await registry.disable('summarizer');
  assert.equal(disabled.state, 'disabled');
  assert.equal(registry.canReceiveEvent('summarizer', 'agent.message.received'), false);
  assert.deepEqual(AGENT_PLUGIN_LIFECYCLE_STATES, ['registered', 'enabled', 'disabled', 'error']);
});

