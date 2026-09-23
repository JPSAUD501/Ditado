// Fails when a top-level production package from package-lock.json is missing from the packaged app.asar.
// electron-builder skips packages that npm only installed to satisfy a peer dependency
// ("peer": true in the lockfile), and the app then crashes at startup with ERR_MODULE_NOT_FOUND
// (Ditado 0.1.61: date-fns, the peer of syncorejs' date-fns-tz).
//
// Nested node_modules are not checked: electron-builder re-hoists them and prunes the build-time
// dependencies of native modules, so their lockfile paths don't map to the asar.
//
// Usage: node scripts/verify-packaged-dependencies.mjs [path/to/app.asar]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listPackage } from '@electron/asar'

const rootDir = process.cwd()

const findPackagedAsar = () => {
  const releaseDir = join(rootDir, 'release')
  if (!existsSync(releaseDir)) {
    return null
  }
  for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const candidates = [
      join(releaseDir, entry.name, 'resources', 'app.asar'),
      join(releaseDir, entry.name, 'Ditado.app', 'Contents', 'Resources', 'app.asar'),
    ]
    const found = candidates.find((candidate) => existsSync(candidate))
    if (found) {
      return found
    }
  }
  return null
}

const isTopLevelPackage = (path) => /^node_modules\/(@[^/]+\/)?[^/@][^/]*$/.test(path)

// Type-only packages (@types/*, csstype) have no runtime code and are dropped on purpose.
const hasRuntimeCode = (packageDir) => {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) {
    return false
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name?.startsWith('@types/')) {
    return false
  }
  return Boolean(manifest.main || manifest.exports || manifest.module) || existsSync(join(packageDir, 'index.js'))
}

export const expectedRuntimePackages = (lockfile, isRuntimePackage) =>
  Object.entries(lockfile.packages ?? {})
    .filter(([path, meta]) => isTopLevelPackage(path) && !meta.dev && !meta.link)
    .map(([path]) => path)
    // Also skips optional packages for other platforms, which are never installed.
    .filter((path) => isRuntimePackage(path))

export const findMissingPackages = (expected, asarEntries) => {
  const packaged = new Set(asarEntries.map((entry) => entry.replaceAll('\\', '/').replace(/^\//, '')))
  return expected.filter((path) => !packaged.has(`${path}/package.json`))
}

const main = () => {
  const asarPath = process.argv[2] ?? findPackagedAsar()
  if (!asarPath || !existsSync(asarPath)) {
    console.error('No packaged app.asar found. Run `electron-builder --dir` first or pass the path.')
    process.exit(1)
  }

  const lockfile = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'))
  const expected = expectedRuntimePackages(lockfile, (path) => hasRuntimeCode(join(rootDir, path)))
  const missing = findMissingPackages(expected, listPackage(asarPath, { isPack: false }))

  if (missing.length > 0) {
    console.error(`${missing.length} production dependencies are missing from ${asarPath}:`)
    for (const path of missing) {
      console.error(`  - ${path.replace(/^node_modules\//, '')}`)
    }
    console.error('If npm only installed them for a peer dependency, add them to "dependencies".')
    process.exit(1)
  }

  console.log(`All ${expected.length} top-level production dependencies are packaged in ${asarPath}.`)
}

const isEntrypoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntrypoint) {
  main()
}
