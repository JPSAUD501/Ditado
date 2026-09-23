import { describe, expect, it } from 'vitest'

import { expectedRuntimePackages, findMissingPackages } from './verify-packaged-dependencies.mjs'

const lockfile = {
  packages: {
    '': { name: 'ditado' },
    'node_modules/date-fns': { version: '4.3.0', peer: true },
    'node_modules/date-fns-tz': { version: '3.2.0' },
    'node_modules/@opentelemetry/api': { version: '1.9.0' },
    'node_modules/@types/react': { version: '19.0.0' },
    'node_modules/electron-updater/node_modules/semver': { version: '7.7.0' },
    'node_modules/vitest': { version: '3.2.4', dev: true },
    'node_modules/@esbuild/darwin-arm64': { version: '0.25.0', optional: true },
  },
}

const runtimePackages = new Set([
  'node_modules/date-fns',
  'node_modules/date-fns-tz',
  'node_modules/@opentelemetry/api',
])

describe('verify-packaged-dependencies', () => {
  it('expects top-level production packages with runtime code, including peer-installed ones', () => {
    expect(expectedRuntimePackages(lockfile, (path) => runtimePackages.has(path))).toEqual([
      'node_modules/date-fns',
      'node_modules/date-fns-tz',
      'node_modules/@opentelemetry/api',
    ])
  })

  it('reports packages whose package.json is not in the asar', () => {
    const asarEntries = [
      '\\node_modules\\date-fns-tz',
      '\\node_modules\\date-fns-tz\\package.json',
      '\\node_modules\\@opentelemetry\\api\\package.json',
    ]

    expect(findMissingPackages([...runtimePackages], asarEntries)).toEqual(['node_modules/date-fns'])
  })
})
