# Desktop Wrapper

The desktop wrapper contract selects an Electron runtime with a web renderer, isolated preload bridge, and `electron-builder` packaging for Linux, macOS, and Windows. The app id is `dev.teleton.client`, the product name is `Teleton Client`, and the shared integration boundary matches the mobile wrappers: TDLib, settings, Teleton Agent, proxy, and TON.

This repository still keeps the implementation dependency-free, so the wrapper is modeled as a shared contract that future Electron sources can consume. The contract records runnable debug artifact metadata, tray menu behavior, desktop notification requests, local and global shortcuts from the shared input action map, autostart settings, protocol routing, and packaging targets.

## Debug Artifacts

Debug artifact contracts are runnable local outputs rather than signed installers:

- macOS: `desktop/out/debug/macos-x64/Teleton Client.app`.
- Windows: `desktop/out/debug/windows-x64/Teleton Client.exe`.
- Linux: `desktop/out/debug/linux-x64/teleton-client`.

The Electron main process entry is reserved as `desktop/main.mjs`, with `desktop/preload.mjs` as the isolated bridge and `desktop/renderer` as the web UI entry. Future native sources must keep `contextIsolation: true`, `nodeIntegration: false`, and renderer sandboxing enabled.

## Tray Menu

The desktop tray uses `Electron Tray` and exposes expected messenger controls without serializing private message content:

- Open the main window.
- Jump to unread messages when the unread count is nonzero.
- Open the local Teleton Agent runtime view.
- Open the TON wallet view.
- Toggle notification mute state.
- Toggle launch-at-login state.
- Quit the app.

Unread count and agent status may appear in tray labels and badges, but message text, chat titles, prompts, wallet secrets, proxy credentials, and tokens must not be placed in tray menu state.

## Notifications

Desktop notification requests use `Electron Notification` and the operating system notification center. The wrapper maps shared notification events to four categories:

- `messages` for Telegram message events.
- `agent_actions` for approval-required Teleton Agent action events.
- `agent_runtime` for local agent runtime status.
- `wallet` for TON wallet and transaction status events.

Approval-required agent actions are critical and always delivered because they block agent progress. Informational notifications respect shared notification settings. Serialized payload metadata is redacted before dispatch, and message or wallet notifications use lock-screen-safe fallback copy unless a shared event supplies explicit redacted text.

The shared push notification plan applies category preferences before creating an Electron system notification request. If the operating system notification center is denied or unavailable, the plan returns an explicit permission failure with an in-app fallback so the desktop shell can explain the disabled state.

## Shortcuts

Focused-window shortcuts use `BrowserWindow webContents before-input-event`. Opt-in global shortcuts use `Electron globalShortcut`. Both lists are generated from the shared input action map in `src/platform/action-map.mjs` so desktop bindings use the same route ids as mobile gestures.

Default focused-window shortcuts:

- `CommandOrControl+K` to search messages.
- `CommandOrControl+N` to compose a message.
- `Alt+ArrowDown` and `Alt+ArrowUp` to move between chats.
- `CommandOrControl+Shift+A` to open an agent quick action draft with explicit user confirmation.
- `CommandOrControl+Shift+W` to open the TON wallet.
- `CommandOrControl+Shift+X` to open a TON transfer review draft with explicit user confirmation.

Default global shortcuts:

- `CommandOrControl+Shift+T` to show or hide the main window.
- `CommandOrControl+Shift+M` to toggle notification mute state.

Global shortcuts must be user-controlled because they reserve operating system key combinations outside the app window.

The desktop shortcut plan includes a collision report before native registration. Duplicate accelerators in the same focused-window scope or the same global registration scope are blocking conflicts; the default map reports no conflicts. Native Electron sources must treat global shortcut registration failures as platform conflicts and leave the visible menu or button path available.

Risky shortcuts for agent and wallet transaction actions are marked `review-required`, carry `requiresUserConfirmation: true`, and can be filtered out through `input.riskyActionBindings.enabled` or per-action disabled ids. Disabling those shortcuts does not disable the underlying review workflows, so users can still reach them through visible controls.

Shortcut accessibility requirements:

- Every shortcut action must have a visible control or menu item with the same route.
- Focused-window shortcuts must not trap text input fields.
- Global shortcuts must be opt-in and discoverable in settings.
- Risky agent and TON transfer shortcuts must keep the same confirmation screen as visible controls.

## Autostart

Autostart is disabled by default and must stay user-controlled.

macOS and Windows use Electron `app.setLoginItemSettings`. macOS maps to a ServiceManagement login item, while Windows maps to the current-user Run key behavior managed by Electron. Both platforms support hidden startup by passing `--hidden`.

Linux uses XDG Autostart with `~/.config/autostart/dev.teleton.client.desktop`. The generated desktop entry sets `X-GNOME-Autostart-enabled` from the user preference and adds `--hidden` when the user enables hidden startup.

## Protocol Handlers

Electron registers protocol handlers through `app.setAsDefaultProtocolClient` for `teleton`, `tg`, and `ton`. Telegram web links for `https://t.me` and `https://telegram.me` are modeled as app links where the operating system or browser hands the URL to the desktop app.

Supported Telegram routes include:

- `tg://resolve?domain=teleton` to `messaging.openChat`.
- `tg://resolve?domain=teleton&post=42` to `messaging.openMessage`.
- `https://t.me/teleton/42` to `messaging.openMessage`.

Supported TON routes include:

- `ton://transfer/EQExampleAddress?amount=1000&text=coffee` to `ton.transfer.review`.
- `ton://dns/example.ton` to `ton.dns.resolve`.

All TON transfer links route to a review workflow with `requiresConfirmation: true`; the wrapper contract never treats a link as authorization to sign or broadcast a transaction.

## Packaging

Release packaging targets are:

- macOS DMG through the `dmg` electron-builder target, with Developer ID signing and notarization before distribution.
- Windows EXE through the NSIS electron-builder target, with Authenticode signing before updates or installer distribution.
- Linux AppImage through the `AppImage` electron-builder target, with a `dev.teleton.client.desktop` entry and optional AppImage signature.

Public CI may build unsigned debug artifacts, but signed DMG, EXE, and AppImage release artifacts require protected credentials and human release review.
