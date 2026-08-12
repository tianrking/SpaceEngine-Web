// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductToolPanelProps } from './components/ProductToolPanel'
import type { ProgressiveHostSkyIndex } from './data/progressiveExoplanetCatalog'
import type { ObservedSystemBundle } from './data/progressiveObservedSystem'
import type {
  CosmosEngineEvents,
  ObservedSceneState,
  ObservedSelection,
} from './engine/types'
import { setAppLocale } from './i18n'
import type { ExplorerHudProps } from './ui/ExplorerHud'
import App from './App'

interface Deferred<Value> {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value) => void
  readonly reject: (reason?: unknown) => void
}

interface EngineMock {
  readonly events: CosmosEngineEvents
  readonly init: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  readonly setDisplaySettings: ReturnType<typeof vi.fn>
  readonly showObservedUniverse: ReturnType<typeof vi.fn>
  readonly loadObservedSystem: ReturnType<typeof vi.fn>
  readonly clearObservedSelection: ReturnType<typeof vi.fn>
  readonly showAsteriaSystem: ReturnType<typeof vi.fn>
  readonly showSystemOverview: ReturnType<typeof vi.fn>
  readonly resetView: ReturnType<typeof vi.fn>
  readonly centerOnObservedObject: ReturnType<typeof vi.fn>
  readonly returnToPreviousView: ReturnType<typeof vi.fn>
}

const engineHarness = vi.hoisted(() => ({
  instances: [] as EngineMock[],
  initialization: null as Promise<void> | null,
}))

const uiHarness = vi.hoisted(() => ({
  hud: null as ExplorerHudProps | null,
  productPanel: null as ProductToolPanelProps | null,
}))

const catalogHarness = vi.hoisted(() => {
  const client = {
    system: vi.fn(),
    hostSky: vi.fn(),
    cancel: vi.fn(),
  }
  return {
    client,
    getClient: vi.fn(() => client),
  }
})

const ASTERIA_SCENE: ObservedSceneState = {
  mode: 'asteria',
  activeHost: null,
  activeSystemId: null,
  selectedObjectId: null,
  selectedHost: null,
  centeredObjectId: null,
  centeredViewMode: null,
  transitioning: false,
}

function observedUniverseScene(
  overrides: Partial<ObservedSceneState> = {},
): ObservedSceneState {
  return {
    mode: 'observed-universe',
    activeHost: null,
    activeSystemId: null,
    selectedObjectId: null,
    selectedHost: null,
    centeredObjectId: null,
    centeredViewMode: null,
    transitioning: false,
    ...overrides,
  }
}

vi.mock('./engine/CosmosEngine', () => ({
  CosmosEngine: class {
    readonly events: CosmosEngineEvents
    readonly init = vi.fn(() => engineHarness.initialization ?? Promise.resolve())
    readonly dispose = vi.fn()
    readonly setDisplaySettings = vi.fn()
    readonly setQuality = vi.fn()
    readonly setTimeScale = vi.fn()
    readonly resetSimulationTime = vi.fn()
    readonly select = vi.fn()
    readonly centerOnObservedObject = vi.fn(() => true)
    readonly centerOnBody = vi.fn(() => true)
    readonly returnToPreviousView = vi.fn(() => true)
    readonly showSystemOverview = vi.fn()
    readonly clearSelection = vi.fn()
    readonly focusOn = vi.fn()
    readonly cancelCameraTransition = vi.fn(() => false)

    readonly showObservedUniverse = vi.fn(
      (_index: ProgressiveHostSkyIndex, focusHost?: string) => {
        this.events.onObservedSceneChange?.(observedUniverseScene({
          activeHost: focusHost ?? null,
        }))
      },
    )

    readonly loadObservedSystem = vi.fn((system: ObservedSystemBundle) => {
      this.events.onObservedSceneChange?.({
        mode: 'observed-system',
        activeHost: system.host,
        activeSystemId: system.id,
        selectedObjectId: null,
        selectedHost: system.host,
        centeredObjectId: null,
        centeredViewMode: null,
        transitioning: false,
      })
    })

    readonly clearObservedSelection = vi.fn(() => {
      this.events.onObservedSelectionCleared?.()
    })

    readonly showAsteriaSystem = vi.fn(() => {
      this.events.onObservedSceneChange?.(ASTERIA_SCENE)
    })

    readonly resetView = vi.fn(() => {
      this.events.onObservedSceneChange?.(ASTERIA_SCENE)
    })

    constructor(host: HTMLElement, events: CosmosEngineEvents) {
      this.events = events
      const canvas = document.createElement('canvas')
      canvas.tabIndex = 0
      host.append(canvas)
      engineHarness.instances.push(this)
    }
  },
}))

vi.mock('./data/progressiveCatalogClient', () => ({
  getProgressiveCatalogClient: catalogHarness.getClient,
}))

vi.mock('./ui/ExplorerHud', () => ({
  ExplorerHud: (props: ExplorerHudProps) => {
    uiHarness.hud = props
    return <div data-testid="explorer-hud" />
  },
}))

vi.mock('./components/ProductToolPanel', () => ({
  ProductToolPanel: (props: ProductToolPanelProps) => {
    uiHarness.productPanel = props
    return <div data-testid="product-tool-panel" />
  },
}))

vi.mock('./components/ShortcutHelpDialog', () => ({
  ShortcutHelpDialog: () => null,
}))

vi.mock('./components/SystemNavigator', () => ({
  SystemNavigator: () => null,
}))

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const HOST_INDEX: ProgressiveHostSkyIndex = {
  schemaVersion: '1.0.0',
  catalogRevision: 'test-revision',
  coordinateFrame: 'ICRS',
  columns: [],
  provenance: {
    selection: 'test selection',
    conflictPolicy: 'preserve conflicts',
    nullPolicy: 'preserve nulls',
  },
  records: [
    ['Alpha', 10, 20, 5, 8, 'G2V', 2, 1, 'Gaia DR3 Alpha', null, 'Alpha b'],
    ['Beta', 30, -10, 12, 10, 'K2V', 1, 1, 'Gaia DR3 Beta', null, 'Beta b'],
  ],
}

function observedSystem(host: string): ObservedSystemBundle {
  return {
    schemaVersion: '1.0.0',
    id: `observed-system:${host}`,
    host,
    evidence: 'archive-composite',
    astrometry: {
      frame: 'ICRS',
      raDeg: host === 'Alpha' ? 10 : 30,
      decDeg: host === 'Alpha' ? 20 : -10,
      distancePc: {
        status: 'single',
        selected: null,
        candidates: [],
      },
      cartesianPosition: {
        xPc: 1,
        yPc: 2,
        zPc: 3,
        evidence: 'derived',
        method: 'ICRS spherical coordinates to right-handed Cartesian parsecs',
        inputs: ['raDeg', 'decDeg', 'distancePc'],
      },
      sourceFields: ['ra', 'dec', 'sy_dist'],
    },
    hostStar: {
      spectralTypes: ['G2V'],
      measurements: {
        stellarMassSolar: { status: 'missing', selected: null, candidates: [] },
        stellarRadiusSolar: { status: 'missing', selected: null, candidates: [] },
        stellarTeffK: { status: 'missing', selected: null, candidates: [] },
        stellarLuminosityLogSolar: { status: 'missing', selected: null, candidates: [] },
      },
    },
    planets: [],
    provenance: {
      provider: 'NASA Exoplanet Archive',
      table: 'pscomppars',
      product: 'test product',
      catalogRevision: 'test-revision',
      retrievedAt: '2026-08-12T00:00:00.000Z',
      publishedAt: '2026-08-12T00:00:00.000Z',
      requestUrl: 'https://example.test/query',
      query: 'select test',
      documentationUrl: 'https://example.test/docs',
      acknowledgementUrl: 'https://example.test/acknowledgement',
      nullPolicy: 'preserve nulls',
      compositePolicy: 'archive composite',
      rightsStatus: 'public',
      evidence: 'archive-composite',
    },
  }
}

function hostSelection(host: 'Alpha' | 'Beta'): ObservedSelection {
  const alpha = host === 'Alpha'
  return {
    kind: 'host',
    id: `observed-host:${host.toLowerCase()}`,
    host,
    distancePc: alpha ? 5 : 12,
    raDeg: alpha ? 10 : 30,
    decDeg: alpha ? 20 : -10,
    skyOnly: false,
    spectralType: alpha ? 'G2V' : 'K2V',
    planetCount: alpha ? 2 : 1,
    starCount: 1,
    gaiaDr3: `Gaia DR3 ${host}`,
  }
}

function planetSelection(host: 'Alpha' | 'Beta'): ObservedSelection {
  const name = `${host} b`
  return {
    kind: 'planet',
    id: `observed-planet:${encodeURIComponent(name)}`,
    sourceId: `nea:pscomppars:${name}`,
    host,
    name,
    observed: true,
    illustrativeAssumptionCount: 3,
  }
}

async function renderReadyApp() {
  await setAppLocale('en')
  const view = render(<App />)
  await waitFor(() => expect(engineHarness.instances).toHaveLength(1))
  await waitFor(() => expect(uiHarness.hud).not.toBeNull())
  await waitFor(() => {
    expect(engineHarness.instances[0].setDisplaySettings).toHaveBeenCalled()
  })
  return view
}

async function openProductPanel(tool: 'search' | 'settings' = 'search') {
  await act(async () => {
    uiHarness.hud?.onToolChange?.(tool)
  })
  await waitFor(() => expect(uiHarness.productPanel?.tool).toBe(tool))
  return uiHarness.productPanel as ProductToolPanelProps
}

beforeEach(() => {
  engineHarness.instances.length = 0
  engineHarness.initialization = null
  uiHarness.hud = null
  uiHarness.productPanel = null
  catalogHarness.client.system.mockReset()
  catalogHarness.client.hostSky.mockReset()
  catalogHarness.client.cancel.mockReset()
  catalogHarness.getClient.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('observed-universe App integration', () => {
  it('enters the observed universe through the existing engine instance', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()

    await act(async () => {
      await panel.onExploreObservedUniverse?.(HOST_INDEX, 'Beta')
    })

    expect(engine.showObservedUniverse).toHaveBeenCalledOnce()
    expect(engine.showObservedUniverse).toHaveBeenCalledWith(HOST_INDEX, 'Beta')
    expect(engineHarness.instances).toHaveLength(1)
    expect(engine.dispose).not.toHaveBeenCalled()
    expect(uiHarness.hud?.cameraFrameMode).toBe('observed-universe')
    expect(uiHarness.hud?.cameraFrameCount).toBe(2)
  })

  it('reports an error and keeps the catalogue panel open until the engine is active', async () => {
    const initialization = deferred<void>()
    engineHarness.initialization = initialization.promise
    await setAppLocale('en')
    const view = render(<App />)
    await waitFor(() => expect(engineHarness.instances).toHaveLength(1))
    await waitFor(() => expect(uiHarness.hud).not.toBeNull())
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()

    await act(async () => {
      await panel.onExploreObservedUniverse?.(HOST_INDEX, 'Alpha')
    })

    expect(engine.showObservedUniverse).not.toHaveBeenCalled()
    expect(engine.setDisplaySettings).not.toHaveBeenCalled()
    expect(view.getByTestId('product-tool-panel')).toBeTruthy()
    expect(uiHarness.productPanel?.tool).toBe('search')
    expect(uiHarness.productPanel?.observedNavigationState).toEqual({
      status: 'error',
      target: 'universe',
      host: 'Alpha',
    })

    await act(async () => {
      initialization.resolve(undefined)
      await initialization.promise
    })
    await waitFor(() => expect(engine.setDisplaySettings).toHaveBeenCalled())
  })

  it('waits for system data, cancels the previous request, and ignores its late result', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()
    const alpha = deferred<{ system: ObservedSystemBundle; chunkIds: readonly number[] }>()
    const beta = deferred<{ system: ObservedSystemBundle; chunkIds: readonly number[] }>()
    catalogHarness.client.system.mockImplementation((host: string) => ({
      requestId: host === 'Alpha' ? 101 : 202,
      promise: host === 'Alpha' ? alpha.promise : beta.promise,
    }))

    let alphaNavigation!: Promise<void>
    await act(async () => {
      alphaNavigation = panel.onOpenObservedSystem?.('Alpha') as Promise<void>
      await Promise.resolve()
    })
    await waitFor(() => expect(catalogHarness.client.system).toHaveBeenCalledWith('Alpha'))
    expect(engine.loadObservedSystem).not.toHaveBeenCalled()

    let betaNavigation!: Promise<void>
    await act(async () => {
      betaNavigation = panel.onOpenObservedSystem?.('Beta') as Promise<void>
      await Promise.resolve()
    })
    await waitFor(() => expect(catalogHarness.client.system).toHaveBeenCalledWith('Beta'))
    expect(catalogHarness.client.cancel).toHaveBeenCalledWith(101)

    await act(async () => {
      beta.resolve({ system: observedSystem('Beta'), chunkIds: [2] })
      await betaNavigation
    })
    expect(engine.loadObservedSystem).toHaveBeenCalledOnce()
    expect(engine.loadObservedSystem).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'Beta' }),
    )

    await act(async () => {
      alpha.resolve({ system: observedSystem('Alpha'), chunkIds: [1] })
      await alphaNavigation
    })
    expect(engine.loadObservedSystem).toHaveBeenCalledOnce()
    expect(uiHarness.hud?.cameraFrameMode).toBe('observed-system')
    expect(uiHarness.hud?.cameraFrameName).toBe('Beta')
  })

  it('keeps the inspected selection distinct from the centered camera object', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const alpha = hostSelection('Alpha')
    const beta = hostSelection('Beta')

    act(() => {
      engine.events.onObservedSceneChange?.(observedUniverseScene())
      engine.events.onObservedSelection?.(beta)
      engine.events.onObservedSelection?.(alpha)
      engine.events.onObservedSceneChange?.(observedUniverseScene({
        selectedObjectId: alpha.id,
        selectedHost: alpha.host,
        centeredObjectId: beta.id,
        centeredViewMode: 'orbit',
      }))
    })

    await waitFor(() => {
      expect(uiHarness.hud?.selectedObject?.name).toBe('Alpha')
      expect(uiHarness.hud?.cameraView?.centeredObject.name).toBe('Beta')
    })
    expect(uiHarness.hud?.cameraView?.centeredObject.id).toBe(beta.id)
  })

  it('loads the host index on demand before returning from a directly opened system', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()
    catalogHarness.client.system.mockReturnValue({
      requestId: 301,
      promise: Promise.resolve({ system: observedSystem('Alpha'), chunkIds: [1] }),
    })
    catalogHarness.client.hostSky.mockReturnValue({
      requestId: 302,
      promise: Promise.resolve({ index: HOST_INDEX }),
    })

    await act(async () => {
      await panel.onOpenObservedSystem?.('Alpha')
    })
    await waitFor(() => expect(uiHarness.hud?.cameraFrameMode).toBe('observed-system'))

    await act(async () => {
      uiHarness.hud?.onReturnToPreviousView?.()
      await Promise.resolve()
    })
    await waitFor(() => expect(catalogHarness.client.hostSky).toHaveBeenCalledOnce())
    await waitFor(() => {
      expect(engine.showObservedUniverse).toHaveBeenCalledWith(HOST_INDEX, 'Alpha')
      expect(uiHarness.hud?.cameraFrameMode).toBe('observed-universe')
    })
  })

  it('routes Close for an observed planet and Backspace through the observed hierarchy', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()
    await act(async () => {
      await panel.onExploreObservedUniverse?.(HOST_INDEX, 'Alpha')
    })
    const alphaPlanet = planetSelection('Alpha')
    act(() => {
      engine.events.onObservedSelection?.(alphaPlanet)
      engine.events.onObservedSceneChange?.({
        mode: 'observed-system',
        activeHost: alphaPlanet.host,
        activeSystemId: 'nea:host:Alpha',
        selectedObjectId: alphaPlanet.id,
        selectedHost: alphaPlanet.host,
        centeredObjectId: alphaPlanet.id,
        centeredViewMode: 'orbit',
        transitioning: false,
      })
    })

    act(() => uiHarness.hud?.onCameraViewModeChange?.('close-approach'))
    expect(engine.centerOnObservedObject).toHaveBeenCalledWith(alphaPlanet.id, 'close')

    const event = new KeyboardEvent('keydown', {
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      window.dispatchEvent(event)
      await Promise.resolve()
    })
    expect(event.defaultPrevented).toBe(true)
    expect(engine.showObservedUniverse).toHaveBeenLastCalledWith(HOST_INDEX, 'Alpha')
    expect(engine.showAsteriaSystem).not.toHaveBeenCalled()
    expect(engine.returnToPreviousView).not.toHaveBeenCalled()
  })

  it('keeps internal observed source ids out of the camera context designation', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const star: ObservedSelection = {
      kind: 'star',
      id: 'observed-star:trappist-1',
      sourceId: 'nea:host:TRAPPIST-1',
      host: 'TRAPPIST-1',
      name: 'TRAPPIST-1',
      observed: true,
      illustrativeAssumptionCount: 0,
    }

    act(() => {
      engine.events.onObservedSelection?.(star)
      engine.events.onObservedSceneChange?.({
        mode: 'observed-system',
        activeHost: star.host,
        activeSystemId: 'observed-system:TRAPPIST-1',
        selectedObjectId: star.id,
        selectedHost: star.host,
        centeredObjectId: star.id,
        centeredViewMode: 'orbit',
        transitioning: false,
      })
    })

    await waitFor(() => {
      expect(uiHarness.hud?.cameraView?.centeredObject.designation).toBe('TRAPPIST-1')
    })
  })

  it('does not let observed Backspace escape overlays, product tools, or focused controls', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    act(() => {
      engine.events.onObservedSceneChange?.(observedUniverseScene())
    })

    const overlayBackspace = new KeyboardEvent('keydown', {
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(overlayBackspace)
    expect(overlayBackspace.defaultPrevented).toBe(true)
    expect(engine.showAsteriaSystem).not.toHaveBeenCalled()

    await act(async () => {
      uiHarness.hud?.onOverlayClose?.()
    })
    await waitFor(() => expect(uiHarness.hud?.overlay).toBeNull())
    const panel = await openProductPanel()
    const productBackspace = new KeyboardEvent('keydown', {
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(productBackspace)
    expect(productBackspace.defaultPrevented).toBe(true)
    expect(engine.showAsteriaSystem).not.toHaveBeenCalled()

    act(() => panel.onClose())
    await waitFor(() => expect(uiHarness.hud?.activeTool).toBe('explore'))
    const button = document.createElement('button')
    const link = document.createElement('a')
    link.href = '#observed-test'
    const dialog = document.createElement('dialog')
    dialog.tabIndex = 0
    for (const target of [button, link, dialog]) {
      document.body.append(target)
      target.focus()
      expect(document.activeElement).toBe(target)
      const focusedBackspace = new KeyboardEvent('keydown', {
        code: 'Backspace',
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(focusedBackspace)
      expect(focusedBackspace.defaultPrevented).toBe(true)
      target.remove()
    }
    expect(engine.showAsteriaSystem).not.toHaveBeenCalled()
  })

  it('owns Digit0 and Numpad0 while cancelling an observed hierarchy request', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const panel = await openProductPanel()
    catalogHarness.client.system.mockReturnValue({
      requestId: 701,
      promise: Promise.resolve({ system: observedSystem('Alpha'), chunkIds: [1] }),
    })
    await act(async () => {
      await panel.onOpenObservedSystem?.('Alpha')
    })
    await waitFor(() => expect(uiHarness.hud?.cameraFrameMode).toBe('observed-system'))

    const hostIndex = deferred<{ index: ProgressiveHostSkyIndex }>()
    const hostIndexFailure = deferred<{ index: ProgressiveHostSkyIndex }>()
    catalogHarness.client.hostSky
      .mockReturnValueOnce({ requestId: 702, promise: hostIndex.promise })
      .mockReturnValueOnce({
        requestId: 703,
        promise: hostIndexFailure.promise,
      })
    act(() => uiHarness.hud?.onReturnToPreviousView?.())
    await waitFor(() => expect(catalogHarness.client.hostSky).toHaveBeenCalledOnce())
    await waitFor(() => {
      expect(uiHarness.hud?.cameraHierarchyNavigationStatus).toBe('loading')
    })

    for (const code of ['Digit0', 'Numpad0']) {
      const event = new KeyboardEvent('keydown', {
        code,
        bubbles: true,
        cancelable: true,
      })
      act(() => window.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
    }
    expect(catalogHarness.client.cancel).toHaveBeenCalledWith(702)
    expect(engine.showSystemOverview).toHaveBeenCalledTimes(2)
    expect(uiHarness.hud?.cameraHierarchyNavigationStatus).toBe('idle')

    await act(async () => {
      hostIndex.resolve({ index: HOST_INDEX })
      await hostIndex.promise
    })
    expect(engine.showObservedUniverse).not.toHaveBeenCalled()

    act(() => uiHarness.hud?.onReturnToPreviousView?.())
    await waitFor(() => expect(catalogHarness.client.hostSky).toHaveBeenCalledTimes(2))
    await act(async () => {
      hostIndexFailure.reject(new Error('host index unavailable'))
      await hostIndexFailure.promise.catch(() => undefined)
    })
    await waitFor(() => {
      expect(uiHarness.hud?.cameraHierarchyNavigationStatus).toBe('error')
    })
  })

  it('clears only the observed selection while preserving the centered frame', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const alpha = hostSelection('Alpha')

    act(() => {
      engine.events.onObservedSelection?.(alpha)
      engine.events.onObservedSceneChange?.(observedUniverseScene({
        selectedObjectId: alpha.id,
        selectedHost: alpha.host,
        centeredObjectId: alpha.id,
        centeredViewMode: 'orbit',
      }))
    })

    act(() => {
      uiHarness.hud?.onClearSelectedObject?.()
    })

    expect(engine.clearObservedSelection).toHaveBeenCalledOnce()
    await waitFor(() => expect(uiHarness.hud?.selectedObject).toBeNull())
    expect(uiHarness.hud?.cameraView?.centeredObject.name).toBe('Alpha')
  })

  it('returns home and reset to Asteria while clearing observed UI state', async () => {
    await renderReadyApp()
    const engine = engineHarness.instances[0]
    const alpha = hostSelection('Alpha')

    act(() => {
      engine.events.onObservedSelection?.(alpha)
      engine.events.onObservedSceneChange?.(observedUniverseScene({
        selectedObjectId: alpha.id,
        selectedHost: alpha.host,
      }))
    })
    await waitFor(() => expect(uiHarness.hud?.cameraFrameMode).toBe('observed-universe'))

    act(() => {
      uiHarness.hud?.onToolChange?.('home')
    })
    expect(engine.showAsteriaSystem).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(uiHarness.hud?.cameraFrameMode).toBe('system')
      expect(uiHarness.hud?.selectedObject).toBeNull()
    })

    act(() => {
      engine.events.onObservedSelection?.(alpha)
      engine.events.onObservedSceneChange?.(observedUniverseScene({
        selectedObjectId: alpha.id,
        selectedHost: alpha.host,
      }))
    })
    const settings = await openProductPanel('settings')
    act(() => {
      settings.onResetView()
    })
    expect(engine.resetView).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(uiHarness.hud?.cameraFrameMode).toBe('system')
      expect(uiHarness.hud?.selectedObject).toBeNull()
    })
  })
})
