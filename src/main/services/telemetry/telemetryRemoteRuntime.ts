import { context as otelContext, SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api'
import { SeverityNumber, type Logger } from '@opentelemetry/api-logs'
import { ExportResultCode } from '@opentelemetry/core'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordExporter,
  type ReadableLogRecord,
} from '@opentelemetry/sdk-logs'
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  type AggregationOption,
  type InstrumentType,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics'
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node'

import type { TelemetryBuildConfig } from './telemetryBuildConfig.js'

export type TelemetryAttributeValue = string | number | boolean
export type TelemetryAttributes = Record<string, TelemetryAttributeValue>

type RemoteLogRecord = {
  kind: 'metric' | 'error'
  name: string
  attributes: TelemetryAttributes
  sessionId?: string
  exception?: unknown
}

type CounterName =
  | 'dictation_started'
  | 'dictation_completed'
  | 'dictation_failed'
  | 'microphone_permission_denied'
  | 'insertion_fallback_used'

type HistogramName = 'dictation_latency_ms'

export interface TelemetryRemoteRuntime {
  readonly remoteEnabled: boolean
  startSessionSpan(sessionId: string, attributes?: TelemetryAttributes): void
  updateSessionSpan(sessionId: string, attributes?: TelemetryAttributes): void
  addSessionEvent(sessionId: string, name: string, attributes?: TelemetryAttributes): void
  recordException(sessionId: string, error: unknown, attributes?: TelemetryAttributes): void
  emitLog(record: RemoteLogRecord): void
  incrementCounter(name: CounterName, value?: number, attributes?: TelemetryAttributes): void
  recordHistogram(name: HistogramName, value: number, attributes?: TelemetryAttributes): void
  endSessionSpan(sessionId: string, outcome: string, attributes?: TelemetryAttributes): void
  shutdown(): Promise<void>
}

type TelemetryExporterFactories = {
  createTraceExporter: (config: { url: string; headers: Record<string, string>; timeoutMs: number }) => SpanExporter
  createLogExporter: (config: { url: string; headers: Record<string, string>; timeoutMs: number }) => LogRecordExporter
  createMetricExporter: (
    config: { url: string; headers: Record<string, string>; timeoutMs: number },
  ) => PushMetricExporter
}

type TelemetryRemoteRuntimeOptions = {
  appVersion: string
  exporterFactories?: Partial<TelemetryExporterFactories>
}

class SafeSpanExporter implements SpanExporter {
  constructor(
    private readonly delegate: SpanExporter,
    private readonly onFailure: (error?: unknown) => void,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: { code: number; error?: Error }) => void): void {
    this.delegate.export(spans, (result) => {
      if (result.code !== ExportResultCode.SUCCESS) {
        this.onFailure(result.error)
      }
      resultCallback(result)
    })
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown().catch((error) => {
      this.onFailure(error)
    })
  }

  forceFlush?(): Promise<void> {
    if (!this.delegate.forceFlush) {
      return Promise.resolve()
    }

    return this.delegate.forceFlush().catch((error) => {
      this.onFailure(error)
    })
  }
}

class SafeLogExporter implements LogRecordExporter {
  constructor(
    private readonly delegate: LogRecordExporter,
    private readonly onFailure: (error?: unknown) => void,
  ) {}

  export(logs: ReadableLogRecord[], resultCallback: (result: { code: number; error?: Error }) => void): void {
    this.delegate.export(logs, (result) => {
      if (result.code !== ExportResultCode.SUCCESS) {
        this.onFailure(result.error)
      }
      resultCallback(result)
    })
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown().catch((error) => {
      this.onFailure(error)
    })
  }
}

class SafeMetricExporter implements PushMetricExporter {
  constructor(
    private readonly delegate: PushMetricExporter,
    private readonly onFailure: (error?: unknown) => void,
  ) {}

  export(metrics: ResourceMetrics, resultCallback: (result: { code: number; error?: Error }) => void): void {
    this.delegate.export(metrics, (result) => {
      if (result.code !== ExportResultCode.SUCCESS) {
        this.onFailure(result.error)
      }
      resultCallback(result)
    })
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush().catch((error) => {
      this.onFailure(error)
    })
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown().catch((error) => {
      this.onFailure(error)
    })
  }

  selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
    if (!this.delegate.selectAggregationTemporality) {
      throw new Error('Metric exporter is missing aggregation temporality support.')
    }

    return this.delegate.selectAggregationTemporality(instrumentType)
  }

  selectAggregation(instrumentType: InstrumentType): AggregationOption {
    if (!this.delegate.selectAggregation) {
      throw new Error('Metric exporter is missing aggregation support.')
    }

    return this.delegate.selectAggregation(instrumentType)
  }
}

class NoopTelemetryRemoteRuntime implements TelemetryRemoteRuntime {
  readonly remoteEnabled = false

  startSessionSpan(): void {}
  updateSessionSpan(): void {}
  addSessionEvent(): void {}
  recordException(): void {}
  emitLog(): void {}
  incrementCounter(): void {}
  recordHistogram(): void {}
  endSessionSpan(): void {}
  async shutdown(): Promise<void> {}
}

class OpenTelemetryRemoteRuntime implements TelemetryRemoteRuntime {
  remoteEnabled = true
  private readonly activeSpans = new Map<string, Span>()

  constructor(
    private readonly tracerProvider: NodeTracerProvider | null,
    private readonly tracer: Tracer | null,
    private readonly loggerProvider: LoggerProvider | null,
    private readonly logger: Logger | null,
    private readonly meterProvider: MeterProvider | null,
    private readonly counters: Partial<Record<CounterName, { add: (value: number, attributes?: TelemetryAttributes) => void }>>,
    private readonly histograms: Partial<Record<HistogramName, { record: (value: number, attributes?: TelemetryAttributes) => void }>>,
  ) {}

  startSessionSpan(sessionId: string, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled || !this.tracer || this.activeSpans.has(sessionId)) {
      return
    }

    try {
      const span = this.tracer.startSpan('dictation.session', {
        attributes: {
          'session.id': sessionId,
          ...attributes,
        },
      })
      this.activeSpans.set(sessionId, span)
    } catch {
      this.disableRemote()
    }
  }

  updateSessionSpan(sessionId: string, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    try {
      this.activeSpans.get(sessionId)?.setAttributes(attributes)
    } catch {
      this.disableRemote()
    }
  }

  addSessionEvent(sessionId: string, name: string, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    try {
      this.activeSpans.get(sessionId)?.addEvent(name, attributes)
    } catch {
      this.disableRemote()
    }
  }

  recordException(sessionId: string, error: unknown, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    const span = this.activeSpans.get(sessionId)
    if (!span) {
      return
    }

    try {
      const exception = error instanceof Error ? error : new Error(String(error))
      span.recordException(exception)
      if (Object.keys(attributes).length > 0) {
        span.addEvent('exception.metadata', attributes)
      }
    } catch {
      this.disableRemote()
    }
  }

  emitLog(record: RemoteLogRecord): void {
    if (!this.remoteEnabled || !this.logger) {
      return
    }

    try {
      const span = record.sessionId ? this.activeSpans.get(record.sessionId) : undefined
      this.logger.emit({
        eventName: record.name,
        timestamp: Date.now(),
        severityNumber: record.kind === 'error' ? SeverityNumber.ERROR : SeverityNumber.INFO,
        severityText: record.kind === 'error' ? 'ERROR' : 'INFO',
        body: record.name,
        attributes: record.attributes,
        exception: record.exception,
        context: span ? trace.setSpan(otelContext.active(), span) : undefined,
      })
    } catch {
      this.disableRemote()
    }
  }

  incrementCounter(name: CounterName, value = 1, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    try {
      this.counters[name]?.add(value, attributes)
    } catch {
      this.disableRemote()
    }
  }

  recordHistogram(name: HistogramName, value: number, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    try {
      this.histograms[name]?.record(value, attributes)
    } catch {
      this.disableRemote()
    }
  }

  endSessionSpan(sessionId: string, outcome: string, attributes: TelemetryAttributes = {}): void {
    if (!this.remoteEnabled) {
      return
    }

    const span = this.activeSpans.get(sessionId)
    if (!span) {
      return
    }

    this.activeSpans.delete(sessionId)

    try {
      span.setAttributes({
        'dictation.outcome': outcome,
        ...attributes,
      })
      span.addEvent('session.finished', { outcome })
      span.setStatus(
        outcome === 'error' || outcome === 'permission-required'
          ? {
              code: SpanStatusCode.ERROR,
              message: typeof attributes['error.message'] === 'string' ? attributes['error.message'] : outcome,
            }
          : { code: SpanStatusCode.OK },
      )
      span.end()
    } catch {
      this.disableRemote()
    }
  }

  async shutdown(): Promise<void> {
    this.remoteEnabled = false

    for (const span of this.activeSpans.values()) {
      try {
        span.end()
      } catch {
        // Ignore best-effort cleanup errors during shutdown.
      }
    }
    this.activeSpans.clear()

    await Promise.allSettled([
      this.meterProvider?.shutdown() ?? Promise.resolve(),
      this.loggerProvider?.shutdown() ?? Promise.resolve(),
      this.tracerProvider?.shutdown() ?? Promise.resolve(),
    ])
  }

  private disableRemote(): void {
    if (!this.remoteEnabled) {
      return
    }

    this.remoteEnabled = false
    for (const span of this.activeSpans.values()) {
      try {
        span.end()
      } catch {
        // Ignore cleanup failures after exporter degradation.
      }
    }
    this.activeSpans.clear()
  }
}

const createSignalConfig = (config: TelemetryBuildConfig, url: string | null) =>
  url
    ? {
        url,
        headers: config.headers,
        timeoutMs: config.timeoutMs,
      }
    : null

const defaultExporterFactories: TelemetryExporterFactories = {
  createTraceExporter: (config) => new OTLPTraceExporter(config),
  createLogExporter: (config) => new OTLPLogExporter(config),
  createMetricExporter: (config) => new OTLPMetricExporter(config),
}

export const createRemoteTelemetryRuntime = (
  config: TelemetryBuildConfig,
  options: TelemetryRemoteRuntimeOptions,
): TelemetryRemoteRuntime => {
  if (!config.enabled) {
    return new NoopTelemetryRemoteRuntime()
  }

  const traceConfig = createSignalConfig(config, config.signals.traces)
  const logConfig = createSignalConfig(config, config.signals.logs)
  const metricConfig = createSignalConfig(config, config.signals.metrics)

  if (!traceConfig && !logConfig && !metricConfig) {
    return new NoopTelemetryRemoteRuntime()
  }

  const exporterFactories = {
    ...defaultExporterFactories,
    ...options.exporterFactories,
  }

  const resource = resourceFromAttributes({
    'service.name': config.serviceName,
    'service.version': options.appVersion,
    ...(config.deploymentEnvironment
      ? { 'deployment.environment': config.deploymentEnvironment }
      : {}),
  })

  let runtime: OpenTelemetryRemoteRuntime | null = null
  const onExporterFailure = () => {
    void runtime?.shutdown()
  }

  const tracerProvider = traceConfig
    ? new NodeTracerProvider({
        resource,
        spanProcessors: [
          new BatchSpanProcessor(
            new SafeSpanExporter(exporterFactories.createTraceExporter(traceConfig), onExporterFailure),
            { exportTimeoutMillis: config.timeoutMs },
          ),
        ],
      })
    : null

  const tracer = tracerProvider?.getTracer('ditado.main', options.appVersion) ?? null

  const loggerProvider = logConfig
    ? new LoggerProvider({
        resource,
        processors: [
          new BatchLogRecordProcessor(
            new SafeLogExporter(exporterFactories.createLogExporter(logConfig), onExporterFailure),
            { exportTimeoutMillis: config.timeoutMs },
          ),
        ],
      })
    : null

  const logger = loggerProvider?.getLogger('ditado.main', options.appVersion) ?? null

  const metricReader = metricConfig
    ? new PeriodicExportingMetricReader({
        exporter: new SafeMetricExporter(exporterFactories.createMetricExporter(metricConfig), onExporterFailure),
        exportIntervalMillis: config.metricExportIntervalMs,
        exportTimeoutMillis: config.timeoutMs,
      })
    : null

  const meterProvider = metricReader
    ? new MeterProvider({
        resource,
        readers: [metricReader],
      })
    : null

  const meter = meterProvider?.getMeter('ditado.main', options.appVersion)
  const counters = meter
    ? {
        dictation_started: meter.createCounter('ditado.dictation.started', {
          description: 'Dictation sessions started.',
        }),
        dictation_completed: meter.createCounter('ditado.dictation.completed', {
          description: 'Dictation sessions completed successfully.',
        }),
        dictation_failed: meter.createCounter('ditado.dictation.failed', {
          description: 'Dictation sessions that failed.',
        }),
        microphone_permission_denied: meter.createCounter('ditado.microphone.permission_denied', {
          description: 'Microphone permission denied events.',
        }),
        insertion_fallback_used: meter.createCounter('ditado.insertion.fallback_used', {
          description: 'Insertion sessions that required fallback behavior.',
        }),
      }
    : {}

  const histograms = meter
    ? {
        dictation_latency_ms: meter.createHistogram('ditado.dictation.latency', {
          unit: 'ms',
          description: 'Dictation completion latency in milliseconds.',
        }),
      }
    : {}

  runtime = new OpenTelemetryRemoteRuntime(
    tracerProvider,
    tracer,
    loggerProvider,
    logger,
    meterProvider,
    counters,
    histograms,
  )

  return runtime
}
