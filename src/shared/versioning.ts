const versionsRequiringUpgradeOnboarding = new Set<string>([
  '0.1.44',
])

export const requiresUpgradeOnboarding = (version: string): boolean =>
  versionsRequiringUpgradeOnboarding.has(version)
