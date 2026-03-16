import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const VERSION_RE = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-beta\.(?<beta>\d+))?$/

const rootDir = process.cwd()
const packageJsonPath = join(rootDir, 'package.json')
const packageLockPath = join(rootDir, 'package-lock.json')

const compareNumber = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

export const parseVersion = (value) => {
  const match = value.match(VERSION_RE)
  if (!match?.groups) {
    throw new Error(`Unsupported version format: ${value}`)
  }

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    beta: match.groups.beta ? Number.parseInt(match.groups.beta, 10) : null,
  }
}

export const formatCoreVersion = (version) => `${version.major}.${version.minor}.${version.patch}`

export const formatVersion = (version) =>
  version.beta === null ? formatCoreVersion(version) : `${formatCoreVersion(version)}-beta.${version.beta}`

export const compareCoreVersions = (left, right) =>
  compareNumber(left.major, right.major) ||
  compareNumber(left.minor, right.minor) ||
  compareNumber(left.patch, right.patch)

const incrementPatch = (version) => ({
  major: version.major,
  minor: version.minor,
  patch: version.patch + 1,
  beta: null,
})

const maxCoreVersion = (left, right) => (compareCoreVersions(left, right) >= 0 ? left : right)

export const getGitVersions = ({
  listTags = () =>
    execFileSync('git', ['tag', '--list', 'v*'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
} = {}) =>
  listTags()
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => ({
      tag,
      version: parseVersion(tag.replace(/^v/, '')),
    }))

const getLatestStableVersion = (versions) =>
  versions
    .filter(({ version }) => version.beta === null)
    .map(({ version }) => version)
    .reduce((latest, current) => (latest && compareCoreVersions(latest, current) >= 0 ? latest : current), null)

const getHighestBetaForCore = (versions, coreVersion) =>
  versions
    .filter(
      ({ version }) =>
        version.beta !== null &&
        version.major === coreVersion.major &&
        version.minor === coreVersion.minor &&
        version.patch === coreVersion.patch,
    )
    .reduce((highest, { version }) => (highest !== null && highest >= version.beta ? highest : version.beta), null)

const getLatestBetaCoreAfter = (versions, stableVersion) =>
  versions
    .filter(({ version }) => version.beta !== null)
    .map(({ version }) => ({
      major: version.major,
      minor: version.minor,
      patch: version.patch,
      beta: null,
    }))
    .filter((version) => !stableVersion || compareCoreVersions(version, stableVersion) > 0)
    .reduce((latest, current) => (latest && compareCoreVersions(latest, current) >= 0 ? latest : current), null)

export const computeNextVersion = ({ branch, currentVersion, versions }) => {
  const parsedCurrentVersion = parseVersion(currentVersion)
  const currentCoreVersion = {
    major: parsedCurrentVersion.major,
    minor: parsedCurrentVersion.minor,
    patch: parsedCurrentVersion.patch,
    beta: null,
  }
  const latestStableVersion = getLatestStableVersion(versions)

  if (branch === 'beta') {
    const minimumCoreVersion = latestStableVersion ? incrementPatch(latestStableVersion) : currentCoreVersion
    const targetCoreVersion =
      compareCoreVersions(currentCoreVersion, minimumCoreVersion) >= 0
        ? currentCoreVersion
        : minimumCoreVersion
    const highestBeta = getHighestBetaForCore(versions, targetCoreVersion)

    return {
      version: formatVersion({
        ...targetCoreVersion,
        beta: highestBeta === null ? 1 : highestBeta + 1,
      }),
      publishChannel: 'beta',
      releaseType: 'prerelease',
      prerelease: true,
    }
  }

  if (branch === 'main') {
    const latestBetaCore = getLatestBetaCoreAfter(versions, latestStableVersion)
    let targetCoreVersion = currentCoreVersion

    if (latestBetaCore) {
      targetCoreVersion = maxCoreVersion(targetCoreVersion, latestBetaCore)
    }

    if (latestStableVersion && compareCoreVersions(targetCoreVersion, latestStableVersion) <= 0) {
      targetCoreVersion = incrementPatch(latestStableVersion)
    }

    return {
      version: formatVersion(targetCoreVersion),
      publishChannel: 'latest',
      releaseType: 'release',
      prerelease: false,
    }
  }

  throw new Error(`Unsupported release branch: ${branch}`)
}

const updateManifestVersion = (filePath, updater) => {
  const source = readFileSync(filePath, 'utf8')
  const manifest = JSON.parse(source)
  updater(manifest)
  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

export const applyVersionToManifests = (version) => {
  updateManifestVersion(packageJsonPath, (manifest) => {
    manifest.version = version
  })

  if (existsSync(packageLockPath)) {
    updateManifestVersion(packageLockPath, (manifest) => {
      manifest.version = version
      if (manifest.packages?.['']) {
        manifest.packages[''].version = version
      }
    })
  }
}

const getArgument = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return null
  }

  return process.argv[index + 1] ?? null
}

const branch = getArgument('--branch')
const shouldApply = process.argv.includes('--apply')
const isEntrypoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntrypoint) {
  if (!branch) {
    throw new Error('Missing required --branch argument.')
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const nextRelease = computeNextVersion({
    branch,
    currentVersion: packageJson.version,
    versions: getGitVersions(),
  })

  if (shouldApply) {
    applyVersionToManifests(nextRelease.version)
  }

  process.stdout.write(
    `${JSON.stringify({
      ...nextRelease,
      releaseTag: `v${nextRelease.version}`,
    })}\n`,
  )
}
