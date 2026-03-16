import { clipboard } from 'electron'

export interface ClipboardSnapshot {
  text: string
}

export class ClipboardService {
  async readCurrent(): Promise<ClipboardSnapshot> {
    return {
      text: clipboard.readText(),
    }
  }

  async writeNormal(text: string): Promise<void> {
    clipboard.writeText(text)
  }

  async restore(snapshot: ClipboardSnapshot): Promise<void> {
    clipboard.writeText(snapshot.text)
  }
}
