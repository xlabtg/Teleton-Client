import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  PUSH_NOTIFICATION_CATEGORIES,
  createPushNotification,
  createPushNotificationDeliveryPlan,
  describePushNotificationPlatform,
  normalizePushNotificationPreferences
} from '../src/foundation/push-notifications.mjs';
import { createTeletonSettings, validateTeletonSettings } from '../src/foundation/settings-model.mjs';
import { createAndroidPushNotificationPlan } from '../src/platform/android-wrapper.mjs';
import { createDesktopPushNotificationPlan } from '../src/platform/desktop-wrapper.mjs';
import { createIosPushNotificationPlan } from '../src/platform/ios-wrapper.mjs';
import { createWebPushNotificationPlan } from '../src/platform/web-pwa-wrapper.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('push notification model redacts message and wallet content by default', () => {
  assert.deepEqual(PUSH_NOTIFICATION_CATEGORIES, ['messages', 'agentApprovals', 'wallet']);

  const message = createPushNotification({
    id: 'message-1',
    category: 'messages',
    type: 'message.received',
    title: 'Private chat',
    body: 'meet at the private address',
    timestamp: '2026-04-26T12:00:00.000Z',
    payload: {
      chatId: 'chat-1',
      chatTitle: 'Private chat',
      messageText: 'meet at the private address',
      senderName: 'Alice',
      mentioned: true
    }
  });

  assert.equal(message.title, 'Messages');
  assert.equal(message.body, 'New message');
  assert.equal(message.lockScreenBody, 'New message');
  assert.equal(message.payload.chatId, 'chat-1');
  assert.equal(message.payload.mentioned, true);
  assert.equal(message.payload.messageText, undefined);
  assert.doesNotMatch(JSON.stringify(message), /private address|Private chat|Alice/);

  const wallet = createPushNotification({
    id: 'wallet-1',
    category: 'wallet',
    type: 'ton.transaction.confirmed',
    body: 'Received 10 TON from EQSender',
    payload: {
      transactionId: 'tx-1',
      amountNano: '10000000000',
      senderAddress: 'EQSender',
      mnemonic: 'seed words'
    }
  });

  assert.equal(wallet.title, 'TON wallet');
  assert.equal(wallet.body, 'Wallet status updated');
  assert.equal(wallet.payload.transactionId, 'tx-1');
  assert.equal(wallet.payload.amountNano, undefined);
  assert.doesNotMatch(JSON.stringify(wallet), /10000000000|EQSender|seed words/);
});

test('push notification category preferences can disable individual categories', () => {
  const settings = createTeletonSettings({
    notifications: {
      enabled: true,
      categories: {
        messages: false,
        wallet: false
      }
    }
  });
  const preferences = normalizePushNotificationPreferences(settings);

  assert.equal(settings.notifications.categories.messages, false);
  assert.equal(settings.notifications.categories.agentApprovals, true);
  assert.equal(settings.notifications.categories.wallet, false);
  assert.equal(preferences.categories.messages, false);

  const invalid = validateTeletonSettings({
    notifications: {
      categories: {
        wallet: 'disabled'
      }
    }
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /Notification category wallet/);

  const message = createPushNotification({
    id: 'message-muted',
    category: 'messages',
    type: 'message.received'
  });
  const approval = createPushNotification({
    id: 'approval-1',
    category: 'agentApprovals',
    type: 'agent.action.approvalRequired',
    payload: {
      actionId: 'approval-1',
      messageText: 'private approval context'
    }
  });

  assert.equal(createPushNotificationDeliveryPlan(message, { settings }).reason, 'category-disabled');
  assert.equal(
    createPushNotificationDeliveryPlan(approval, {
      settings: {
        notifications: {
          enabled: false,
          categories: { agentApprovals: true }
        }
      }
    }).deliver,
    true
  );
  assert.equal(
    createPushNotificationDeliveryPlan(approval, {
      settings: {
        notifications: {
          enabled: true,
          categories: { agentApprovals: false }
        }
      }
    }).reason,
    'category-disabled'
  );
});

test('platform push plans report permission failures with platform-specific recovery details', () => {
  const wallet = createPushNotification({
    id: 'wallet-permission',
    category: 'wallet',
    type: 'ton.transaction.confirmed',
    payload: { transactionId: 'tx-2' }
  });

  const android = createAndroidPushNotificationPlan(wallet, { permissionStatus: 'denied' });
  assert.equal(android.deliver, false);
  assert.equal(android.reason, 'permission-denied');
  assert.equal(android.permission.name, 'android.permission.POST_NOTIFICATIONS');
  assert.equal(android.recoveryAction, 'open-platform-notification-settings');

  const ios = createIosPushNotificationPlan(wallet, { permissionStatus: 'prompt' });
  assert.equal(ios.deliver, false);
  assert.equal(ios.reason, 'permission-required');
  assert.equal(ios.permission.api, 'UNUserNotificationCenter');
  assert.equal(ios.recoveryAction, 'request-notification-permission');

  const desktop = createDesktopPushNotificationPlan(wallet, { permissionStatus: 'denied' });
  assert.equal(desktop.deliver, false);
  assert.equal(desktop.reason, 'permission-denied');
  assert.equal(desktop.permission.api, 'Electron Notification');

  const web = createWebPushNotificationPlan(wallet, { permissionStatus: 'unsupported' });
  assert.equal(web.deliver, false);
  assert.equal(web.reason, 'permission-unsupported');
  assert.equal(web.permission.api, 'Notifications API and Push API');
  assert.equal(web.fallback, 'in-app-badges-and-foreground-polling');
});

test('platform push plans map categories to Android, iOS, desktop, and web capabilities', () => {
  const approval = createPushNotification({
    id: 'approval-platform',
    category: 'agentApprovals',
    type: 'agent.action.approvalRequired',
    payload: { actionId: 'approval-platform' }
  });

  assert.equal(describePushNotificationPlatform('android').categories.agentApprovals.id, 'agent_actions');
  assert.equal(describePushNotificationPlatform('ios').categories.agentApprovals.id, 'AGENT_ACTION_REVIEW');
  assert.equal(describePushNotificationPlatform('desktop').categories.agentApprovals.id, 'agent_actions');
  assert.equal(describePushNotificationPlatform('web').categories.agentApprovals.id, 'agent-approvals');

  const android = createAndroidPushNotificationPlan(approval, { permissionStatus: 'granted' });
  const ios = createIosPushNotificationPlan(approval, { permissionStatus: 'granted' });
  const desktop = createDesktopPushNotificationPlan(approval, { permissionStatus: 'granted' });
  const web = createWebPushNotificationPlan(approval, { permissionStatus: 'granted' });

  assert.equal(android.deliver, true);
  assert.equal(android.request.channelId, 'agent_actions');
  assert.equal(ios.request.categoryIdentifier, 'AGENT_ACTION_REVIEW');
  assert.equal(desktop.request.categoryId, 'agent_actions');
  assert.equal(web.request.api, 'ServiceWorkerRegistration.showNotification');
  assert.equal(web.request.data.route, 'agent.action.review');
});

test('push notification docs cover category controls and permission fallbacks', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const androidGuide = await readFile(pathFor('docs/android-wrapper.md'), 'utf8');
  const iosGuide = await readFile(pathFor('docs/ios-wrapper.md'), 'utf8');
  const desktopGuide = await readFile(pathFor('docs/desktop-wrapper.md'), 'utf8');
  const webGuide = await readFile(pathFor('docs/web-pwa-wrapper.md'), 'utf8');

  assert.match(readme, /push notification model/i);
  assert.match(architecture, /Cross-Platform Push Notifications/i);
  assert.match(androidGuide, /category preferences/i);
  assert.match(iosGuide, /permission/i);
  assert.match(desktopGuide, /system notification/i);
  assert.match(webGuide, /permission fallback/i);
});
