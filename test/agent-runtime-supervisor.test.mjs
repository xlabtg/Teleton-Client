import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_RUNTIME_PLATFORMS,
  AGENT_RUNTIME_STATES,
  createAgentRuntimeSupervisor,
  createMockAgentRuntimeAdapter,
  describeAgentRuntimeSupport
} from '../src/foundation/agent-runtime-supervisor.mjs';

test('agent runtime support documents every platform wrapper without cloud credentials', () => {
  assert.deepEqual(AGENT_RUNTIME_PLATFORMS, ['android', 'ios', 'desktop', 'web']);

  for (const platform of AGENT_RUNTIME_PLATFORMS) {
    const support = describeAgentRuntimeSupport(platform);

    assert.equal(support.platform, platform);
    assert.equal(typeof support.localRuntime, 'string');
    assert.equal(support.requiresCloudCredentialsByDefault, false);
    assert.ok(support.packagingGaps.length >= 1, `${platform} should document packaging gaps`);
  }

  assert.throws(() => describeAgentRuntimeSupport('watch'), /Unsupported agent runtime platform/);
});

test('mock agent runtime supervisor starts, reports health, logs, and stops cleanly', async () => {
  const logEvents = [];
  const adapter = createMockAgentRuntimeAdapter({
    health: { ok: true, pid: 4242, ipcEndpoint: 'pipe:teleton-agent' },
    logs: ['booted', 'ready']
  });
  const supervisor = createAgentRuntimeSupervisor({
    platform: 'desktop',
    adapter,
    onLog: (entry) => logEvents.push(entry)
  });

  assert.equal(supervisor.status().state, 'stopped');

  const started = await supervisor.start();
  assert.equal(started.state, 'running');
  assert.equal(started.platform, 'desktop');
  assert.equal(started.requiresCloudCredentials, false);
  assert.deepEqual(adapter.calls, ['start', 'health']);

  const status = supervisor.status();
  assert.equal(status.state, 'running');
  assert.equal(status.health.ok, true);
  assert.equal(status.health.pid, 4242);

  const health = await supervisor.health();
  assert.equal(health.ok, true);
  assert.deepEqual(adapter.calls, ['start', 'health', 'health']);

  assert.deepEqual(logEvents.map((entry) => entry.message), ['booted', 'ready']);

  const stopped = await supervisor.stop();
  assert.equal(stopped.state, 'stopped');
  assert.deepEqual(adapter.calls, ['start', 'health', 'health', 'stop']);
});

test('agent runtime supervisor handles idempotent lifecycle transitions and failures', async () => {
  const adapter = createMockAgentRuntimeAdapter({
    startResult: { pid: 7 },
    stopResult: { code: 0 }
  });
  const supervisor = createAgentRuntimeSupervisor({ platform: 'web', adapter });

  await supervisor.start();
  await supervisor.start();
  assert.deepEqual(adapter.calls, ['start', 'health']);

  await supervisor.stop();
  await supervisor.stop();
  assert.deepEqual(adapter.calls, ['start', 'health', 'stop']);

  const failingSupervisor = createAgentRuntimeSupervisor({
    platform: 'desktop',
    adapter: createMockAgentRuntimeAdapter({ startError: new Error('binary missing') })
  });

  await assert.rejects(() => failingSupervisor.start(), /binary missing/);
  assert.equal(failingSupervisor.status().state, 'error');
  assert.match(failingSupervisor.status().error.message, /binary missing/);
  assert.deepEqual(AGENT_RUNTIME_STATES, ['stopped', 'starting', 'running', 'stopping', 'error']);
});
