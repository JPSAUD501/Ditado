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
- `npm run clean`: remove renderer, preload, main, and release artifacts while preserving native outputs
- `npm run clean:native`: remove generated native addon outputs and Rust target directories

## Native addon note

`scripts/build-native-automation.mjs` always writes the JS fallback module and then tries to build the native addon. If the addon output file is locked on Windows, the build fails with a clear error instead of silently keeping a stale `.node` binary. Close any running Ditado or Node process that may have loaded the addon before rebuilding.
