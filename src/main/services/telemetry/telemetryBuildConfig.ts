import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const telemetryBuildConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  serviceName: z.string().trim().min(1).default('Ditado'),
  deploymentEnvironment: z.string().trim().min(1).nullable().default(null),
  timeoutMs: z.number().int().positive().default(10_000),
  metricExportIntervalMs: z.number().int().positive().default(30_000),
  headers: z.record(z.string(), z.string()).default({}),
  signals: z.object({
    traces: z.string().trim().min(1).nullable().default(null),
    logs: z.string().trim().min(1).nullable().default(null),
    metrics: z.string().trim().min(1).nullable().default(null),
  }),
})

export type TelemetryBuildConfig = z.infer<typeof telemetryBuildConfigSchema>

export const disabledTelemetryBuildConfig: TelemetryBuildConfig = {
  version: 1,
  enabled: false,
  serviceName: 'Ditado',
  deploymentEnvironment: null,
  timeoutMs: 10_000,
  metricExportIntervalMs: 30_000,
  headers: {},
  signals: {
    traces: null,
    logs: null,
    metrics: null,
  },
}

export const resolveTelemetryBuildConfigPath = (
  electronApp: Pick<Electron.App, 'isPackaged' | 'getAppPath'> = app,
): string =>
  electronApp.isPackaged
    ? join(process.resourcesPath, 'config', 'telemetry.build.json')
    : join(electronApp.getAppPath(), 'build-config', 'telemetry.build.json')

export const loadTelemetryBuildConfig = async (
  electronApp: Pick<Electron.App, 'isPackaged' | 'getAppPath'> = app,
): Promise<TelemetryBuildConfig> => {
  try {
    const raw = await readFile(resolveTelemetryBuildConfigPath(electronApp), 'utf8')
    return telemetryBuildConfigSchema.parse(JSON.parse(raw))
  } catch {
    return disabledTelemetryBuildConfig
  }
}
