import { rmSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = process.cwd()
const targets = [
  join(rootDir, 'dist'),
  join(rootDir, 'dist-electron', 'main'),
  join(rootDir, 'dist-electron', 'preload'),
  join(rootDir, 'release'),
]

for (const target of targets) {
  rmSync(target, { recursive: true, force: true })
}
