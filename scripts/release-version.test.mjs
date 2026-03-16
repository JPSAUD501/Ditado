import { describe, expect, it } from 'vitest'

import { computeNextVersion, parseVersion } from './release-version.mjs'

const tag = (value) => ({
  tag: `v${value}`,
  version: parseVersion(value),
})

describe('release-version', () => {
  it('increments beta prereleases from the next patch after the latest stable release', () => {
    const nextRelease = computeNextVersion({
      branch: 'beta',
      currentVersion: '0.1.0',
      versions: [tag('0.1.0')],
    })

    expect(nextRelease.version).toBe('0.1.1-beta.1')
    expect(nextRelease.publishChannel).toBe('beta')
    expect(nextRelease.prerelease).toBe(true)
  })

  it('continues the current beta line when beta prereleases already exist', () => {
    const nextRelease = computeNextVersion({
      branch: 'beta',
      currentVersion: '0.1.1-beta.2',
      versions: [tag('0.1.0'), tag('0.1.1-beta.1'), tag('0.1.1-beta.2')],
    })

    expect(nextRelease.version).toBe('0.1.1-beta.3')
  })

  it('promotes the latest beta line to a stable main release', () => {
    const nextRelease = computeNextVersion({
      branch: 'main',
      currentVersion: '0.1.1-beta.3',
      versions: [tag('0.1.0'), tag('0.1.1-beta.1'), tag('0.1.1-beta.3')],
    })

    expect(nextRelease.version).toBe('0.1.1')
    expect(nextRelease.publishChannel).toBe('latest')
    expect(nextRelease.prerelease).toBe(false)
  })

  it('increments the patch on main when no beta line is pending promotion', () => {
    const nextRelease = computeNextVersion({
      branch: 'main',
      currentVersion: '0.1.1',
      versions: [tag('0.1.1')],
    })

    expect(nextRelease.version).toBe('0.1.2')
  })
})
