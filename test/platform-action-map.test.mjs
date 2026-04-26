import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  createDesktopShortcutPlan,
  createMobileGesturePlan,
  describeInputActionMap,
  detectInputBindingCollisions
} from '../src/platform/action-map.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('shared input action map covers messenger, agent, and wallet workflows', () => {
  const actions = describeInputActionMap();

  assert.equal(actions['messaging.search'].route, 'messaging.search');
  assert.equal(actions['chat.next'].workflow, 'messaging.selectNextChat');
  assert.equal(actions['agent.quickAction'].requiresUserConfirmation, true);
  assert.equal(actions['agent.quickAction'].riskLevel, 'review-required');
  assert.equal(actions['wallet.transferReview'].workflow, 'ton.transfer.review');
  assert.equal(actions['wallet.transferReview'].riskLevel, 'review-required');
});

test('desktop shortcut adapter uses the shared map and reports accelerator conflicts', () => {
  const plan = createDesktopShortcutPlan();

  assert.equal(plan.platform, 'desktop');
  assert.equal(plan.api.local, 'BrowserWindow webContents before-input-event');
  assert.equal(plan.api.global, 'Electron globalShortcut');
  assert.equal(plan.local.find((shortcut) => shortcut.actionId === 'messaging.search').accelerator, 'CommandOrControl+K');
  assert.equal(plan.local.find((shortcut) => shortcut.actionId === 'chat.new').route, 'messaging.composeMessage');
  assert.equal(plan.local.find((shortcut) => shortcut.actionId === 'agent.quickAction').requiresUserConfirmation, true);
  assert.equal(plan.local.find((shortcut) => shortcut.actionId === 'wallet.transferReview').route, 'ton.transfer.review');
  assert.equal(plan.global.find((shortcut) => shortcut.actionId === 'window.showHide').registration, 'opt-in-user-setting');
  assert.equal(plan.collisionReport.conflictCount, 0);

  const collisionReport = detectInputBindingCollisions([
    ...plan.local,
    {
      ...plan.local.find((shortcut) => shortcut.actionId === 'messaging.search'),
      id: 'test.duplicateSearch',
      actionId: 'chat.new'
    }
  ]);

  assert.equal(collisionReport.conflictCount, 1);
  assert.equal(collisionReport.conflicts[0].trigger, 'CommandOrControl+K');
  assert.deepEqual(collisionReport.conflicts[0].actionIds, ['messaging.search', 'chat.new']);
});

test('risky desktop shortcuts and mobile gestures can be disabled by user preference', () => {
  const desktop = createDesktopShortcutPlan({ riskyActionBindingsEnabled: false });
  const ios = createMobileGesturePlan('ios', { riskyActionBindingsEnabled: false });

  assert.equal(desktop.local.some((shortcut) => shortcut.actionId === 'agent.quickAction'), false);
  assert.equal(desktop.local.some((shortcut) => shortcut.actionId === 'wallet.transferReview'), false);
  assert.deepEqual(
    desktop.disabled.map((binding) => binding.actionId).sort(),
    ['agent.quickAction', 'wallet.transferReview']
  );
  assert.equal(desktop.disabled.every((binding) => binding.reason === 'risky-action-bindings-disabled'), true);
  assert.equal(desktop.settings.riskyActionBindingsEnabled, false);
  assert.equal(desktop.settings.disableRiskyActionBindingsKey, 'input.riskyActionBindings.enabled');

  assert.equal(ios.gestures.some((gesture) => gesture.actionId === 'agent.quickAction'), false);
  assert.equal(ios.gestures.some((gesture) => gesture.actionId === 'wallet.transferReview'), false);
});

test('mobile gesture adapters expose platform-appropriate gestures and accessibility metadata', () => {
  const ios = createMobileGesturePlan('ios');
  const android = createMobileGesturePlan('android', { disabledActionIds: ['wallet.transferReview'] });

  assert.equal(ios.platform, 'ios');
  assert.equal(ios.api, 'SwiftUI Gesture');
  assert.equal(ios.gestures.find((gesture) => gesture.actionId === 'messaging.search').gesture, 'pull-down');
  assert.equal(ios.gestures.find((gesture) => gesture.actionId === 'agent.quickAction').requiresUserConfirmation, true);
  assert.equal(ios.collisionReport.conflictCount, 0);
  assert.match(ios.accessibility.alternativeControls, /visible controls/i);

  assert.equal(android.platform, 'android');
  assert.equal(android.api, 'Jetpack Compose pointerInput');
  assert.equal(android.gestures.find((gesture) => gesture.actionId === 'chat.next').gesture, 'horizontal-swipe');
  assert.equal(android.gestures.some((gesture) => gesture.actionId === 'wallet.transferReview'), false);
  assert.equal(android.disabled.find((gesture) => gesture.actionId === 'wallet.transferReview').reason, 'action-disabled-by-user');
  assert.equal(android.collisionReport.conflictCount, 0);
  assert.equal(android.reservedGestureWarnings.some((warning) => /system back/i.test(warning.description)), true);
});

test('input action documentation covers conflicts, accessibility, and risky-action disablement', async () => {
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const desktopGuide = await readFile(pathFor('docs/desktop-wrapper.md'), 'utf8');
  const iosGuide = await readFile(pathFor('docs/ios-wrapper.md'), 'utf8');
  const androidGuide = await readFile(pathFor('docs/android-wrapper.md'), 'utf8');

  assert.match(architecture, /shared input action map/i);
  assert.match(desktopGuide, /collision report/i);
  assert.match(desktopGuide, /input\.riskyActionBindings\.enabled/i);
  assert.match(iosGuide, /gesture/i);
  assert.match(iosGuide, /visible controls/i);
  assert.match(androidGuide, /system back/i);
  assert.match(androidGuide, /accessibility/i);
});
