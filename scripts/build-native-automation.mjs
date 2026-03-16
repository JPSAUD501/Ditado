import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const rootDir = process.cwd()
const crateDir = join(rootDir, 'native', 'ditado_native_automation')
const targetDir = join(rootDir, 'native', 'target')
const targetDirWsl = join(rootDir, 'native', 'target-wsl')
const outputDir = join(rootDir, 'dist-electron', 'native')
const outputPath = join(outputDir, 'ditado_native_automation.node')
const fallbackPath = join(outputDir, 'ditado_native_automation.cjs')

const libraryExtension =
  process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'

const artifactPath = join(targetDir, 'release', `ditado_native_automation.${libraryExtension}`)
const wslArtifactPath = join(
  targetDirWsl,
  'x86_64-pc-windows-msvc',
  'release',
  'ditado_native_automation.dll',
)

const toWslPath = (windowsPath) => {
  const normalized = windowsPath.replace(/\\/g, '/')
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (!driveMatch) {
    return normalized
  }

  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`
}

const tryWslBuild = () => {
  if (process.platform !== 'win32') {
    return false
  }

  try {
    execFileSync(
      'wsl.exe',
      [
        'bash',
        '-lc',
        [
          'set -euo pipefail',
          `cd '${toWslPath(rootDir)}'`,
          '~/.cargo/bin/cargo-xwin build --release ' +
            `--manifest-path '${toWslPath(join(crateDir, 'Cargo.toml'))}' ` +
            '--target x86_64-pc-windows-msvc ' +
            `--target-dir '${toWslPath(targetDirWsl)}'`,
        ].join('; '),
      ],
      { stdio: 'inherit' },
    )

    if (!existsSync(wslArtifactPath)) {
      throw new Error(`WSL artifact not found at ${wslArtifactPath}`)
    }

    copyFileSync(wslArtifactPath, outputPath)
    return true
  } catch {
    return false
  }
}

const tryNativeBuild = () => {
  try {
    execFileSync(
      'cargo',
      [
        'build',
        '--release',
        '--manifest-path',
        join(crateDir, 'Cargo.toml'),
        '--target-dir',
        targetDir,
      ],
      {
        stdio: 'inherit',
      },
    )
  } catch {
    return false
  }

  if (!existsSync(artifactPath)) {
    return false
  }

  copyFileSync(artifactPath, outputPath)
  return true
}

const fallbackSource = `'use strict'

const environment = {
  platform: process.platform,
  sessionType: process.platform === 'linux' ? process.env.XDG_SESSION_TYPE ?? null : null,
  supportsLetterByLetter: false,
  reason: 'native_addon_unavailable',
}

exports.warmup = () => environment
exports.getEnvironment = () => environment
exports.typeGrapheme = () => {
  throw new Error('Native automation addon unavailable in this environment.')
}
exports.typeText = () => {
  throw new Error('Native automation addon unavailable in this environment.')
}
`

mkdirSync(dirname(outputPath), { recursive: true })
rmSync(outputPath, { force: true })
writeFileSync(fallbackPath, fallbackSource, 'utf8')

if (tryWslBuild()) {
  console.log('[build-native-automation] Built native addon via WSL cargo-xwin.')
} else if (tryNativeBuild()) {
  console.log('[build-native-automation] Built native addon with the local Rust toolchain.')
} else {
  console.warn('[build-native-automation] Native addon build failed. Using JS automation fallback.')
  console.warn(
    '[build-native-automation] Install the Windows C++ toolchain or keep WSL cargo-xwin available to enable the napi-rs addon.',
  )
}
