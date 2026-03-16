import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('preload IPC contract', () => {
  it('imports the shared contract instead of redefining channels locally', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'preload', 'preload.cts'), 'utf8')

    expect(source).toContain("import { ipcChannels } from '../shared/ipc.js'")
    expect(source).not.toContain('const ipcChannels = {')
  })
})
