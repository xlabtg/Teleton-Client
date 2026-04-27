# Release Packaging

Teleton Client release packaging is represented by the foundation artifact matrix in `src/foundation/release-artifacts.mjs`. The current repository does not contain native Gradle, Xcode, or Electron sources yet, so public CI builds unsigned debug artifact manifests that record the reviewed output contracts. Native package builders can replace the manifest-only commands once those platform sources land.

Pull requests do not receive signing secrets. Public CI runs `npm run build:debug-artifacts` and uploads unsigned debug manifests only. Signed release packages must be created from reviewed commits inside the protected environment named `release-signing`.

## Artifact Matrix

| Target | Release artifact | Debug build id | Debug artifact built by public CI | Runner | Signing boundary |
| --- | --- | --- | --- | --- | --- |
| Android | APK at `android/app/build/outputs/apk/release/app-release.apk` | `android-debug-apk` | APK contract at `android/app/build/outputs/apk/debug/app-debug.apk` | `ubuntu-latest` | Android keystore references resolved only in `release-signing` |
| iOS | IPA at `ios/build/ipa/TeletonClient.ipa` | `ios-debug-app-bundle` | Simulator app contract at `ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app` | `macos-latest` | Apple signing identities and export profiles resolved only in `release-signing` |
| macOS | DMG at `desktop/dist/macos/Teleton Client-${version}-macos-${arch}.dmg` | `desktop-macos-debug-app-bundle` | App bundle contract at `desktop/out/debug/macos-x64/Teleton Client.app` | `macos-latest` | Developer ID signing and notarization resolved only in `release-signing` |
| Windows | EXE installer at `desktop/dist/windows/Teleton Client Setup ${version}-${arch}.exe` | `desktop-windows-debug-exe` | Debug executable contract at `desktop/out/debug/windows-x64/Teleton Client.exe` | `windows-latest` | Authenticode certificate references resolved only in `release-signing` |
| Linux | AppImage at `desktop/dist/linux/Teleton Client-${version}-${arch}.AppImage` | `desktop-linux-debug-executable` | Debug executable contract at `desktop/out/debug/linux-x64/teleton-client` | `ubuntu-latest` | Optional AppImage signature references resolved only in `release-signing` |

## Public CI Debug Builds

The release validation workflow runs a matrix job for Android, iOS, macOS, Windows, and Linux debug targets. Each matrix entry:

- checks out the pull request code with read-only repository permissions;
- runs `npm run build:debug-artifacts -- --target <debug-build-id>`;
- uploads one JSON manifest through `actions/upload-artifact`;
- records `usesSigningSecrets: false` and `signsArtifacts: false`.

These manifests are review evidence, not signed installers. They keep the package paths, runner choices, and signing boundary visible before native build sources are introduced.

## Protected Signing And Publication

Release managers should prepare signed packages only after the pull request has merged and human release review has approved the version, changelog, license matrix, security audit, and platform wrapper contracts.

1. Check out the reviewed commit from `main` or a protected release tag.
2. Run the local validation commands from `BUILD-GUIDE.md`, including `npm run validate:release` and `npm run build:debug-artifacts`.
3. Enter the protected `release-signing` environment and resolve only secure references needed for the target package.
4. Produce the platform package: Gradle release APK, Xcode archive/export IPA, electron-builder DMG, electron-builder NSIS EXE, or electron-builder AppImage.
5. Sign, notarize, timestamp, or attach optional AppImage signatures according to the target row in the artifact matrix.
6. Attach the public CI debug manifest, security audit report, changelog preview, and signing evidence to the release review before publication.

Signing credentials, private keys, Apple certificates, Android keystores, Authenticode certificates, notarization tokens, wallet material, Telegram credentials, and private message data must not be pasted into pull requests, logs, issue comments, screenshots, fixtures, or committed configuration.
