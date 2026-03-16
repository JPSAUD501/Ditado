import { describe, expect, it } from 'vitest'

import { settingsPatchSchema } from './contracts.js'

describe('settingsPatchSchema', () => {
  it('keeps partial updates partial instead of injecting defaults', () => {
    expect(settingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(settingsPatchSchema.parse({ launchOnLogin: true })).toEqual({ launchOnLogin: true })
  })
})
