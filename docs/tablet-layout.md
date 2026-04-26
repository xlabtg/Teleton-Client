# Tablet Layout

The responsive tablet layout contract in `src/platform/tablet-layout.mjs` gives future Android, iOS, desktop, and web shells a shared set of breakpoint and pane rules without adding a rendered UI dependency to the foundation package.

## Breakpoints

Tablet viewports start at a 600 px short edge and remain in the tablet class through a 1366 px long edge. Wider viewports are treated as desktop shells, while narrower viewports use phone-style single-pane behavior.

The contract uses these representative tablet sizes in tests:

- 768 x 1024 portrait for regular tablet split panes.
- 1180 x 820 landscape for expanded tablet split panes with supporting panels.
- 600 x 960 portrait for narrow tablet fallback behavior.

Widths at or above 744 px are split-capable. Widths at or above 1024 px are expanded and may show a third supporting pane when the detail pane can still keep its minimum readable width.

## Navigation

Portrait tablets use a bottom bar so chat, agent, wallet, and settings workflows are reachable without desktop-only menus or shortcuts. Landscape tablets use a navigation rail with the same route set.

The shared navigation routes are:

- `messaging.open`
- `agent.runtime.open`
- `ton.wallet.open`
- `settings.openSection`

Every navigation item carries a minimum 44 px touch target for native and web shells.

## Pane Rules

The contract defines layouts for chats, settings, agent, and wallet views.

Portrait regular tablets show two readable inline panes: a primary list or section pane plus the active detail pane. Optional supporting panes become sheets.

Landscape expanded tablets show three panes when space allows: primary, detail, and supporting. The layout resolver checks each pane's minimum width before placing it inline, then assigns non-overlapping frames within the content bounds.

Narrow tablets use a single visible detail pane and expose the primary and supporting panes as sheets. This keeps the active workflow usable and avoids horizontal overflow instead of forcing cramped split panes.

## Platform Use

Platform shells should use `createTabletLayoutState({ width, height, view })` during layout measurement. The returned state includes:

- Viewport classification with orientation, size class, and device class.
- Navigation mode and route metadata.
- Content bounds after reserved navigation insets.
- Pane frames, presentation mode, minimum widths, and route targets.
- Explicit `horizontalOverflow: false` so platform implementations can assert against overlapping panes.

This contract does not render UI by itself. Native and web shells remain responsible for drawing their controls with platform components while preserving the route reachability and pane visibility decisions from the shared state.
