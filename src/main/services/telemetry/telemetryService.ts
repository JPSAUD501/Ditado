import type { AppStore } from '../store/appStore.js'
import type { TelemetryRecord } from '../../../shared/contracts.js'
import { createId } from '../../../shared/utils.js'

const stringifyDetail = (detail: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(detail).map(([key, value]) => [key, String(value)]))

export class TelemetryService {
  constructor(private readonly store: AppStore) {}

  async metric(name: string, detail: Record<string, unknown> = {}): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    await this.store.appendTelemetry({
      id: createId('metric'),
      timestamp: new Date().toISOString(),
      kind: 'metric',
      name,
      detail: stringifyDetail(detail),
    })
  }

  async error(name: string, detail: Record<string, unknown> = {}): Promise<void> {
    if (!this.store.getSettings().telemetryEnabled) {
      return
    }

    await this.store.appendTelemetry({
      id: createId('error'),
      timestamp: new Date().toISOString(),
      kind: 'error',
      name,
      detail: stringifyDetail(detail),
    })
  }

  async tail(limit = 20): Promise<TelemetryRecord[]> {
    return this.store.readTelemetryTail(limit)
  }
}
