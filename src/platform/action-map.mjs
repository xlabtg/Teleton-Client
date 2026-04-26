export const RISKY_ACTION_BINDINGS_SETTING = 'input.riskyActionBindings.enabled';

export const INPUT_ACTION_PLATFORMS = Object.freeze(['desktop', 'ios', 'android']);

export const INPUT_ACTION_RISK_LEVELS = Object.freeze(['low', 'review-required']);

const SHARED_INPUT_ACTIONS = deepFreeze({
  'messaging.search': {
    id: 'messaging.search',
    label: 'Search messages',
    category: 'messaging',
    workflow: 'messaging.search',
    route: 'messaging.search',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Search messages'
  },
  'chat.new': {
    id: 'chat.new',
    label: 'New message',
    category: 'messaging',
    workflow: 'messaging.composeMessage',
    route: 'messaging.composeMessage',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Compose a new message'
  },
  'chat.next': {
    id: 'chat.next',
    label: 'Next chat',
    category: 'messaging',
    workflow: 'messaging.selectNextChat',
    route: 'messaging.selectNextChat',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Move to the next chat'
  },
  'chat.previous': {
    id: 'chat.previous',
    label: 'Previous chat',
    category: 'messaging',
    workflow: 'messaging.selectPreviousChat',
    route: 'messaging.selectPreviousChat',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Move to the previous chat'
  },
  'agent.quickAction': {
    id: 'agent.quickAction',
    label: 'Agent quick action',
    category: 'agent',
    workflow: 'agent.action.compose',
    route: 'agent.action.compose',
    riskLevel: 'review-required',
    requiresUserConfirmation: true,
    accessibilityLabel: 'Draft an agent action for review'
  },
  'wallet.open': {
    id: 'wallet.open',
    label: 'Open TON wallet',
    category: 'wallet',
    workflow: 'ton.wallet.open',
    route: 'ton.wallet.open',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Open the TON wallet'
  },
  'wallet.transferReview': {
    id: 'wallet.transferReview',
    label: 'Review TON transfer',
    category: 'wallet',
    workflow: 'ton.transfer.review',
    route: 'ton.transfer.review',
    riskLevel: 'review-required',
    requiresUserConfirmation: true,
    accessibilityLabel: 'Create a TON transfer draft for review'
  },
  'notifications.muteToggle': {
    id: 'notifications.muteToggle',
    label: 'Toggle notification mute',
    category: 'settings',
    workflow: 'settings.notifications.toggleMute',
    route: 'settings.notifications.toggleMute',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Toggle notification mute'
  },
  'window.showHide': {
    id: 'window.showHide',
    label: 'Show or hide window',
    category: 'window',
    workflow: 'window.toggleVisible',
    route: 'window.toggleVisible',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    accessibilityLabel: 'Show or hide Teleton Client'
  }
});

const DESKTOP_SHORTCUT_BINDINGS = deepFreeze([
  {
    actionId: 'messaging.search',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'CommandOrControl+K',
    scope: 'focused-main-window'
  },
  {
    actionId: 'chat.new',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'CommandOrControl+N',
    scope: 'focused-main-window'
  },
  {
    actionId: 'chat.next',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'Alt+ArrowDown',
    scope: 'focused-main-window'
  },
  {
    actionId: 'chat.previous',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'Alt+ArrowUp',
    scope: 'focused-main-window'
  },
  {
    actionId: 'agent.quickAction',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'CommandOrControl+Shift+A',
    scope: 'focused-main-window'
  },
  {
    actionId: 'wallet.open',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'CommandOrControl+Shift+W',
    scope: 'focused-main-window'
  },
  {
    actionId: 'wallet.transferReview',
    kind: 'shortcut',
    group: 'local',
    accelerator: 'CommandOrControl+Shift+X',
    scope: 'focused-main-window'
  },
  {
    actionId: 'window.showHide',
    kind: 'shortcut',
    group: 'global',
    accelerator: 'CommandOrControl+Shift+T',
    registration: 'opt-in-user-setting'
  },
  {
    actionId: 'notifications.muteToggle',
    kind: 'shortcut',
    group: 'global',
    accelerator: 'CommandOrControl+Shift+M',
    registration: 'opt-in-user-setting'
  }
]);

const IOS_GESTURE_BINDINGS = deepFreeze([
  {
    actionId: 'messaging.search',
    kind: 'gesture',
    gesture: 'pull-down',
    context: 'chat-list',
    activation: 'from-top-of-list'
  },
  {
    actionId: 'chat.next',
    kind: 'gesture',
    gesture: 'vertical-swipe',
    direction: 'up',
    fingers: 2,
    context: 'chat-thread'
  },
  {
    actionId: 'chat.previous',
    kind: 'gesture',
    gesture: 'vertical-swipe',
    direction: 'down',
    fingers: 2,
    context: 'chat-thread'
  },
  {
    actionId: 'agent.quickAction',
    kind: 'gesture',
    gesture: 'long-press',
    context: 'agent-tab',
    minimumDurationMs: 500
  },
  {
    actionId: 'wallet.transferReview',
    kind: 'gesture',
    gesture: 'long-press',
    context: 'wallet-tab',
    minimumDurationMs: 650
  }
]);

const ANDROID_GESTURE_BINDINGS = deepFreeze([
  {
    actionId: 'messaging.search',
    kind: 'gesture',
    gesture: 'pull-down',
    context: 'chat-list',
    activation: 'from-top-of-list'
  },
  {
    actionId: 'chat.next',
    kind: 'gesture',
    gesture: 'horizontal-swipe',
    direction: 'left',
    context: 'chat-thread',
    edgeReserved: false
  },
  {
    actionId: 'chat.previous',
    kind: 'gesture',
    gesture: 'horizontal-swipe',
    direction: 'right',
    context: 'chat-thread',
    edgeReserved: false
  },
  {
    actionId: 'agent.quickAction',
    kind: 'gesture',
    gesture: 'long-press',
    context: 'agent-navigation-item',
    minimumDurationMs: 500
  },
  {
    actionId: 'wallet.transferReview',
    kind: 'gesture',
    gesture: 'long-press',
    context: 'wallet-navigation-item',
    minimumDurationMs: 650
  }
]);

const RESERVED_GESTURE_WARNINGS = deepFreeze({
  ios: [
    {
      platform: 'ios',
      gesture: 'screen-edge-swipe',
      description: 'iOS system edge, Control Center, and Home indicator gestures remain reserved; Teleton gestures use content or tab controls.'
    }
  ],
  android: [
    {
      platform: 'android',
      gesture: 'edge-swipe',
      description: 'Android system back uses edge swipe; Teleton horizontal gestures must start inside content instead of at the screen edge.'
    }
  ]
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!INPUT_ACTION_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported input action platform: ${value}`);
  }

  return platform;
}

function normalizeMobilePlatform(value) {
  const platform = normalizePlatform(value);

  if (!['ios', 'android'].includes(platform)) {
    throw new Error(`Unsupported mobile gesture platform: ${value}`);
  }

  return platform;
}

function normalizeDisabledActionIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((actionId) => String(actionId ?? '').trim()).filter(Boolean))].sort();
}

function materializeBinding(definition, platform) {
  const action = SHARED_INPUT_ACTIONS[definition.actionId];

  if (!action) {
    throw new Error(`Unknown shared input action: ${definition.actionId}`);
  }

  return {
    id: definition.id ?? action.id,
    actionId: action.id,
    label: action.label,
    category: action.category,
    workflow: action.workflow,
    route: action.route,
    riskLevel: action.riskLevel,
    requiresUserConfirmation: action.requiresUserConfirmation,
    disableSetting: action.riskLevel === 'review-required' ? RISKY_ACTION_BINDINGS_SETTING : null,
    accessibilityLabel: definition.accessibilityLabel ?? action.accessibilityLabel,
    platform,
    ...definition
  };
}

function materializeBindings(definitions, platform) {
  return definitions.map((definition) => materializeBinding(definition, platform));
}

function triggerForBinding(binding) {
  if (binding.accelerator) {
    return String(binding.accelerator);
  }

  if (binding.gesture) {
    return [
      binding.gesture,
      binding.direction,
      binding.fingers ? `${binding.fingers}-finger` : null,
      binding.activation
    ]
      .filter(Boolean)
      .join(':');
  }

  return String(binding.trigger ?? '');
}

function scopeForBinding(binding) {
  if (binding.kind === 'shortcut') {
    return binding.scope ?? binding.registration ?? 'global';
  }

  if (binding.kind === 'gesture') {
    return binding.context ?? 'default';
  }

  return binding.scope ?? 'default';
}

function collisionKeyForBinding(binding) {
  const trigger = triggerForBinding(binding).toLowerCase();
  return [binding.platform ?? 'shared', binding.kind ?? 'binding', scopeForBinding(binding), trigger].join('|');
}

function filterBindings(bindings, options = {}) {
  const disabledActionIds = normalizeDisabledActionIds(options.disabledActionIds);
  const disabledActionIdSet = new Set(disabledActionIds);
  const riskyActionBindingsEnabled = options.riskyActionBindingsEnabled !== false;
  const active = [];
  const disabled = [];

  for (const binding of bindings) {
    let reason = null;

    if (disabledActionIdSet.has(binding.actionId)) {
      reason = 'action-disabled-by-user';
    } else if (!riskyActionBindingsEnabled && binding.riskLevel === 'review-required') {
      reason = 'risky-action-bindings-disabled';
    }

    if (reason) {
      disabled.push({ ...binding, enabled: false, reason });
    } else {
      active.push({ ...binding, enabled: true });
    }
  }

  return {
    active,
    disabled,
    settings: {
      riskyActionBindingsEnabled,
      disabledActionIds,
      disableRiskyActionBindingsKey: RISKY_ACTION_BINDINGS_SETTING
    }
  };
}

export function describeInputActionMap() {
  return clone(SHARED_INPUT_ACTIONS);
}

export function detectInputBindingCollisions(bindings) {
  const seen = new Map();
  const conflicts = [];

  for (const binding of bindings ?? []) {
    const trigger = triggerForBinding(binding);
    if (!trigger) {
      continue;
    }

    const key = collisionKeyForBinding(binding);
    const existing = seen.get(key);

    if (existing) {
      conflicts.push({
        key,
        platform: binding.platform ?? existing.platform ?? 'shared',
        kind: binding.kind ?? existing.kind ?? 'binding',
        scope: scopeForBinding(binding),
        trigger,
        actionIds: [existing.actionId, binding.actionId],
        bindingIds: [existing.id, binding.id],
        severity: 'blocking'
      });
    } else {
      seen.set(key, binding);
    }
  }

  return {
    checked: true,
    conflictCount: conflicts.length,
    conflicts
  };
}

export function createDesktopShortcutPlan(options = {}) {
  const bindings = materializeBindings(DESKTOP_SHORTCUT_BINDINGS, 'desktop');
  const filtered = filterBindings(bindings, options);
  const local = filtered.active.filter((binding) => binding.group === 'local');
  const global = filtered.active.filter((binding) => binding.group === 'global');
  const active = [...local, ...global];

  return {
    platform: 'desktop',
    api: {
      local: 'BrowserWindow webContents before-input-event',
      global: 'Electron globalShortcut'
    },
    settings: filtered.settings,
    local,
    global,
    disabled: filtered.disabled,
    collisionReport: detectInputBindingCollisions(active),
    accessibility: {
      alternativeControls:
        'Every shortcut action must remain reachable through visible controls, menus, or review screens.',
      documentation: 'docs/desktop-wrapper.md#shortcuts'
    }
  };
}

export function createMobileGesturePlan(platform, options = {}) {
  const normalizedPlatform = normalizeMobilePlatform(platform);
  const definitions = normalizedPlatform === 'ios' ? IOS_GESTURE_BINDINGS : ANDROID_GESTURE_BINDINGS;
  const bindings = materializeBindings(definitions, normalizedPlatform);
  const filtered = filterBindings(bindings, options);

  return {
    platform: normalizedPlatform,
    api: normalizedPlatform === 'ios' ? 'SwiftUI Gesture' : 'Jetpack Compose pointerInput',
    settings: filtered.settings,
    gestures: filtered.active,
    disabled: filtered.disabled,
    collisionReport: detectInputBindingCollisions(filtered.active),
    reservedGestureWarnings: clone(RESERVED_GESTURE_WARNINGS[normalizedPlatform]),
    accessibility: {
      alternativeControls:
        'Gestures are shortcuts only; visible controls, keyboard access where available, and screen-reader actions must expose the same routes.',
      requiresConfirmationForRiskyActions: true,
      documentation: `docs/${normalizedPlatform}-wrapper.md#gestures`
    }
  };
}

export function createPlatformInputPlan(platform, options = {}) {
  const normalizedPlatform = normalizePlatform(platform);

  if (normalizedPlatform === 'desktop') {
    return {
      platform: normalizedPlatform,
      actions: describeInputActionMap(),
      shortcuts: createDesktopShortcutPlan(options)
    };
  }

  return {
    platform: normalizedPlatform,
    actions: describeInputActionMap(),
    gestures: createMobileGesturePlan(normalizedPlatform, options)
  };
}
