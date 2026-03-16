import { describe, expect, it } from 'vitest'

import { resolveTelemetryBuildConfigFromEnv } from './telemetryBuildConfig.mjs'

describe('resolveTelemetryBuildConfigFromEnv', () => {
  it('returns disabled defaults when no environment variables are provided', () => {
    expect(resolveTelemetryBuildConfigFromEnv({})).toEqual({
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
    })
  })

  it('derives signal endpoints from the base url', () => {
    const config = resolveTelemetryBuildConfigFromEnv({
      DITADO_BUILD_OTEL_ENABLED: 'true',
      DITADO_BUILD_OTEL_BASE_URL: 'https://otel.example.com/custom-root',
    })

    expect(config.enabled).toBe(true)
    expect(config.signals).toEqual({
      traces: 'https://otel.example.com/custom-root/v1/traces',
      logs: 'https://otel.example.com/custom-root/v1/logs',
      metrics: 'https://otel.example.com/custom-root/v1/metrics',
    })
  })

  it('prefers explicit per-signal urls over the derived base url endpoints', () => {
    const config = resolveTelemetryBuildConfigFromEnv({
      DITADO_BUILD_OTEL_ENABLED: 'true',
      DITADO_BUILD_OTEL_BASE_URL: 'https://otel.example.com/base',
      DITADO_BUILD_OTEL_TRACES_URL: 'https://otel.example.com/direct/traces',
      DITADO_BUILD_OTEL_LOGS_URL: 'https://otel.example.com/direct/logs',
    })

    expect(config.signals).toEqual({
      traces: 'https://otel.example.com/direct/traces',
      logs: 'https://otel.example.com/direct/logs',
      metrics: 'https://otel.example.com/base/v1/metrics',
    })
  })

  it('falls back to empty headers when the json header payload is invalid', () => {
    const config = resolveTelemetryBuildConfigFromEnv({
      DITADO_BUILD_OTEL_HEADERS_JSON: '{"broken"',
    })

    expect(config.headers).toEqual({})
  })
})
