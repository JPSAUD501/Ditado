import { app } from 'electron'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export interface AutomationEnvironment {
  platform: string
  sessionType?: string | null
  supportsLetterByLetter: boolean
  reason?: string | null
}

interface AutomationBinding {
  warmup(): AutomationEnvironment
  getEnvironment(): AutomationEnvironment
  typeGrapheme(text: string): void
  typeText(text: string): void
}

export class AutomationServiceError extends Error {
  constructor(message: string, readonly code: string = 'automation_error') {
    super(message)
    this.name = 'AutomationServiceError'
  }
}

const resolveAddonPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'native', 'ditado_native_automation.node')
  }

  return join(app.getAppPath(), 'dist-electron', 'native', 'ditado_native_automation.node')
}

const resolveFallbackPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'native', 'ditado_native_automation.cjs')
  }

  return join(app.getAppPath(), 'dist-electron', 'native', 'ditado_native_automation.cjs')
}

export class AutomationService {
  private readonly require = createRequire(import.meta.url)
  private binding: AutomationBinding | null = null

  constructor(
    private readonly addonPath = resolveAddonPath(),
    private readonly fallbackPath = resolveFallbackPath(),
  ) {}

  warmup(): AutomationEnvironment {
    return this.loadBinding().warmup()
  }

  getEnvironment(): AutomationEnvironment {
    return this.loadBinding().getEnvironment()
  }

  typeGrapheme(text: string): void {
    this.loadBinding().typeGrapheme(text)
  }

  typeText(text: string): void {
    this.loadBinding().typeText(text)
  }

  dispose(): void {
    this.binding = null
  }

  private loadBinding(): AutomationBinding {
    if (this.binding) {
      return this.binding
    }

    try {
      const bindingPath = existsSync(this.addonPath)
        ? this.addonPath
        : existsSync(this.fallbackPath)
          ? this.fallbackPath
          : null

      if (!bindingPath) {
        throw new AutomationServiceError(
          `Native automation addon not found at ${this.addonPath}.`,
          'missing_addon',
        )
      }

      const loaded = this.require(bindingPath) as Partial<AutomationBinding>
      if (
        typeof loaded.warmup !== 'function' ||
        typeof loaded.getEnvironment !== 'function' ||
        typeof loaded.typeGrapheme !== 'function' ||
        typeof loaded.typeText !== 'function'
      ) {
        throw new AutomationServiceError(
          'Native automation addon does not expose the expected API.',
          'invalid_addon_api',
        )
      }

      this.binding = loaded as AutomationBinding
      return this.binding
    } catch (error) {
      if (error instanceof AutomationServiceError) {
        throw error
      }

      throw new AutomationServiceError(
        error instanceof Error ? error.message : 'Failed to load native automation addon.',
        'load_failed',
      )
    }
  }
}
