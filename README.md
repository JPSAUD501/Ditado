# Ditado

Ditado is a desktop dictation overlay for writing into other apps. It captures audio in the renderer, coordinates dictation in Electron's main process, and inserts text into the focused app through a native automation addon with clipboard fallback behavior.

## Stack

- Electron for windows, tray, shortcuts, IPC, and OS integration
- React + Vite for the dashboard and overlay UI
- TypeScript across renderer, preload, and main process code
- Rust (`napi-rs`) for the native automation addon
- Vitest and Playwright for test coverage

## Prerequisites

- Node.js 20+ and npm
- A supported desktop OS for runtime development
- Rust only when building the native automation addon locally
- On Windows, WSL plus `cargo-xwin` can be used as an alternate addon build path

## Commands

- `npm run dev`: build the native automation layer, start TypeScript watchers, Vite, and Electron
- `npm test`: run the Vitest suite
- `npm run lint`: run ESLint
- `npm run build`: create production renderer and Electron bundles
- `npm run package`: build the app and package it with `electron-builder`
- `npm run release:github -- --win nsis`: build and publish a Windows NSIS release to GitHub Releases
- `npm run release:github -- --linux AppImage deb`: build and publish a Linux AppImage + DEB release to GitHub Releases
- `npm run clean`: remove renderer, preload, main, and release artifacts while preserving native outputs
- `npm run clean:native`: remove generated native addon outputs and Rust target directories

## Native addon note

`scripts/build-native-automation.mjs` always writes the JS fallback module and then tries to build the native addon. If the addon output file is locked on Windows, the build fails with a clear error instead of silently keeping a stale `.node` binary. Close any running Ditado or Node process that may have loaded the addon before rebuilding.

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, tests, typecheck, and build validation on Windows, macOS, and Linux for pushes to `main` and pull requests.
- `.github/workflows/release.yml` watches pushes to `beta` and `main` and bumps the app version automatically.
- A push to `beta` creates the next prerelease version, commits it back to `beta`, creates the matching `v<version>` tag, and publishes a GitHub prerelease.
- A push to `main` promotes the latest beta line to a stable release when one exists; otherwise it bumps the stable patch version, commits it back to `main`, tags it, and publishes a GitHub release.
- Release artifacts are built from the auto-generated release commit, so the packaged app version matches the Git tag and GitHub Release exactly.

## Auto-update

- Releases are published through GitHub Releases and consumed in the packaged app through `electron-updater`.
- The app checks for updates after startup, honors the `stable` or `beta` update channel from settings, downloads updates automatically when enabled, and installs them on the next app quit after the download completes.
- Windows uses the NSIS updater feed and Linux release metadata is generated for the AppImage and DEB targets published by `electron-builder`.
- macOS remains configured in `electron-builder`, but GitHub release publishing for Apple is disabled until signing is set up.
- The dashboard settings include a `Receive beta builds` toggle. When it is off, the app follows stable releases from `main`. When it is on, the app follows prereleases from `beta`.
