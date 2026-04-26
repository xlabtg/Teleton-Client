import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createAgentActionNotification } from '../src/foundation/agent-action-notifications.mjs';
import {
  DESKTOP_DEEP_LINK_SCHEMES,
  DESKTOP_WRAPPER_STACK,
  createDesktopAutostartConfig,
  createDesktopDebugBuildArtifact,
  createDesktopNotificationRequest,
  createDesktopTrayMenu,
  describeDesktopAutostart,
  describeDesktopPackagingPlan,
  describeDesktopShortcuts,
  describeDesktopWrapper,
  routeDesktopDeepLink
} from '../src/platform/desktop-wrapper.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('desktop wrapper selects an Electron stack and exposes runnable debug artifact contracts', () => {
  const wrapper = describeDesktopWrapper();
  const linuxArtifact = createDesktopDebugBuildArtifact({ os: 'linux', arch: 'x64', buildId: 'local-debug-1' });
  const packaging = describeDesktopPackagingPlan();

  assert.equal(DESKTOP_WRAPPER_STACK.platform, 'desktop');
  assert.equal(wrapper.stack.runtime, 'electron');
  assert.equal(wrapper.stack.uiToolkit, 'web');
  assert.equal(wrapper.stack.buildSystem, 'electron-builder');
  assert.deepEqual(wrapper.stack.targetOs, ['macos', 'windows', 'linux']);
  assert.deepEqual(wrapper.stack.sharedIntegrations, ['tdlib', 'settings', 'agent', 'proxy', 'ton']);

  assert.equal(wrapper.debugArtifacts.linux.path, 'desktop/out/debug/linux-x64/teleton-client');
  assert.equal(wrapper.debugArtifacts.macos.path, 'desktop/out/debug/macos-x64/Teleton Client.app');
  assert.equal(wrapper.debugArtifacts.windows.path, 'desktop/out/debug/windows-x64/Teleton Client.exe');
  assert.deepEqual(linuxArtifact, {
    platform: 'desktop',
    os: 'linux',
    variant: 'debug',
    format: 'executable',
    arch: 'x64',
    path: 'desktop/out/debug/linux-x64/teleton-client',
    appId: 'dev.teleton.client',
    productName: 'Teleton Client',
    buildId: 'local-debug-1',
    installable: false,
    runnable: true
  });

  assert.equal(packaging.macos.format, 'dmg');
  assert.equal(packaging.windows.format, 'exe');
  assert.equal(packaging.linux.format, 'AppImage');
});

test('desktop tray menu maps messenger state to privacy-safe desktop actions', () => {
  const tray = createDesktopTrayMenu({
    unreadCount: 3,
    agentStatus: 'running',
    autostartEnabled: true,
    notificationsEnabled: false,
    lastMessageText: 'private message body'
  });

  assert.equal(tray.platform, 'desktop');
  assert.equal(tray.api, 'Electron Tray');
  assert.equal(tray.tooltip, 'Teleton Client - 3 unread');
  assert.equal(tray.badge.count, 3);
  assert.equal(tray.items.find((item) => item.id === 'window.open').route, 'messaging.open');
  assert.equal(tray.items.find((item) => item.id === 'agent.runtime').label, 'Agent: Running');
  assert.equal(tray.items.find((item) => item.id === 'notifications.toggle').checked, false);
  assert.equal(tray.items.find((item) => item.id === 'autostart.toggle').checked, true);
  assert.equal(tray.items.at(-1).role, 'quit');
  assert.doesNotMatch(JSON.stringify(tray), /private message body/);
});

test('desktop notifications map shared events to redacted system notification requests', () => {
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

  const request = createDesktopNotificationRequest(approval);

  assert.equal(request.platform, 'desktop');
  assert.equal(request.api, 'Electron Notification');
  assert.equal(request.permission, 'system-notifications');
  assert.equal(request.urgency, 'critical');
  assert.equal(request.route, 'agent.action.review');
  assert.equal(request.activation.window, 'main');
  assert.equal(request.activation.focus, true);
  assert.doesNotMatch(JSON.stringify(request), /private message body|Private chat/);

  const muted = createAgentActionNotification({
    id: 'agent-info-1',
    type: 'agent.action.completed',
    action: 'summarizeChat',
    actionLabel: 'Summarize chat'
  });

  assert.equal(createDesktopNotificationRequest(muted, { settings: { notifications: { enabled: false } } }), null);
});

test('desktop shortcuts cover expected local and global messenger actions', () => {
  const shortcuts = describeDesktopShortcuts();

  assert.equal(shortcuts.api.local, 'BrowserWindow webContents before-input-event');
  assert.equal(shortcuts.api.global, 'Electron globalShortcut');
  assert.equal(shortcuts.local.find((shortcut) => shortcut.id === 'messaging.search').accelerator, 'CommandOrControl+K');
  assert.equal(shortcuts.local.find((shortcut) => shortcut.id === 'chat.new').route, 'messaging.composeMessage');
  assert.equal(shortcuts.local.find((shortcut) => shortcut.id === 'agent.quickAction').requiresUserConfirmation, true);
  assert.equal(shortcuts.local.find((shortcut) => shortcut.id === 'wallet.transferReview').route, 'ton.transfer.review');
  assert.equal(shortcuts.global.find((shortcut) => shortcut.id === 'window.showHide').accelerator, 'CommandOrControl+Shift+T');
  assert.equal(shortcuts.global.find((shortcut) => shortcut.id === 'notifications.muteToggle').route, 'settings.notifications.toggleMute');
  assert.equal(shortcuts.collisionReport.conflictCount, 0);
  assert.equal(shortcuts.settings.disableRiskyActionBindingsKey, 'input.riskyActionBindings.enabled');
});

test('desktop autostart maps to per-OS startup APIs without enabling by default', () => {
  const autostart = describeDesktopAutostart();
  const macos = createDesktopAutostartConfig({ os: 'macos', enabled: true, openAsHidden: true });
  const windows = createDesktopAutostartConfig({ os: 'windows', enabled: true, openAsHidden: true });
  const linux = createDesktopAutostartConfig({ os: 'linux', enabled: true, openAsHidden: true });

  assert.equal(autostart.defaultEnabled, false);
  assert.equal(macos.api, 'app.setLoginItemSettings');
  assert.equal(macos.settings.openAsHidden, true);
  assert.deepEqual(macos.settings.args, ['--hidden']);

  assert.equal(windows.api, 'app.setLoginItemSettings');
  assert.equal(windows.registryScope, 'current-user-run-key');
  assert.deepEqual(windows.settings.args, ['--hidden']);

  assert.equal(linux.api, 'XDG Autostart');
  assert.equal(linux.desktopEntryPath, '~/.config/autostart/dev.teleton.client.desktop');
  assert.match(linux.desktopEntry, /X-GNOME-Autostart-enabled=true/);
  assert.match(linux.desktopEntry, /--hidden/);
});

test('desktop deep links route Telegram and TON URIs to shared workflows', () => {
  assert.deepEqual(DESKTOP_DEEP_LINK_SCHEMES, ['teleton', 'tg', 'ton', 'https']);

  assert.deepEqual(routeDesktopDeepLink('tg://resolve?domain=teleton'), {
    accepted: true,
    platform: 'desktop',
    source: 'protocol-handler',
    workflow: 'messaging.openChat',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton'
    }
  });

  assert.deepEqual(routeDesktopDeepLink('https://t.me/teleton/42'), {
    accepted: true,
    platform: 'desktop',
    source: 'app-link',
    workflow: 'messaging.openMessage',
    sharedModule: 'tdlib',
    payload: {
      username: 'teleton',
      messageId: '42'
    }
  });

  assert.deepEqual(routeDesktopDeepLink('ton://transfer/EQExampleAddress?amount=1000&text=coffee'), {
    accepted: true,
    platform: 'desktop',
    source: 'protocol-handler',
    workflow: 'ton.transfer.review',
    sharedModule: 'ton',
    payload: {
      recipientAddress: 'EQExampleAddress',
      amountNano: '1000',
      comment: 'coffee',
      requiresConfirmation: true
    }
  });

  assert.deepEqual(routeDesktopDeepLink('teleton://settings/notifications'), {
    accepted: true,
    platform: 'desktop',
    source: 'protocol-handler',
    workflow: 'settings.openSection',
    sharedModule: 'settings',
    payload: {
      section: 'notifications'
    }
  });
});

test('desktop wrapper docs cover the selected stack, capabilities, and packaging targets', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');
  const desktopGuide = await readFile(pathFor('docs/desktop-wrapper.md'), 'utf8');

  assert.match(readme, /Desktop wrapper contract/i);
  assert.match(architecture, /Desktop wrapper/i);
  assert.match(buildGuide, /desktop\/out\/debug\/linux-x64\/teleton-client/i);
  assert.match(desktopGuide, /Electron/i);
  assert.match(desktopGuide, /Electron Tray/i);
  assert.match(desktopGuide, /globalShortcut/i);
  assert.match(desktopGuide, /collision report/i);
  assert.match(desktopGuide, /input\.riskyActionBindings\.enabled/i);
  assert.match(desktopGuide, /autostart/i);
  assert.match(desktopGuide, /DMG/i);
  assert.match(desktopGuide, /EXE/i);
  assert.match(desktopGuide, /AppImage/i);
});
