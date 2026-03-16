import { mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = process.cwd()
const sourcePath = join(rootDir, 'workers', 'Ditado.InputWorker', 'Program.cs')
const outputPath = join(rootDir, 'dist-electron', 'helpers', 'Ditado.InputWorker.exe')

if (process.platform !== 'win32') {
  process.exit(0)
}

const frameworkDir = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319'
const cscPath = join(frameworkDir, 'csc.exe')
const systemWebExtensionsPath = join(frameworkDir, 'System.Web.Extensions.dll')

if (!existsSync(cscPath)) {
  throw new Error(`Unable to find csc.exe at ${cscPath}`)
}

mkdirSync(dirname(outputPath), { recursive: true })

execFileSync(
  cscPath,
  [
    '/nologo',
    '/target:exe',
    '/optimize+',
    `/out:${outputPath}`,
    `/reference:${systemWebExtensionsPath}`,
    sourcePath,
  ],
  {
    stdio: 'inherit',
  },
)
