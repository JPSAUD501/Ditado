import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 30_000
const DEFAULT_SERVICE_NAME = 'Ditado'

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

const normalizePositiveInt = (value, fallback) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeString = (value, fallback = null) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}

const normalizeHeaders = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, headerValue]) => typeof key === 'string' && key.trim() && headerValue != null)
        .map(([key, headerValue]) => [key.trim(), String(headerValue)]),
    )
  } catch {
    return {}
  }
}

const appendSignalPath = (baseUrl, signalPath) => {
  const normalizedBaseUrl = normalizeString(baseUrl)
  if (!normalizedBaseUrl) {
    return null
  }

  try {
    return new URL(signalPath, normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`).toString()
  } catch {
    return null
  }
}

export const resolveTelemetryBuildConfigFromEnv = (env = process.env) => {
  const enabled = normalizeBoolean(env.DITADO_BUILD_OTEL_ENABLED, false)
  const baseUrl = normalizeString(env.DITADO_BUILD_OTEL_BASE_URL)

  const derivedSignals = {
    traces: appendSignalPath(baseUrl, 'v1/traces'),
    logs: appendSignalPath(baseUrl, 'v1/logs'),
    metrics: appendSignalPath(baseUrl, 'v1/metrics'),
  }

  return {
    version: 1,
    enabled,
    serviceName: normalizeString(env.DITADO_BUILD_OTEL_SERVICE_NAME, DEFAULT_SERVICE_NAME),
    deploymentEnvironment: normalizeString(env.DITADO_BUILD_OTEL_DEPLOYMENT_ENV),
    timeoutMs: normalizePositiveInt(env.DITADO_BUILD_OTEL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    metricExportIntervalMs: normalizePositiveInt(
      env.DITADO_BUILD_OTEL_METRIC_EXPORT_INTERVAL_MS,
      DEFAULT_METRIC_EXPORT_INTERVAL_MS,
    ),
    headers: normalizeHeaders(env.DITADO_BUILD_OTEL_HEADERS_JSON),
    signals: {
      traces: normalizeString(env.DITADO_BUILD_OTEL_TRACES_URL, derivedSignals.traces),
      logs: normalizeString(env.DITADO_BUILD_OTEL_LOGS_URL, derivedSignals.logs),
      metrics: normalizeString(env.DITADO_BUILD_OTEL_METRICS_URL, derivedSignals.metrics),
    },
  }
}

export const writeTelemetryBuildConfigFile = async (filePath, env = process.env) => {
  const config = resolveTelemetryBuildConfigFromEnv(env)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(config, null, 2), 'utf8')
  return config
}
