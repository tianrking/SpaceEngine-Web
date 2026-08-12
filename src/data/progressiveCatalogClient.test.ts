import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressiveCatalogClient } from './progressiveCatalogClient'

class FakeWorker {
  static instances: FakeWorker[] = []

  readonly messages: unknown[] = []
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('progressive catalogue client system requests', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes an exact-host system request and sends a matching cancellation', async () => {
    const client = new ProgressiveCatalogClient()
    const worker = FakeWorker.instances[0]
    const request = client.system('TRAPPIST-1')

    expect(request.requestId).toBe(1)
    expect(worker.messages).toEqual([
      { type: 'system', host: 'TRAPPIST-1', requestId: 1 },
    ])

    client.cancel(request.requestId)
    expect(worker.messages).toEqual([
      { type: 'system', host: 'TRAPPIST-1', requestId: 1 },
      { type: 'cancel', requestId: 1 },
    ])
    await expect(request.promise).rejects.toMatchObject({ name: 'AbortError' })

    client.dispose()
    expect(worker.terminated).toBe(true)
  })
})
