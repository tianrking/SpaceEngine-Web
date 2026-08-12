import { describe, expect, it, vi } from 'vitest'
import { runWhenPageLoaded } from './registerServiceWorker'

describe('offline shell registration scheduling', () => {
  it('registers immediately when the load event already happened', () => {
    const action = vi.fn()
    const addLoadListener = vi.fn()

    runWhenPageLoaded(action, 'complete', addLoadListener)

    expect(action).toHaveBeenCalledOnce()
    expect(addLoadListener).not.toHaveBeenCalled()
  })

  it('registers once the pending load event fires', () => {
    const action = vi.fn()
    let loadListener: (() => void) | undefined

    runWhenPageLoaded(action, 'loading', (listener) => {
      loadListener = listener
    })

    expect(action).not.toHaveBeenCalled()
    loadListener?.()
    expect(action).toHaveBeenCalledOnce()
  })
})
