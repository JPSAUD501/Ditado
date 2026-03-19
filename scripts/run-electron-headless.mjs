import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)

const [scriptPath, ...scriptArgs] = process.argv.slice(2)

if (!scriptPath) {
  console.error('Usage: node scripts/run-electron-headless.mjs <script> [...args]')
  process.exit(1)
}

const electronBinary = require('electron')
const resolvedScriptPath = resolve(process.cwd(), scriptPath)
const shouldUseXvfb = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY

const command = shouldUseXvfb ? 'xvfb-run' : electronBinary
const args = shouldUseXvfb
  ? ['-a', electronBinary, resolvedScriptPath, ...scriptArgs]
  : [resolvedScriptPath, ...scriptArgs]

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: process.env.ELECTRON_DISABLE_SANDBOX ?? '1',
  },
})

child.on('error', (error) => {
  if (shouldUseXvfb && error.code === 'ENOENT') {
    console.error('xvfb-run is required for headless Linux Electron tasks but was not found in PATH.')
  } else {
    console.error(error)
  }

  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
