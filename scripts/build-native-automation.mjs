import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = process.cwd()
const crateDir = join(rootDir, 'native', 'ditado_native_automation')
const targetDir = join(rootDir, 'native', 'target')
const targetDirWsl = join(rootDir, 'native', 'target-wsl')
const outputDir = join(rootDir, 'dist-electron', 'native')
const outputPath = join(outputDir, 'ditado_native_automation.node')
const fallbackPath = join(outputDir, 'ditado_native_automation.cjs')
const LOCK_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])

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

export const isLockError = (error) =>
  Boolean(error && typeof error === 'object' && 'code' in error && LOCK_ERROR_CODES.has(error.code))

export const createLockedAddonError = (filePath, action, cause) =>
  new Error(
    `Failed to ${action} ${filePath}. A running Ditado or Node process is still holding the native addon. Close the process and rerun the build.`,
    cause ? { cause } : undefined,
  )

const removeAddonOutput = (filePath, action = 'replace') => {
  try {
    rmSync(filePath, { force: true })
  } catch (error) {
    if (isLockError(error)) {
      throw createLockedAddonError(filePath, action, error)
    }

    throw error
  }
}

export const syncNativeAddonOutput = ({
  artifactFilePath,
  destinationFilePath,
  removeFile = removeAddonOutput,
  copyFile = copyFileSync,
}) => {
  try {
    removeFile(destinationFilePath, 'replace')
  } catch (error) {
    if (isLockError(error)) {
      throw createLockedAddonError(destinationFilePath, 'replace', error)
    }

    throw error
  }

  try {
    copyFile(artifactFilePath, destinationFilePath)
  } catch (error) {
    if (isLockError(error)) {
      throw createLockedAddonError(destinationFilePath, 'replace', error)
    }

    throw error
  }
}

export const clearNativeAddonOutput = ({
  destinationFilePath,
  removeFile = removeAddonOutput,
}) => {
  try {
    removeFile(destinationFilePath, 'clear')
  } catch (error) {
    if (isLockError(error)) {
      throw createLockedAddonError(destinationFilePath, 'clear', error)
    }

    throw error
  }
}

const tryWslBuild = () => {
  if (process.platform !== 'win32') {
    return null
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

    return wslArtifactPath
  } catch {
    return null
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
    return null
  }

  if (!existsSync(artifactPath)) {
    return null
  }

  return artifactPath
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

export const runBuildNativeAutomation = () => {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(fallbackPath, fallbackSource, 'utf8')

  const wslArtifact = tryWslBuild()
  if (wslArtifact) {
    syncNativeAddonOutput({
      artifactFilePath: wslArtifact,
      destinationFilePath: outputPath,
    })
    console.log('[build-native-automation] Built native addon via WSL cargo-xwin.')
    return
  }

  const nativeArtifact = tryNativeBuild()
  if (nativeArtifact) {
    syncNativeAddonOutput({
      artifactFilePath: nativeArtifact,
      destinationFilePath: outputPath,
    })
    console.log('[build-native-automation] Built native addon with the local Rust toolchain.')
    return
  }

  clearNativeAddonOutput({
    destinationFilePath: outputPath,
  })
  console.warn('[build-native-automation] Native addon build failed. Using JS automation fallback.')
  console.warn(
    '[build-native-automation] Install the Windows C++ toolchain or keep WSL cargo-xwin available to enable the napi-rs addon.',
  )
}

const isEntrypoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isEntrypoint) {
  try {
    runBuildNativeAutomation()
  } catch (error) {
    console.error(
      `[build-native-automation] ${error instanceof Error ? error.message : 'Unexpected build failure.'}`,
    )
    process.exitCode = 1
  }
}
