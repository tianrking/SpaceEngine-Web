import { describe, expect, it, vi } from 'vitest'
import { activateRuntimeLocale } from './i18n'

describe('runtime locale activation', () => {
  it('keeps the current locale and preference when the requested pack fails', async () => {
    const install = vi.fn()
    const change = vi.fn(async () => undefined)
    const persist = vi.fn()

    const activated = await activateRuntimeLocale('es', {
      load: vi.fn(async () => { throw new Error('offline') }),
      install,
      change,
      persist,
    })

    expect(activated).toBe(false)
    expect(install).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })
})
