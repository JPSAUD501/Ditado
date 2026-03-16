import { rmSync } from 'node:fs'
import { join } from 'node:path'

const LOCK_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])

const isLockError = (error) =>
  Boolean(error && typeof error === 'object' && 'code' in error && LOCK_ERROR_CODES.has(error.code))

const rootDir = process.cwd()
const targets = [
  join(rootDir, 'dist-electron', 'native'),
  join(rootDir, 'native', 'target'),
  join(rootDir, 'native', 'target-wsl'),
]

for (const target of targets) {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch (error) {
    if (isLockError(error)) {
      throw new Error(
        `Failed to remove native artifacts at ${target}. A running Ditado or Node process is still holding the native addon. Close it and run npm run clean:native again.`,
      )
    }

    throw error
  }
}
