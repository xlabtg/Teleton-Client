# Teleton Client Web Alpha

This directory contains the React 18 + Vite web client for issue `#135`.

## Start

```sh
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173/app/`.

## Required Environment

Set Telegram API credentials before using live TDLib authentication:

```sh
VITE_TELEGRAM_API_ID=123456
VITE_TELEGRAM_API_HASH=your_hash
```

The sign-in screen supports both phone/code authorization and Telegram QR login. QR login calls TDLib `requestQrCodeAuthentication` and renders the `authorizationStateWaitOtherDeviceConfirmation.link` payload locally; no QR token is stored in `localStorage`.

The default Teleton Agent endpoints are:

```sh
VITE_TELETON_AGENT_WS_URL=ws://localhost:8765
VITE_TELETON_AGENT_MANAGEMENT_URL=https://localhost:7778
```

The WebSocket endpoint implements the issue contract with JSON-RPC 2.0 methods:

- `agent.enable({ session, userId })`
- `agent.disable()`
- `ton.getBalance({ address })`
- `ton.sendTx({ to, amount, comment })`

The Management API status button calls the current `teleton-agent` HTTPS API at `/v1/agent/status` with an optional `tltn_` Bearer key.

## TDWeb Assets

`npm install` runs `scripts/copy-tdweb-assets.mjs`, copying `node_modules/tdweb/dist/*` into `web/public/`.
Those generated WASM, worker, and memory files are intentionally not committed because they are large upstream runtime artifacts.

## Storage

Telegram session data is runtime-only by default. The sign-in screen can persist an encrypted session marker only after explicit user consent.

Proxy and agent settings are saved as AES-256-GCM envelopes in `localStorage`; the non-extractable browser key is stored in IndexedDB. Raw Telegram API hashes, proxy secrets, and agent API keys must stay out of source control.

## Checks

```sh
npm run test
npm run build
npm run preview
```

`npm audit --omit=dev` currently reports a moderate `tdweb -> uuid` advisory with no upstream fix available in `tdweb@1.8.0`. Keep that dependency under release review before publishing the alpha.

## Deploy

```sh
./deploy.sh
```

The script builds the app and uses `vercel` or `wrangler` when either CLI is installed.
