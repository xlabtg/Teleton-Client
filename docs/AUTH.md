# Authentication

Teleton Client Web uses TDWeb/TDLib authorization. The alpha supports two interactive user flows:

- Phone number, one-time code, and optional two-step password.
- Telegram QR login through TDLib native QR authorization.

## Telegram API Credentials

The browser client still needs `VITE_TELEGRAM_API_ID` and `VITE_TELEGRAM_API_HASH` from `.env` before either sign-in method can start. These values are read by the TDLib service and are not hardcoded in source.

## Phone Sign-In

The default flow follows the TDLib authorization state machine:

1. `authorizationStateWaitPhoneNumber`
2. `setAuthenticationPhoneNumber`
3. `authorizationStateWaitCode`
4. `checkAuthenticationCode`
5. `authorizationStateWaitPassword`, when the account requires two-step verification
6. `authorizationStateReady`

Telegram session data remains runtime-only by default. The UI can save an encrypted session marker only after explicit user consent.

## QR Sign-In

The QR option uses TDLib directly instead of a separate web backend. When TDLib is in `authorizationStateWaitPhoneNumber`, the client calls `requestQrCodeAuthentication` with an empty `other_user_ids` list. TDLib then emits `authorizationStateWaitOtherDeviceConfirmation` with a `link` field. The UI renders that `tg://` link as a QR code and refreshes it whenever TDLib sends a new link.

The QR payload is never stored in localStorage. The rendered code is derived from the latest in-memory TDLib authorization update and is cleared when the user switches back to phone login, restarts auth, or reaches `authorizationStateReady`.

## Security Notes

- Do not add bot tokens, Telegram API hashes, or session strings to source control.
- Do not place login tokens in URLs owned by the web app.
- Keep QR payloads one-session only and in memory.
- If a future backend flow is added, implement short TTLs, single-use server state, rate limiting, and audit logging before exposing it.
