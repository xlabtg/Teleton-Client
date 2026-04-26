import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  TABLET_BREAKPOINTS,
  TABLET_LAYOUT_VIEWS,
  classifyTabletViewport,
  createTabletLayoutState,
  describeTabletLayoutRules
} from '../src/platform/tablet-layout.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

function assertNoPaneOverlap(layout) {
  const panes = layout.content.panes.filter((pane) => pane.visible);

  for (let index = 1; index < panes.length; index += 1) {
    const previous = panes[index - 1];
    const current = panes[index];

    assert.ok(
      previous.frame.x + previous.frame.width <= current.frame.x,
      `${layout.view} ${layout.viewport.orientation} panes should not overlap`
    );
  }

  const last = panes.at(-1);
  assert.ok(
    !last || last.frame.x + last.frame.width <= layout.content.bounds.x + layout.content.bounds.width,
    `${layout.view} ${layout.viewport.orientation} panes should stay inside content bounds`
  );
}

test('tablet layout classifies representative tablet portrait and landscape viewports', () => {
  assert.equal(TABLET_BREAKPOINTS.minShortEdge, 600);
  assert.equal(TABLET_BREAKPOINTS.maxLongEdge, 1366);

  assert.deepEqual(classifyTabletViewport({ width: 768, height: 1024 }), {
    width: 768,
    height: 1024,
    shortEdge: 768,
    longEdge: 1024,
    orientation: 'portrait',
    deviceClass: 'tablet',
    sizeClass: 'regular',
    splitCapable: true,
    expanded: false
  });

  assert.deepEqual(classifyTabletViewport({ width: 1180, height: 820 }), {
    width: 1180,
    height: 820,
    shortEdge: 820,
    longEdge: 1180,
    orientation: 'landscape',
    deviceClass: 'tablet',
    sizeClass: 'expanded',
    splitCapable: true,
    expanded: true
  });

  assert.equal(classifyTabletViewport({ width: 390, height: 844 }).deviceClass, 'phone');
  assert.equal(classifyTabletViewport({ width: 1440, height: 900 }).deviceClass, 'desktop');
});

test('tablet portrait layouts keep primary workflows reachable without desktop-only controls', () => {
  for (const view of TABLET_LAYOUT_VIEWS) {
    const layout = createTabletLayoutState({ width: 768, height: 1024, view });

    assert.equal(layout.viewport.deviceClass, 'tablet');
    assert.equal(layout.viewport.orientation, 'portrait');
    assert.equal(layout.navigation.mode, 'bottom-bar');
    assert.equal(layout.navigation.desktopOnlyControlsRequired, false);
    assert.deepEqual(
      layout.navigation.items.map((item) => item.route),
      ['messaging.open', 'agent.runtime.open', 'ton.wallet.open', 'settings.openSection']
    );
    assert.equal(layout.content.strategy, 'split-pane');
    assert.equal(layout.content.horizontalOverflow, false);
    assert.equal(layout.content.minimumTouchTarget, 44);
    assert.equal(layout.content.panes.filter((pane) => pane.visible).length, 2);
    assert.ok(layout.content.panes.every((pane) => pane.visible || pane.presentation === 'sheet'));
    assertNoPaneOverlap(layout);
  }
});

test('tablet landscape layouts use readable split panes for chats, settings, agent, and wallet', () => {
  for (const view of TABLET_LAYOUT_VIEWS) {
    const layout = createTabletLayoutState({ width: 1180, height: 820, view });
    const visiblePanes = layout.content.panes.filter((pane) => pane.visible);

    assert.equal(layout.viewport.deviceClass, 'tablet');
    assert.equal(layout.viewport.orientation, 'landscape');
    assert.equal(layout.navigation.mode, 'navigation-rail');
    assert.equal(layout.content.strategy, 'split-pane');
    assert.equal(layout.content.horizontalOverflow, false);
    assert.equal(visiblePanes.length, 3);
    assert.ok(visiblePanes.every((pane) => pane.frame.width >= pane.minWidth));
    assertNoPaneOverlap(layout);
  }
});

test('narrow tablets collapse optional panes instead of producing cramped overlap', () => {
  const layout = createTabletLayoutState({ width: 600, height: 960, view: 'wallet' });
  const visiblePanes = layout.content.panes.filter((pane) => pane.visible);
  const sheetPanes = layout.content.panes.filter((pane) => pane.presentation === 'sheet');

  assert.equal(layout.viewport.deviceClass, 'tablet');
  assert.equal(layout.content.strategy, 'single-pane-with-sheets');
  assert.equal(layout.content.horizontalOverflow, false);
  assert.equal(visiblePanes.length, 1);
  assert.equal(sheetPanes.length, 2);
  assert.equal(visiblePanes[0].frame.width, layout.content.bounds.width);
  assertNoPaneOverlap(layout);
});

test('tablet layout rules document the core view pane behavior', async () => {
  const rules = describeTabletLayoutRules();
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const tabletGuide = await readFile(pathFor('docs/tablet-layout.md'), 'utf8');

  assert.deepEqual(Object.keys(rules.views), TABLET_LAYOUT_VIEWS);
  assert.equal(rules.navigation.portrait.mode, 'bottom-bar');
  assert.equal(rules.navigation.landscape.mode, 'navigation-rail');
  assert.match(architecture, /responsive tablet layout/i);
  assert.match(tabletGuide, /768 x 1024/i);
  assert.match(tabletGuide, /1180 x 820/i);
  assert.match(tabletGuide, /chats, settings, agent, and wallet/i);
});
