import type { AppStore } from '../store/appStore.js'
import type { TelemetryRecord } from '../../../shared/contracts.js'
import { createId } from '../../../shared/utils.js'
import type { TelemetryAttributes, TelemetryRemoteRuntime } from './telemetryRemoteRuntime.js'

const stringifyDetail = (detail: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(detail).map(([key, value]) => [key, String(value)]))

const toRemoteAttributes = (
  detail: Record<string, unknown>,
  sessionId?: string,
): TelemetryAttributes =>
  Object.fromEntries(
    Object.entries({
      ...detail,
      ...(sessionId ? { sessionId } : {}),
    }).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)),
  ) as TelemetryAttributes

export class TelemetryService {
  constructor(
    private readonly store: AppStore,
    private readonly remote: TelemetryRemoteRuntime,
  ) {}

  async startSession(sessionId: string, detail: Record<string, unknown> = {}): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    this.remote.startSessionSpan(sessionId, toRemoteAttributes(detail, sessionId))
  }

  async annotateSession(sessionId: string, detail: Record<string, unknown> = {}): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    this.remote.updateSessionSpan(sessionId, toRemoteAttributes(detail, sessionId))
  }

  sessionEvent(sessionId: string, name: string, detail: Record<string, unknown> = {}): void {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    this.remote.addSessionEvent(sessionId, name, toRemoteAttributes(detail, sessionId))
  }

  async metric(
    name: string,
    detail: Record<string, unknown> = {},
    options: { sessionId?: string } = {},
  ): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    const remoteAttributes = toRemoteAttributes(detail, options.sessionId)

    await this.store.appendTelemetry({
      id: createId('metric'),
      timestamp: new Date().toISOString(),
      kind: 'metric',
      name,
      detail: stringifyDetail(detail),
    })

    this.remote.emitLog({
      kind: 'metric',
      name,
      attributes: remoteAttributes,
      sessionId: options.sessionId,
    })
    if (options.sessionId) {
      this.remote.addSessionEvent(options.sessionId, name, remoteAttributes)
    }
    this.recordDerivedMetrics(name, detail, remoteAttributes)
  }

  async error(
    name: string,
    detail: Record<string, unknown> = {},
    options: { sessionId?: string; exception?: unknown } = {},
  ): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    const remoteAttributes = toRemoteAttributes(detail, options.sessionId)

    await this.store.appendTelemetry({
      id: createId('error'),
      timestamp: new Date().toISOString(),
      kind: 'error',
      name,
      detail: stringifyDetail(detail),
    })

    this.remote.emitLog({
      kind: 'error',
      name,
      attributes: remoteAttributes,
      sessionId: options.sessionId,
      exception: options.exception,
    })
    if (options.sessionId) {
      this.remote.addSessionEvent(options.sessionId, name, remoteAttributes)
      if (options.exception) {
        this.remote.recordException(options.sessionId, options.exception, remoteAttributes)
      }
    }
    this.recordDerivedMetrics(name, detail, remoteAttributes)
  }

  async finishSession(sessionId: string, outcome: string, detail: Record<string, unknown> = {}): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    this.remote.endSessionSpan(sessionId, outcome, toRemoteAttributes(detail, sessionId))
  }

  async tail(limit = 20): Promise<TelemetryRecord[]> {
    return this.store.readTelemetryTail(limit)
  }

  async shutdown(): Promise<void> {
    await this.remote.shutdown()
  }

  private recordDerivedMetrics(
    name: string,
    detail: Record<string, unknown>,
    remoteAttributes: TelemetryAttributes,
  ): void {
    switch (name) {
      case 'dictation-started':
        this.remote.incrementCounter('dictation_started', 1, remoteAttributes)
        return
      case 'dictation-completed':
        this.remote.incrementCounter('dictation_completed', 1, remoteAttributes)
        if (typeof detail.latencyMs === 'number') {
          this.remote.recordHistogram('dictation_latency_ms', detail.latencyMs, remoteAttributes)
        }
        if (detail.fallbackUsed === true) {
          this.remote.incrementCounter('insertion_fallback_used', 1, remoteAttributes)
        }
        return
      case 'dictation-failed':
        this.remote.incrementCounter('dictation_failed', 1, remoteAttributes)
        if (detail.fallbackUsed === true) {
          this.remote.incrementCounter('insertion_fallback_used', 1, remoteAttributes)
        }
        return
      case 'microphone-permission-required':
        this.remote.incrementCounter('microphone_permission_denied', 1, remoteAttributes)
        return
      default:
        return
    }
  }
}
