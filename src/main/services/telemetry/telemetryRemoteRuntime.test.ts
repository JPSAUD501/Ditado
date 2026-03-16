import { describe, expect, it, vi } from 'vitest'

import { disabledTelemetryBuildConfig } from './telemetryBuildConfig.js'
import { createRemoteTelemetryRuntime } from './telemetryRemoteRuntime.js'

const createSpanExporter = () => ({
  export: vi.fn((_spans, resultCallback) => resultCallback({ code: 0 })),
  shutdown: vi.fn(async () => undefined),
})

const createLogExporter = () => ({
  export: vi.fn((_logs, resultCallback) => resultCallback({ code: 0 })),
  shutdown: vi.fn(async () => undefined),
})

const createMetricExporter = () => ({
  export: vi.fn((_metrics, resultCallback) => resultCallback({ code: 0 })),
  forceFlush: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
  selectAggregationTemporality: vi.fn(() => 2),
  selectAggregation: vi.fn(() => ({ type: 0 })),
})

describe('createRemoteTelemetryRuntime', () => {
  it('returns a noop runtime when the build config is disabled', () => {
    const runtime = createRemoteTelemetryRuntime(disabledTelemetryBuildConfig, {
      appVersion: '0.1.0',
    })

    expect(runtime.remoteEnabled).toBe(false)
  })

  it('returns a noop runtime when no remote signal endpoints are configured', () => {
    const runtime = createRemoteTelemetryRuntime(
      {
        ...disabledTelemetryBuildConfig,
        enabled: true,
      },
      { appVersion: '0.1.0' },
    )

    expect(runtime.remoteEnabled).toBe(false)
  })

  it('initializes the configured OTLP exporters with the resolved signal urls', async () => {
    const traceExporter = createSpanExporter()
    const logExporter = createLogExporter()
    const metricExporter = createMetricExporter()
    const createTraceExporter = vi.fn(() => traceExporter)
    const createLogExporterFactory = vi.fn(() => logExporter)
    const createMetricExporterFactory = vi.fn(() => metricExporter)

    const runtime = createRemoteTelemetryRuntime(
      {
        ...disabledTelemetryBuildConfig,
        enabled: true,
        headers: { authorization: 'Bearer test-token' },
        signals: {
          traces: 'https://otel.example.com/v1/traces',
          logs: 'https://otel.example.com/v1/logs',
          metrics: 'https://otel.example.com/v1/metrics',
        },
      },
      {
        appVersion: '0.1.0',
        exporterFactories: {
          createTraceExporter,
          createLogExporter: createLogExporterFactory,
          createMetricExporter: createMetricExporterFactory,
        },
      },
    )

    expect(runtime.remoteEnabled).toBe(true)
    expect(createTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://otel.example.com/v1/traces' }),
    )
    expect(createLogExporterFactory).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://otel.example.com/v1/logs' }),
    )
    expect(createMetricExporterFactory).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://otel.example.com/v1/metrics' }),
    )

    await runtime.shutdown()

    expect(traceExporter.shutdown).toHaveBeenCalledTimes(1)
    expect(logExporter.shutdown).toHaveBeenCalledTimes(1)
    expect(metricExporter.shutdown).toHaveBeenCalledTimes(1)
  })
})
