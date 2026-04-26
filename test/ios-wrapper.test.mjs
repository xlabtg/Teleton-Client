import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createAgentActionNotification } from '../src/foundation/agent-action-notifications.mjs';
import {
  IOS_DEEP_LINK_SCHEMES,
  IOS_WRAPPER_STACK,
  createIosDebugBuildArtifact,
  createIosKeychainReference,
  createIosPushNotificationRequest,
  describeIosBackgroundTasks,
  describeIosComplianceNotes,
  describeIosGestures,
  describeIosKeychainStorage,
  describeIosWrapper,
  routeIosDeepLink
} from '../src/platform/ios-wrapper.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('iOS wrapper selects a SwiftUI stack and exposes a runnable debug artifact contract', () => {
  const wrapper = describeIosWrapper();
  const artifact = createIosDebugBuildArtifact({ buildId: 'local-debug-1' });

  assert.equal(IOS_WRAPPER_STACK.platform, 'ios');
  assert.equal(wrapper.stack.language, 'swift');
  assert.equal(wrapper.stack.uiToolkit, 'swiftui');
  assert.equal(wrapper.stack.buildSystem, 'xcodebuild');
  assert.deepEqual(wrapper.stack.sharedIntegrations, ['tdlib', 'settings', 'agent', 'proxy', 'ton']);
  assert.equal(wrapper.debugArtifact.path, 'ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app');
  assert.deepEqual(artifact, {
    platform: 'ios',
    variant: 'debug',
    format: 'app-bundle',
    sdk: 'iphonesimulator',
    path: 'ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app',
    bundleIdentifier: 'dev.teleton.client',
    appTarget: 'TeletonClient',
    scheme: 'TeletonClient',
    entryPoint: 'TeletonClientApp',
    buildId: 'local-debug-1',
    installable: true,
    runnable: true
  });
});

test('iOS wrapper maps secrets to Keychain-backed references', () => {
  const storage = describeIosKeychainStorage();
  const walletRef = createIosKeychainReference('ton.wallet', { account: 'primary-wallet' });

  assert.equal(storage.api, 'Keychain Services');
  assert.equal(storage.accessGroup, 'dev.teleton.client');
  assert.equal(storage.synchronizable, false);
  assert.equal(storage.items.agentMemoryKey.secureRef, 'keychain:dev.teleton.client.agent.memory-key.application');
  assert.equal(storage.items.tdlibCredentials.accessibility, 'kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly');
  assert.equal(storage.items.tonWallet.requiresUserPresence, true);
  assert.throws(
    () => createIosKeychainReference('tdlib.credentials', { secret: 'raw-api-hash' }),
    /must not receive raw secret material/
  );
  assert.deepEqual(walletRef, {
    platform: 'ios',
    api: 'Keychain Services',
    storageClass: 'generic-password',
    accessGroup: 'dev.teleton.client',
    service: 'dev.teleton.client.ton.wallet',
    account: 'primary-wallet',
    secureRef: 'keychain:dev.teleton.client.ton.wallet.primary-wallet',
    accessibility: 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly',
    synchronizable: false,
    accessControl: ['biometryCurrentSet', 'userPresence'],
    exportable: false,
    requiresUserPresence: true
  });
});

test('iOS push notifications map shared events to redacted APNs requests', () => {
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

  const request = createIosPushNotificationRequest(approval);

  assert.equal(request.platform, 'ios');
  assert.equal(request.api, 'UNUserNotificationCenter');
  assert.equal(request.transport, 'APNs');
  assert.equal(request.categoryIdentifier, 'AGENT_ACTION_REVIEW');
  assert.equal(request.apns.pushType, 'alert');
  assert.equal(request.apns.topic, 'dev.teleton.client');
  assert.equal(request.content.interruptionLevel, 'time-sensitive');
  assert.equal(request.content.threadIdentifier, 'agent-actions');
  assert.equal(request.userInfo.route, 'agent.action.review');
  assert.doesNotMatch(JSON.stringify(request), /private message body|Private chat/);

  const messageRequest = createIosPushNotificationRequest({
    id: 'message-1',
    type: 'message.received',
    title: 'Private chat',
    body: 'private message body',
    lockScreenBody: 'New message',
    payload: {
      messageText: 'private message body',
      chatTitle: 'Private chat'
    }
  });

  assert.equal(messageRequest.categoryIdentifier, 'MESSAGES');
  assert.equal(messageRequest.content.title, 'Messages');
  assert.equal(messageRequest.content.body, 'New message');
  assert.doesNotMatch(JSON.stringify(messageRequest), /private message body|Private chat/);

  const muted = createAgentActionNotification({
    id: 'agent-info-1',
    type: 'agent.action.completed',
    action: 'summarizeChat',
    actionLabel: 'Summarize chat'
  });

  assert.equal(createIosPushNotificationRequest(muted, { settings: { notifications: { enabled: false } } }), null);
});

test('iOS background tasks use BGTaskScheduler with suspension-safe boundaries', () => {
  const tasks = describeIosBackgroundTasks();

  assert.equal(tasks.agentRuntime.api, 'BGProcessingTask');
  assert.equal(tasks.agentRuntime.identifier, 'dev.teleton.client.agent.runtime');
  assert.equal(tasks.agentRuntime.backgroundMode, 'processing');
  assert.equal(tasks.agentRuntime.launchesOnlyWhenAllowedBySystem, true);
  assert.equal(tasks.agentRuntime.suspensionFallback, 'pause-local-agent-and-request-user-resume');

  assert.equal(tasks.messageSync.api, 'BGAppRefreshTask');
  assert.equal(tasks.messageSync.backgroundMode, 'remote-notification');
  assert.equal(tasks.messageSync.requiresNetworkConnectivity, true);

  assert.equal(tasks.tonStatusRefresh.api, 'BGAppRefreshTask');
  assert.equal(tasks.tonStatusRefresh.requiresNetworkConnectivity, true);
  assert.equal(tasks.tonStatusRefresh.requiresUserInitiatedRefresh, false);
});

test('iOS gestures map shared actions to SwiftUI gesture metadata', () => {
  const gestures = describeIosGestures();
  const disabled = describeIosGestures({ riskyActionBindingsEnabled: false });

  assert.equal(gestures.api, 'SwiftUI Gesture');
  assert.equal(gestures.gestures.find((gesture) => gesture.actionId === 'messaging.search').gesture, 'pull-down');
  assert.equal(gestures.gestures.find((gesture) => gesture.actionId === 'agent.quickAction').requiresUserConfirmation, true);
  assert.equal(gestures.gestures.find((gesture) => gesture.actionId === 'wallet.transferReview').route, 'ton.transfer.review');
  assert.equal(gestures.collisionReport.conflictCount, 0);
  assert.match(gestures.accessibility.alternativeControls, /visible controls/i);
  assert.equal(disabled.gestures.some((gesture) => gesture.actionId === 'agent.quickAction'), false);
  assert.equal(disabled.disabled.find((gesture) => gesture.actionId === 'wallet.transferReview').reason, 'risky-action-bindings-disabled');
});

test('iOS deep links route Telegram and TON URIs to shared workflows', () => {
  assert.deepEqual(IOS_DEEP_LINK_SCHEMES, ['teleton', 'tg', 'ton', 'https']);

  assert.deepEqual(routeIosDeepLink('tg://resolve?domain=teleton'), {
    accepted: true,
    platform: 'ios',
    source: 'url-scheme',
    workflow: 'messaging.openChat',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton'
    }
  });

  assert.deepEqual(routeIosDeepLink('https://t.me/teleton/42'), {
    accepted: true,
    platform: 'ios',
    source: 'universal-link',
    workflow: 'messaging.openMessage',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton',
      messageId: '42'
    }
  });

  assert.deepEqual(routeIosDeepLink('ton://transfer/EQExampleAddress?amount=1000&text=coffee'), {
    accepted: true,
    platform: 'ios',
    source: 'url-scheme',
    workflow: 'ton.transfer.review',
    sharedModule: 'ton',
    payload: {
      recipientAddress: 'EQExampleAddress',
      amountNano: '1000',
      comment: 'coffee',
      requiresConfirmation: true
    }
  });

  assert.deepEqual(routeIosDeepLink('teleton://settings/notifications'), {
    accepted: true,
    platform: 'ios',
    source: 'url-scheme',
    workflow: 'settings.openSection',
    sharedModule: 'settings',
    payload: {
      section: 'notifications'
    }
  });

  assert.deepEqual(routeIosDeepLink('teleton://agent/action/approval-1'), {
    accepted: true,
    platform: 'ios',
    source: 'url-scheme',
    workflow: 'agent.action.review',
    sharedModule: 'agent',
    payload: {
      actionId: 'approval-1'
    }
  });
});

test('iOS compliance notes cover messaging, AI automation, and wallet review constraints', () => {
  const compliance = describeIosComplianceNotes();

  assert.equal(compliance.requiresHumanReview, true);
  assert.match(compliance.appStoreReview.messages, /user-controlled messaging/i);
  assert.match(compliance.appStoreReview.agentAutomation, /explicit user confirmation/i);
  assert.match(compliance.appStoreReview.wallet, /no raw private keys/i);
  assert.match(compliance.appStoreReview.backgroundExecution, /system-managed background execution/i);
});

test('iOS wrapper docs cover the selected stack, approved APIs, and App Store constraints', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');
  const iosGuide = await readFile(pathFor('docs/ios-wrapper.md'), 'utf8');

  assert.match(readme, /iOS wrapper contract/i);
  assert.match(architecture, /iOS wrapper/i);
  assert.match(buildGuide, /ios\/build\/Build\/Products\/Debug-iphonesimulator\/TeletonClient\.app/i);
  assert.match(iosGuide, /SwiftUI/i);
  assert.match(iosGuide, /APNs/i);
  assert.match(iosGuide, /Keychain Services/i);
  assert.match(iosGuide, /BGTaskScheduler/i);
  assert.match(iosGuide, /Gestures/i);
  assert.match(iosGuide, /visible controls/i);
  assert.match(iosGuide, /App Store review/i);
  assert.match(iosGuide, /AI automation/i);
  assert.match(iosGuide, /crypto/i);
});
