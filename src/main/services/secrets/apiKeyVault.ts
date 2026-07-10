import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export class ApiKeyVault {
  private readonly filePath = join(app.getPath('userData'), 'openrouter.secure.bin')
  private present = false
  private readonly listeners = new Set<(present: boolean) => void>()

  async initialize(): Promise<void> {
    this.present = (await this.get()) !== null
  }

  getStatusSnapshot(): boolean {
    return this.present
  }

  subscribe(listener: (present: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async status(): Promise<{ present: boolean }> {
    return { present: this.present }
  }

  async set(apiKey: string): Promise<{ present: boolean }> {
    const normalized = apiKey.trim()
    if (!normalized) {
      await rm(this.filePath, { force: true })
      this.updatePresent(false)
      return { present: false }
    }
    this.requireEncryption()
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, safeStorage.encryptString(normalized))
    this.updatePresent(true)
    return { present: true }
  }

  async get(): Promise<string | null> {
    this.requireEncryption()
    try {
      const encrypted = await readFile(this.filePath)
      return encrypted.length > 0 ? safeStorage.decryptString(encrypted) : null
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }
      throw error
    }
  }

  private requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure local storage is unavailable on this system.')
    }
  }

  private updatePresent(present: boolean): void {
    if (this.present === present) {
      return
    }
    this.present = present
    for (const listener of this.listeners) {
      listener(present)
    }
  }
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'
