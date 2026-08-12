// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppLocale } from './i18n'
import App from './App'

const engineLifecycle = vi.hoisted(() => ({
  constructed: vi.fn(),
  disposed: vi.fn(),
}))

vi.mock('./engine/CosmosEngine', () => ({
  CosmosEngine: class {
    constructor(host: HTMLElement) {
      engineLifecycle.constructed()
      host.append(document.createElement('canvas'))
    }

    async init(): Promise<void> {}
    dispose(): void { engineLifecycle.disposed() }
    setDisplaySettings(): void {}
  },
}))

vi.mock('./ui/ExplorerHud', () => ({
  ExplorerHud: () => <div data-testid="explorer-hud" />,
}))
vi.mock('./components/ProductToolPanel', () => ({ ProductToolPanel: () => null }))
vi.mock('./components/ShortcutHelpDialog', () => ({ ShortcutHelpDialog: () => null }))
vi.mock('./components/SystemNavigator', () => ({ SystemNavigator: () => null }))

afterEach(() => {
  cleanup()
  engineLifecycle.constructed.mockClear()
  engineLifecycle.disposed.mockClear()
})

describe('application locale isolation', () => {
  it('keeps the same CosmosEngine and canvas when language changes', async () => {
    await setAppLocale('en')
    const view = render(<App />)

    await waitFor(() => expect(engineLifecycle.constructed).toHaveBeenCalledOnce())
    const canvas = view.container.querySelector('canvas')
    expect(canvas).toBeTruthy()

    await act(() => setAppLocale('fr'))

    expect(engineLifecycle.constructed).toHaveBeenCalledOnce()
    expect(engineLifecycle.disposed).not.toHaveBeenCalled()
    expect(view.container.querySelector('canvas')).toBe(canvas)

    view.unmount()
    expect(engineLifecycle.disposed).toHaveBeenCalledOnce()
  })
})
