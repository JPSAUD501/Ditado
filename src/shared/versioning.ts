const shortcutMigrationVersion = '0.1.48'

const parseVersion = (version: string): number[] =>
  version
    .split('.')
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })

const compareVersions = (left: string, right: string): number => {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

export const requiresUpgradeOnboarding = (
  currentVersion: string,
  previousVersion: string | null | undefined,
): boolean => {
  if (!previousVersion) {
    return false
  }

  return (
    compareVersions(previousVersion, shortcutMigrationVersion) < 0
    && compareVersions(currentVersion, shortcutMigrationVersion) >= 0
  )
}
