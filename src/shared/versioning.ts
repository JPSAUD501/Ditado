const versionsRequiringUpgradeOnboarding = new Set<string>([
  '0.1.48',
])

export const requiresUpgradeOnboarding = (version: string): boolean =>
  versionsRequiringUpgradeOnboarding.has(version)
