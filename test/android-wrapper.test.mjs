import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createAgentActionNotification } from '../src/foundation/agent-action-notifications.mjs';
import {
  ANDROID_DEEP_LINK_SCHEMES,
  ANDROID_WRAPPER_STACK,
  createAndroidDebugBuildArtifact,
  createAndroidNotificationRequest,
  describeAndroidBackgroundWork,
  describeAndroidWrapper,
  routeAndroidDeepLink
} from '../src/platform/android-wrapper.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('Android wrapper selects a build stack and exposes a runnable debug artifact contract', () => {
  const wrapper = describeAndroidWrapper();
  const artifact = createAndroidDebugBuildArtifact({ buildId: 'local-debug-1' });

  assert.equal(ANDROID_WRAPPER_STACK.platform, 'android');
  assert.equal(wrapper.stack.language, 'kotlin');
  assert.equal(wrapper.stack.uiToolkit, 'jetpack-compose');
  assert.equal(wrapper.stack.buildSystem, 'gradle-android-plugin');
  assert.deepEqual(wrapper.stack.sharedIntegrations, ['tdlib', 'settings', 'agent', 'proxy', 'ton']);
  assert.equal(wrapper.debugArtifact.path, 'android/app/build/outputs/apk/debug/app-debug.apk');
  assert.deepEqual(artifact, {
    platform: 'android',
    variant: 'debug',
    format: 'apk',
    path: 'android/app/build/outputs/apk/debug/app-debug.apk',
    packageName: 'dev.teleton.client',
    entryActivity: 'dev.teleton.client.MainActivity',
    buildId: 'local-debug-1',
    installable: true,
    runnable: true
  });
});

test('Android notifications map shared events to redacted platform notification channels', () => {
  const approval = createAgentActionNotification({
    id: 'agent-approval-1',
    type: 'agent.action.approvalRequired',
    action: 'sendMessage',
    actionLabel: 'Send message',
    payload: {
      messageText: 'private message body',
      chatTitle: 'Private chat'
    },
    timestamp: '2026-04-26T12:00:00.000Z'
  });

  const request = createAndroidNotificationRequest(approval);

  assert.equal(request.channelId, 'agent_actions');
  assert.equal(request.api, 'NotificationCompat');
  assert.equal(request.permission, 'android.permission.POST_NOTIFICATIONS');
  assert.equal(request.priority, 'critical');
  assert.equal(request.visibility, 'private');
  assert.equal(request.foregroundServiceEligible, true);
  assert.equal(request.pendingIntent.route, 'agent.action.review');
  assert.doesNotMatch(JSON.stringify(request), /private message body|Private chat/);

  const muted = createAgentActionNotification({
    id: 'agent-info-1',
    type: 'agent.action.completed',
    action: 'summarizeChat',
    actionLabel: 'Summarize chat'
  });

  assert.equal(createAndroidNotificationRequest(muted, { settings: { notifications: { enabled: false } } }), null);
});

test('Android background work uses WorkManager and an app-private foreground service boundary', () => {
  const work = describeAndroidBackgroundWork();

  assert.equal(work.agentRuntime.api, 'ForegroundService');
  assert.equal(work.agentRuntime.service, 'dev.teleton.client.agent.TeletonAgentForegroundService');
  assert.equal(work.agentRuntime.exported, false);
  assert.equal(work.agentRuntime.notificationChannelId, 'agent_runtime');
  assert.deepEqual(work.agentRuntime.foregroundServiceTypes, ['dataSync']);

  assert.equal(work.messageSync.api, 'WorkManager');
  assert.equal(work.messageSync.worker, 'dev.teleton.client.sync.MessageSyncWorker');
  assert.equal(work.messageSync.expedited, true);
  assert.equal(work.messageSync.foregroundInfoRequired, true);

  assert.equal(work.tonStatusRefresh.api, 'WorkManager');
  assert.equal(work.tonStatusRefresh.constraints.networkType, 'connected');
});

test('Android deep links route Telegram and TON URIs to shared workflows', () => {
  assert.deepEqual(ANDROID_DEEP_LINK_SCHEMES, ['teleton', 'tg', 'ton', 'https']);

  assert.deepEqual(routeAndroidDeepLink('tg://resolve?domain=teleton'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'messaging.openChat',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton'
    }
  });

  assert.deepEqual(routeAndroidDeepLink('https://t.me/teleton/42'), {
    accepted: true,
    platform: 'android',
    source: 'app-link',
    workflow: 'messaging.openMessage',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton',
      messageId: '42'
    }
  });

  assert.deepEqual(routeAndroidDeepLink('ton://transfer/EQExampleAddress?amount=1000&text=coffee'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'ton.transfer.review',
    sharedModule: 'ton',
    payload: {
      recipientAddress: 'EQExampleAddress',
      amountNano: '1000',
      comment: 'coffee',
      requiresConfirmation: true
    }
  });

  assert.deepEqual(routeAndroidDeepLink('ton://dns/example.ton'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'ton.dns.resolve',
    sharedModule: 'ton',
    payload: {
      name: 'example.ton'
    }
  });

  assert.deepEqual(routeAndroidDeepLink('teleton://settings/notifications'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'settings.openSection',
    sharedModule: 'settings',
    payload: {
      section: 'notifications'
    }
  });

  assert.deepEqual(routeAndroidDeepLink('teleton://agent/action/approval-1'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'agent.action.review',
    sharedModule: 'agent',
    payload: {
      actionId: 'approval-1'
    }
  });

  assert.deepEqual(routeAndroidDeepLink('teleton://proxy/proxy-1'), {
    accepted: true,
    platform: 'android',
    source: 'deep-link',
    workflow: 'proxy.openSettings',
    sharedModule: 'proxy',
    payload: {
      proxyId: 'proxy-1'
    }
  });
});

test('Android wrapper docs cover the selected stack, approved APIs, and deep links', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');
  const androidGuide = await readFile(pathFor('docs/android-wrapper.md'), 'utf8');

  assert.match(readme, /Android wrapper contract/i);
  assert.match(architecture, /Android wrapper/i);
  assert.match(buildGuide, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/i);
  assert.match(androidGuide, /Jetpack Compose/i);
  assert.match(androidGuide, /WorkManager/i);
  assert.match(androidGuide, /ForegroundService/i);
  assert.match(androidGuide, /POST_NOTIFICATIONS/i);
  assert.match(androidGuide, /tg:\/\/resolve/i);
  assert.match(androidGuide, /ton:\/\/transfer/i);
});
