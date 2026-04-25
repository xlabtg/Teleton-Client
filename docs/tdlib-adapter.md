# TDLib Adapter Boundary

The shared TDLib adapter is the first boundary between platform callers and a future native TDLib bridge. It does not link TDLib yet, does not connect to Telegram, and does not require live Telegram credentials for tests.

## Supported Callers

- Android callers use the same adapter contract over a JVM or native bridge that owns TDLib lifecycle and secure storage lookup.
- iOS callers use the same adapter contract over a Swift or Objective-C bridge that owns TDLib lifecycle and keychain lookup.
- desktop callers use the same adapter contract over a local native module, helper process, or IPC bridge for Linux, macOS, and Windows.
- web-compatible callers use the same adapter contract over a local companion service or trusted backend bridge. Raw TDLib binaries and Telegram credentials must not be shipped into an untrusted browser runtime.

## Contract

The adapter exposes core client operations:

- `authenticate(request)` validates Telegram credential references before the platform bridge begins TDLib authorization.
- `getChatList(query)` returns a bounded page of chats with an adapter-owned cursor.
- `sendMessage(draft)` validates chat and text inputs before the platform bridge sends a message.
- `subscribeUpdates(listener, options)` registers a typed update listener and returns an unsubscribe function.

The adapter also exposes proxy lifecycle operations that build TDLib-compatible commands before the native bridge sends them:

- `enableProxy(config)` validates MTProto or SOCKS5 settings and maps them to `addProxy`.
- `updateProxy(proxyId, config)` validates an existing TDLib proxy id and maps settings to `editProxy`.
- `disableProxy()` maps to `disableProxy`.
- `removeProxy(proxyId)` validates the TDLib proxy id and maps to `removeProxy`.

Authentication accepts secure references only:

```js
{
  apiIdRef: 'env:TELEGRAM_API_ID',
  apiHashRef: 'keychain:telegram-api-hash',
  phoneNumberRef: 'keystore:telegram-phone'
}
```

The shared adapter rejects raw `apiId`, `api_id`, `apiHash`, `api_hash`, `phoneNumber`, and `botToken` values. Platform bridges are responsible for resolving references through environment variables, keychains, keystores, secret managers, or equivalent local secure storage.

Proxy settings follow the same rule. MTProto requires `secretRef`, while SOCKS5 accepts optional `usernameRef` and `passwordRef`. Raw proxy secrets and credentials are rejected before native bridge calls. Platform bridges must resolve those references inside platform secure storage and pass the resolved values only to TDLib-native APIs, never back through shared logs or command snapshots.

## Mock Testing

`createMockTdlibClientAdapter` implements the same public contract without TDLib, Telegram network access, phone numbers, bot tokens, proxy secrets, or live user credentials. Tests can seed chat fixtures, send mock messages, subscribe to mock updates, and verify proxy command mapping while preserving the same validation path used by native bridge adapters.

## Build Targets

TDLib integration work should produce native artifacts for these targets before platform wrappers consume them:

- Android: NDK and CMake builds for the supported Android ABIs, packaged through the Android app wrapper.
- iOS: CMake or Xcode builds for device and simulator architectures, packaged as a framework or library consumed by the iOS app wrapper.
- desktop: CMake builds for Linux, macOS, and Windows, exposed through a native module or helper process.
- web-compatible: no direct browser TDLib binary in the foundation layer. Use a local companion service or backend bridge that implements this adapter contract.

## Licensing

TDLib is distributed under the Boost Software License 1.0 (`BSL-1.0`). Future build scripts and packaged artifacts must preserve upstream license notices, record the TDLib source revision used for reproducible builds, and document any local patches. The repository MIT license does not replace TDLib's upstream license obligations.
