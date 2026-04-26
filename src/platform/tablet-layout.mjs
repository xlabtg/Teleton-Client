export const TABLET_LAYOUT_SCHEMA_VERSION = 1;
export const TABLET_LAYOUT_VIEWS = Object.freeze(['chats', 'settings', 'agent', 'wallet']);

export const TABLET_BREAKPOINTS = deepFreeze({
  minShortEdge: 600,
  maxLongEdge: 1366,
  splitMinWidth: 744,
  expandedMinWidth: 1024,
  minTouchTarget: 44,
  bottomNavigationHeight: 64,
  navigationRailWidth: 72,
  outerMargin: {
    portrait: 16,
    landscape: 24
  },
  paneGap: {
    portrait: 12,
    landscape: 16
  }
});

const PRIMARY_NAVIGATION_ITEMS = deepFreeze([
  {
    id: 'chats',
    label: 'Chats',
    route: 'messaging.open',
    sharedModule: 'tdlib'
  },
  {
    id: 'agent',
    label: 'Agent',
    route: 'agent.runtime.open',
    sharedModule: 'agent'
  },
  {
    id: 'wallet',
    label: 'Wallet',
    route: 'ton.wallet.open',
    sharedModule: 'ton'
  },
  {
    id: 'settings',
    label: 'Settings',
    route: 'settings.openSection',
    sharedModule: 'settings'
  }
]);

const TABLET_VIEW_RULES = deepFreeze({
  chats: {
    view: 'chats',
    primaryWorkflow: 'messaging.open',
    portrait: {
      strategy: 'split-pane',
      panes: [
        paneRule('chat-list', 'Chat list', 'primary', 'messaging.open', 280, 288, 320),
        paneRule('conversation', 'Conversation', 'detail', 'messaging.openChat', 360, 432, null),
        paneRule('chat-context', 'Chat details', 'supporting', 'messaging.openChatInfo', 240, 256, 280, {
          optional: true
        })
      ]
    },
    landscape: {
      strategy: 'split-pane',
      panes: [
        paneRule('chat-list', 'Chat list', 'primary', 'messaging.open', 300, 320, 360),
        paneRule('conversation', 'Conversation', 'detail', 'messaging.openChat', 400, 480, null),
        paneRule('chat-context', 'Chat details', 'supporting', 'messaging.openChatInfo', 240, 256, 300, {
          optional: true,
          expandedOnly: true
        })
      ]
    }
  },
  settings: {
    view: 'settings',
    primaryWorkflow: 'settings.openSection',
    portrait: {
      strategy: 'split-pane',
      panes: [
        paneRule('settings-sections', 'Settings sections', 'primary', 'settings.openSection', 256, 272, 304),
        paneRule('settings-detail', 'Settings detail', 'detail', 'settings.update', 360, 448, null),
        paneRule('settings-preview', 'Settings preview', 'supporting', 'settings.preview', 232, 248, 280, {
          optional: true
        })
      ]
    },
    landscape: {
      strategy: 'split-pane',
      panes: [
        paneRule('settings-sections', 'Settings sections', 'primary', 'settings.openSection', 280, 304, 336),
        paneRule('settings-detail', 'Settings detail', 'detail', 'settings.update', 400, 480, null),
        paneRule('settings-preview', 'Settings preview', 'supporting', 'settings.preview', 232, 248, 288, {
          optional: true,
          expandedOnly: true
        })
      ]
    }
  },
  agent: {
    view: 'agent',
    primaryWorkflow: 'agent.runtime.open',
    portrait: {
      strategy: 'split-pane',
      panes: [
        paneRule('agent-activity', 'Agent activity', 'primary', 'agent.runtime.open', 264, 280, 312),
        paneRule('agent-workspace', 'Agent workspace', 'detail', 'agent.action.review', 360, 444, null),
        paneRule('agent-approvals', 'Approval queue', 'supporting', 'agent.action.review', 240, 256, 288, {
          optional: true
        })
      ]
    },
    landscape: {
      strategy: 'split-pane',
      panes: [
        paneRule('agent-activity', 'Agent activity', 'primary', 'agent.runtime.open', 288, 304, 344),
        paneRule('agent-workspace', 'Agent workspace', 'detail', 'agent.action.review', 400, 480, null),
        paneRule('agent-approvals', 'Approval queue', 'supporting', 'agent.action.review', 240, 256, 300, {
          optional: true,
          expandedOnly: true
        })
      ]
    }
  },
  wallet: {
    view: 'wallet',
    primaryWorkflow: 'ton.wallet.open',
    portrait: {
      strategy: 'split-pane',
      panes: [
        paneRule('wallet-accounts', 'Wallet accounts', 'primary', 'ton.wallet.open', 264, 280, 312),
        paneRule('wallet-activity', 'Wallet activity', 'detail', 'ton.transaction.history', 360, 444, null),
        paneRule('wallet-review', 'Transaction review', 'supporting', 'ton.transfer.review', 240, 256, 288, {
          optional: true
        })
      ]
    },
    landscape: {
      strategy: 'split-pane',
      panes: [
        paneRule('wallet-accounts', 'Wallet accounts', 'primary', 'ton.wallet.open', 288, 304, 344),
        paneRule('wallet-activity', 'Wallet activity', 'detail', 'ton.transaction.history', 400, 480, null),
        paneRule('wallet-review', 'Transaction review', 'supporting', 'ton.transfer.review', 240, 256, 300, {
          optional: true,
          expandedOnly: true
        })
      ]
    }
  }
});

export const TABLET_LAYOUT_RULES = deepFreeze({
  schemaVersion: TABLET_LAYOUT_SCHEMA_VERSION,
  breakpoints: TABLET_BREAKPOINTS,
  navigation: {
    portrait: {
      mode: 'bottom-bar',
      height: TABLET_BREAKPOINTS.bottomNavigationHeight,
      desktopOnlyControlsRequired: false,
      items: PRIMARY_NAVIGATION_ITEMS
    },
    landscape: {
      mode: 'navigation-rail',
      width: TABLET_BREAKPOINTS.navigationRailWidth,
      desktopOnlyControlsRequired: false,
      items: PRIMARY_NAVIGATION_ITEMS
    }
  },
  views: TABLET_VIEW_RULES
});

function paneRule(id, label, role, route, minWidth, preferredWidth, maxWidth, options = {}) {
  return {
    id,
    label,
    role,
    route,
    minWidth,
    preferredWidth,
    maxWidth,
    optional: options.optional === true,
    expandedOnly: options.expandedOnly === true
  };
}

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

function normalizeDimension(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Tablet viewport ${label} must be a positive number.`);
  }

  return Math.trunc(number);
}

function normalizeView(value) {
  const view = String(value ?? 'chats').trim().toLowerCase();

  if (!TABLET_LAYOUT_VIEWS.includes(view)) {
    throw new Error(`Unsupported tablet layout view: ${value}`);
  }

  return view;
}

function clamp(value, min, max) {
  const upper = max ?? value;
  return Math.min(Math.max(value, min), upper);
}

function deviceClassFor(shortEdge, longEdge) {
  if (shortEdge < TABLET_BREAKPOINTS.minShortEdge) {
    return 'phone';
  }

  if (longEdge > TABLET_BREAKPOINTS.maxLongEdge) {
    return 'desktop';
  }

  return 'tablet';
}

function navigationFor(viewport) {
  const rule = TABLET_LAYOUT_RULES.navigation[viewport.orientation];
  const activeItemId = viewport.activeView ?? 'chats';

  return {
    mode: rule.mode,
    desktopOnlyControlsRequired: false,
    reservedInset:
      viewport.orientation === 'portrait'
        ? { edge: 'bottom', size: rule.height }
        : { edge: 'leading', size: rule.width },
    items: rule.items.map((item) => ({
      ...clone(item),
      active: item.id === activeItemId,
      minTouchTarget: TABLET_BREAKPOINTS.minTouchTarget
    }))
  };
}

function contentBoundsFor(viewport) {
  const margin = TABLET_BREAKPOINTS.outerMargin[viewport.orientation];
  const navigationSize =
    viewport.orientation === 'portrait'
      ? TABLET_BREAKPOINTS.bottomNavigationHeight
      : TABLET_BREAKPOINTS.navigationRailWidth;

  if (viewport.orientation === 'portrait') {
    return {
      x: margin,
      y: margin,
      width: viewport.width - margin * 2,
      height: viewport.height - margin * 2 - navigationSize
    };
  }

  return {
    x: navigationSize + margin,
    y: margin,
    width: viewport.width - navigationSize - margin * 2,
    height: viewport.height - margin * 2
  };
}

function paneState(rule, presentation, visible, frame) {
  return {
    id: rule.id,
    label: rule.label,
    role: rule.role,
    route: rule.route,
    minWidth: rule.minWidth,
    preferredWidth: rule.preferredWidth,
    maxWidth: rule.maxWidth,
    optional: rule.optional,
    visible,
    presentation,
    frame
  };
}

function sheetPaneState(rule, bounds) {
  return paneState(rule, 'sheet', false, {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  });
}

function frameVisiblePanes(rules, widths, bounds, gap) {
  let x = bounds.x;

  return rules.map((rule, index) => {
    const width = widths[index];
    const frame = {
      x,
      y: bounds.y,
      width,
      height: bounds.height
    };

    x += width + gap;
    return paneState(rule, 'inline', true, frame);
  });
}

function singlePaneLayout(rules, bounds) {
  const detail = rules.find((rule) => rule.role === 'detail') ?? rules[0];
  const deferred = rules.filter((rule) => rule.id !== detail.id);

  return {
    strategy: 'single-pane-with-sheets',
    panes: [
      paneState(detail, 'inline', true, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }),
      ...deferred.map((rule) => sheetPaneState(rule, bounds))
    ]
  };
}

function splitPaneLayout(rules, viewport, bounds) {
  const [primary, detail, supporting] = rules;
  const gap = TABLET_BREAKPOINTS.paneGap[viewport.orientation];
  let primaryWidth = clamp(primary.preferredWidth, primary.minWidth, primary.maxWidth);
  let detailWidth = bounds.width - primaryWidth - gap;

  if (detailWidth < detail.minWidth) {
    primaryWidth = Math.max(primary.minWidth, bounds.width - detail.minWidth - gap);
    detailWidth = bounds.width - primaryWidth - gap;
  }

  if (primaryWidth < primary.minWidth || detailWidth < detail.minWidth) {
    return singlePaneLayout(rules, bounds);
  }

  const visibleRules = [primary, detail];
  const widths = [primaryWidth, detailWidth];

  if (supporting && viewport.expanded) {
    const supportingWidth = clamp(supporting.preferredWidth, supporting.minWidth, supporting.maxWidth);
    const detailWithSupporting = bounds.width - primaryWidth - supportingWidth - gap * 2;

    if (detailWithSupporting >= detail.minWidth) {
      widths[1] = detailWithSupporting;
      visibleRules.push(supporting);
      widths.push(supportingWidth);
    }
  }

  const visiblePanes = frameVisiblePanes(visibleRules, widths, bounds, gap);
  const visibleIds = new Set(visiblePanes.map((pane) => pane.id));
  const sheetPanes = rules.filter((rule) => !visibleIds.has(rule.id)).map((rule) => sheetPaneState(rule, bounds));

  return {
    strategy: 'split-pane',
    panes: [...visiblePanes, ...sheetPanes]
  };
}

function createPaneLayout(view, viewport, bounds) {
  const rule = TABLET_VIEW_RULES[view][viewport.orientation];

  if (viewport.deviceClass !== 'tablet' || !viewport.splitCapable) {
    return singlePaneLayout(rule.panes, bounds);
  }

  return splitPaneLayout(rule.panes, viewport, bounds);
}

export function classifyTabletViewport(input = {}) {
  const width = normalizeDimension(input.width, 'width');
  const height = normalizeDimension(input.height, 'height');
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const orientation = width >= height ? 'landscape' : 'portrait';
  const deviceClass = deviceClassFor(shortEdge, longEdge);
  const expanded = deviceClass === 'tablet' && width >= TABLET_BREAKPOINTS.expandedMinWidth;
  const splitCapable = deviceClass === 'tablet' && width >= TABLET_BREAKPOINTS.splitMinWidth;

  return {
    width,
    height,
    shortEdge,
    longEdge,
    orientation,
    deviceClass,
    sizeClass: expanded ? 'expanded' : 'regular',
    splitCapable,
    expanded
  };
}

export function describeTabletLayoutRules() {
  return clone(TABLET_LAYOUT_RULES);
}

export function createTabletLayoutState(options = {}) {
  const view = normalizeView(options.view ?? 'chats');
  const viewport = {
    ...classifyTabletViewport(options),
    activeView: view
  };
  const bounds = contentBoundsFor(viewport);
  const paneLayout = createPaneLayout(view, viewport, bounds);

  return {
    kind: 'teleton.tablet.layout',
    schemaVersion: TABLET_LAYOUT_SCHEMA_VERSION,
    view,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      shortEdge: viewport.shortEdge,
      longEdge: viewport.longEdge,
      orientation: viewport.orientation,
      deviceClass: viewport.deviceClass,
      sizeClass: viewport.sizeClass,
      splitCapable: viewport.splitCapable,
      expanded: viewport.expanded
    },
    navigation: navigationFor(viewport),
    content: {
      bounds,
      strategy: paneLayout.strategy,
      horizontalOverflow: false,
      verticalOverflow: 'per-pane',
      minimumTouchTarget: TABLET_BREAKPOINTS.minTouchTarget,
      gap: TABLET_BREAKPOINTS.paneGap[viewport.orientation],
      panes: paneLayout.panes
    }
  };
}
