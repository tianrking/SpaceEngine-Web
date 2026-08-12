// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../i18n/i18n'
import { hudResources } from '../i18n/namespaces/hud'
import {
  ExplorerHud,
  ObjectInspector,
  type BodyCenteredCameraView,
  type ExplorerHudProps,
  type SelectedCelestialObject,
} from './ExplorerHud'

const SELECTED_ALPHA: SelectedCelestialObject = {
  id: 'alpha',
  name: 'Alpha',
  type: 'Terrestrial planet',
  designation: 'AE-ALPHA',
}

const CENTERED_BOREALIS: BodyCenteredCameraView = {
  centeredObject: {
    id: 'borealis',
    name: 'Borealis',
    type: 'Gas giant',
    designation: 'AE-BOREALIS',
  },
  mode: 'orbit',
  previousViewLabel: 'Asteria system frame',
}

const BASE_HUD_PROPS: Pick<
  ExplorerHudProps,
  | 'webGpuStatus'
  | 'fps'
  | 'speed'
  | 'timeScale'
  | 'simulationTime'
  | 'quality'
  | 'cinematic'
> = {
  webGpuStatus: 'active',
  fps: 60,
  speed: 0,
  timeScale: 1,
  simulationTime: '2187-03-20T14:32:00.000Z',
  quality: 'balanced',
  cinematic: false,
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('body-centered camera HUD', () => {
  it('keeps Selected Alpha distinct from a camera centered on Borealis', () => {
    render(
      <ObjectInspector
        selectedObject={SELECTED_ALPHA}
        cameraView={CENTERED_BOREALIS}
        onCenterSelectedObject={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByText('Centered: Borealis')).toBeTruthy()

    const context = screen.getByText('Camera', { selector: 'dt' }).parentElement
    expect(context?.textContent).toContain('Centered on Borealis')
    expect(context?.textContent).toContain('Orbit tracking')
  })

  it('uses an explicit system-frame state when cameraView is null', () => {
    const onCenterSelectedObject = vi.fn()
    render(
      <ObjectInspector
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        onCenterSelectedObject={onCenterSelectedObject}
      />,
    )

    expect(screen.getByText('System frame')).toBeTruthy()
    expect(screen.getByText('Camera is not locked to a body')).toBeTruthy()

    const actions = screen.getByRole('group', {
      name: 'Center camera on Alpha',
    })
    fireEvent.click(within(actions).getByRole('button', { name: /^Orbit/ }))
    fireEvent.click(
      within(actions).getByRole('button', { name: /^Close approach/ }),
    )

    expect(onCenterSelectedObject.mock.calls).toEqual([
      ['orbit'],
      ['close-approach'],
    ])
  })

  it('announces a transition and disables every camera-context action in transit', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={{ ...CENTERED_BOREALIS, transitioning: true }}
        onCameraViewModeChange={vi.fn()}
        onReturnToPreviousView={vi.fn()}
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    expect(
      screen
        .getAllByRole('status')
        .filter((status) => status.textContent?.includes('Centering on Borealis')),
    ).toHaveLength(1)
    expect(cameraControls.getAttribute('aria-busy')).toBe('true')
    expect(within(cameraControls).getByText(/Centering on Borealis/)).toBeTruthy()
    for (const button of within(cameraControls).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('keeps a system context available through overview transition and history return', () => {
    const onReturnToPreviousView = vi.fn()
    const onSystemOverview = vi.fn()
    const renderHud = (systemOverviewTransitioning: boolean) => (
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        systemOverviewTransitioning={systemOverviewTransitioning}
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={onSystemOverview}
      />
    )
    const { rerender } = render(renderHud(true))

    let cameraControls = screen.getByRole('region', {
      name: 'System camera controls',
    })
    expect(cameraControls.getAttribute('aria-busy')).toBe('true')
    expect(within(cameraControls).getByText('Returning to system overview…')).toBeTruthy()
    expect(screen.getByText('Camera transition in progress')).toBeTruthy()
    for (const button of within(cameraControls).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }

    rerender(renderHud(false))
    cameraControls = screen.getByRole('region', {
      name: 'System camera controls',
    })
    expect(cameraControls.hasAttribute('aria-busy')).toBe(false)
    expect(
      within(cameraControls).getByText('System overview', { selector: 'strong' }),
    ).toBeTruthy()
    const previousView = within(cameraControls).getByRole('button', {
      name: 'Return to previous view',
    })
    const systemOverview = within(cameraControls).getByRole('button', {
      name: 'System overview',
    })
    expect((previousView as HTMLButtonElement).disabled).toBe(false)
    expect((systemOverview as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(previousView)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
  })

  it('keeps free-flight history and system-overview actions available', () => {
    const onReturnToPreviousView = vi.fn()
    const onSystemOverview = vi.fn()
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="free"
        cameraFrameTransitioning={false}
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={onSystemOverview}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Free-flight camera controls',
    })
    expect(
      within(cameraControls).getByText('Free flight', { selector: 'strong' }),
    ).toBeTruthy()
    expect(within(cameraControls).getByText('Body tracking unlocked')).toBeTruthy()
    expect(screen.getByText('Free flight', { selector: 'dd' })).toBeTruthy()

    const previousView = within(cameraControls).getByRole('button', {
      name: 'Return to previous view',
    })
    const systemOverview = within(cameraControls).getByRole('button', {
      name: 'System overview',
    })
    expect((previousView as HTMLButtonElement).disabled).toBe(false)
    expect((systemOverview as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(previousView)
    fireEvent.click(systemOverview)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
    expect(onSystemOverview).toHaveBeenCalledTimes(1)
  })

  it('announces a free-flight restore once and disables its actions in transit', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="free"
        cameraFrameTransitioning
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={vi.fn()}
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Free-flight camera controls',
    })
    expect(cameraControls.getAttribute('aria-busy')).toBe('true')
    expect(
      within(cameraControls).getByText('Returning to free-flight view…'),
    ).toBeTruthy()
    expect(screen.getByText('Returning to free-flight view…', { selector: 'dd' })).toBeTruthy()
    expect(
      screen
        .getAllByRole('status')
        .filter((status) =>
          status.textContent?.includes('Returning to free-flight view'),
        ),
    ).toHaveLength(1)
    for (const button of within(cameraControls).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('prefers the new frame transition prop and keeps free copy over the legacy alias', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="free"
        cameraFrameTransitioning={false}
        systemOverviewTransitioning
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Free-flight camera controls',
    })
    expect(cameraControls.hasAttribute('aria-busy')).toBe(false)
    expect(
      within(cameraControls).getByText('Free flight', { selector: 'strong' }),
    ).toBeTruthy()
    expect(
      within(cameraControls).queryByText('Returning to system overview…'),
    ).toBeNull()
    expect(
      (within(cameraControls).getByRole('button', {
        name: 'System overview',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('lets a body camera view take precedence over stale frame state', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={CENTERED_BOREALIS}
        cameraFrameMode="free"
        cameraFrameTransitioning
        onCameraViewModeChange={vi.fn()}
        onReturnToPreviousView={vi.fn()}
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    expect(cameraControls.hasAttribute('aria-busy')).toBe(false)
    expect(within(cameraControls).getByText('Centered on Borealis')).toBeTruthy()
    expect(
      (within(cameraControls).getByRole('button', {
        name: 'Close approach',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(screen.queryByRole('region', { name: 'Free-flight camera controls' })).toBeNull()
  })

  it('preserves the legacy focus surface when frame props are omitted', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        onFocusSelectedObject={vi.fn()}
      />,
    )

    expect(screen.queryByRole('region', { name: /camera controls/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Center target/ })).toBeTruthy()
  })

  it('marks the current centered mode pressed and disabled', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={CENTERED_BOREALIS}
        onCameraViewModeChange={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    const orbit = within(cameraControls).getByRole('button', { name: 'Orbit' })
    const closeApproach = within(cameraControls).getByRole('button', {
      name: 'Close approach',
    })

    expect(orbit.getAttribute('aria-pressed')).toBe('true')
    expect((orbit as HTMLButtonElement).disabled).toBe(true)
    expect(closeApproach.getAttribute('aria-pressed')).toBe('false')
    expect((closeApproach as HTMLButtonElement).disabled).toBe(false)
  })

  it('routes Orbit, Close approach, Previous view, and System overview callbacks', () => {
    const onCameraViewModeChange = vi.fn()
    const onReturnToPreviousView = vi.fn()
    const onSystemOverview = vi.fn()
    const renderHud = (cameraView: BodyCenteredCameraView) => (
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={cameraView}
        onCameraViewModeChange={onCameraViewModeChange}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={onSystemOverview}
      />
    )
    const { rerender } = render(
      renderHud({ ...CENTERED_BOREALIS, mode: 'close-approach' }),
    )

    let cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    fireEvent.click(within(cameraControls).getByRole('button', { name: 'Orbit' }))
    expect(onCameraViewModeChange).toHaveBeenLastCalledWith('orbit')

    rerender(renderHud(CENTERED_BOREALIS))
    cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    fireEvent.click(
      within(cameraControls).getByRole('button', { name: 'Close approach' }),
    )
    fireEvent.click(
      within(cameraControls).getByRole('button', {
        name: 'Return to Asteria system frame',
      }),
    )
    fireEvent.click(
      within(cameraControls).getByRole('button', { name: 'System overview' }),
    )

    expect(onCameraViewModeChange).toHaveBeenLastCalledWith('close-approach')
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
    expect(onSystemOverview).toHaveBeenCalledTimes(1)
  })

  it('restores focus to system history after returning to system view', () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const onReturnToPreviousView = vi.fn()
    const renderHud = (cameraView: BodyCenteredCameraView | null) => (
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={cameraView}
        onCenterSelectedObject={vi.fn()}
        onCameraViewModeChange={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
      />
    )
    const { rerender } = render(renderHud(CENTERED_BOREALIS))

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    fireEvent.click(
      within(cameraControls).getByRole('button', {
        name: 'Return to Asteria system frame',
      }),
    )
    rerender(renderHud(null))

    const systemControls = screen.getByRole('region', {
      name: 'System camera controls',
    })
    const previousView = within(systemControls).getByRole('button', {
      name: 'Return to previous view',
    })
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrame).toHaveBeenCalled()
    expect(document.activeElement).toBe(previousView)
  })

  it('does not steal focus back from a persistent viewport after navigation', () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    const renderHud = (cameraView: BodyCenteredCameraView | null) => (
      <div>
        <button type="button" data-testid="persistent-viewport">
          Universe viewport
        </button>
        <ExplorerHud
          {...BASE_HUD_PROPS}
          selectedObject={SELECTED_ALPHA}
          cameraView={cameraView}
          onReturnToPreviousView={vi.fn()}
        />
      </div>
    )
    const { rerender } = render(renderHud(CENTERED_BOREALIS))

    fireEvent.click(
      within(
        screen.getByRole('region', {
          name: 'Body-centered camera controls',
        }),
      ).getByRole('button', { name: 'Return to Asteria system frame' }),
    )
    rerender(renderHud(null))
    const viewport = screen.getByTestId('persistent-viewport')
    viewport.focus()
    for (const callback of animationFrames.splice(0)) callback(0)

    expect(document.activeElement).toBe(viewport)
  })

  it('disables close approach when the selected object does not support it', () => {
    render(
      <ObjectInspector
        selectedObject={{ ...SELECTED_ALPHA, closeApproachAvailable: false }}
        cameraView={null}
        onCenterSelectedObject={vi.fn()}
      />,
    )

    const actions = screen.getByRole('group', {
      name: 'Center camera on Alpha',
    })
    expect(
      (within(actions).getByRole('button', {
        name: /^Close approach/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('keeps camera controls in the DOM at a mobile viewport width', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    try {
      render(
        <ExplorerHud
          {...BASE_HUD_PROPS}
          selectedObject={SELECTED_ALPHA}
          cameraView={CENTERED_BOREALIS}
          onCenterSelectedObject={vi.fn()}
          onCameraViewModeChange={vi.fn()}
          onReturnToPreviousView={vi.fn()}
          onSystemOverview={vi.fn()}
        />,
      )

      const cameraControls = screen.getByRole('region', {
        name: 'Body-centered camera controls',
      })
      expect(within(cameraControls).getByRole('button', { name: 'Orbit' })).toBeTruthy()
      expect(
        within(cameraControls).getByRole('button', { name: 'Close approach' }),
      ).toBeTruthy()
      expect(
        within(cameraControls).getByRole('button', {
          name: 'Return to Asteria system frame',
        }),
      ).toBeTruthy()
      expect(
        within(cameraControls).getByRole('button', { name: 'System overview' }),
      ).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      })
    }
  })

  it('presents the observed universe as an ICRS log-distance frame with an Intl host count', () => {
    const onReturnToPreviousView = vi.fn()
    const onSystemOverview = vi.fn()
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="observed-universe"
        cameraFrameCount={4_749}
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={onSystemOverview}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Observed-universe camera controls',
    })
    expect(
      within(cameraControls).getByText('Observed universe', {
        selector: 'strong',
      }),
    ).toBeTruthy()
    expect(
      within(cameraControls).getByText(
        'ICRS · Log-distance view · 4,749 host systems',
      ),
    ).toBeTruthy()

    const cameraContext = screen.getByText('Camera', { selector: 'dt' })
      .parentElement
    expect(cameraContext?.textContent).toContain('Observed universe')
    expect(cameraContext?.textContent).toContain(
      'ICRS · Log-distance view · 4,749 host systems',
    )

    const resetUniverse = within(cameraControls).getByRole('button', {
      name: 'Reset universe',
    })
    expect((resetUniverse as HTMLButtonElement).disabled).toBe(false)
    expect(resetUniverse.getAttribute('title')).toBe(
      'Reset observed-universe view (0)',
    )
    fireEvent.click(resetUniverse)
    expect(onSystemOverview).toHaveBeenCalledTimes(1)

    const previous = within(cameraControls).getByRole('button', {
      name: 'Return to Asteria system',
    })
    expect(previous.getAttribute('title')).toBe(
      'Return to Asteria system (Backspace)',
    )
    fireEvent.click(previous)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
  })

  it('opens a canonical observed host frame and routes back to the observed universe', () => {
    const onReturnToPreviousView = vi.fn()
    const onSystemOverview = vi.fn()
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={{ ...SELECTED_ALPHA, closeApproachAvailable: false }}
        cameraView={null}
        cameraFrameMode="observed-system"
        cameraFrameName="TRAPPIST-1"
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={onSystemOverview}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'TRAPPIST-1 system camera controls',
    })
    expect(
      within(cameraControls).getByText('TRAPPIST-1 system', {
        selector: 'strong',
      }),
    ).toBeTruthy()
    expect(
      within(cameraControls).getByText(
        'NASA archive-composite · Local visual scale',
      ),
    ).toBeTruthy()
    expect(screen.getByText('TRAPPIST-1 system', { selector: 'dd' })).toBeTruthy()

    const previous = within(cameraControls).getByRole('button', {
      name: 'Return to Observed universe',
    })
    expect((previous as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(previous)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)

    const overview = within(cameraControls).getByRole('button', {
      name: 'System overview',
    })
    expect(overview.getAttribute('title')).toBe(
      'Reset TRAPPIST-1 system overview (0)',
    )
    fireEvent.click(overview)
    expect(onSystemOverview).toHaveBeenCalledTimes(1)

    const inspectorActions = screen.getByRole('group', {
      name: 'Center camera on Alpha',
    })
    expect(
      (within(inspectorActions).getByRole('button', {
        name: /^Close approach/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('locks observed-system camera actions while returning to the universe', () => {
    const onReturnToPreviousView = vi.fn()
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={CENTERED_BOREALIS}
        cameraFrameMode="observed-system"
        cameraFrameName="Kepler-90"
        cameraHierarchyNavigationStatus="loading"
        onCameraViewModeChange={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    expect(cameraControls.getAttribute('aria-busy')).toBe('true')
    expect(
      within(cameraControls).getByText('Returning to observed universe…'),
    ).toBeTruthy()
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent === 'Returning to observed universe'),
    ).toBe(true)
    for (const button of within(cameraControls).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(onReturnToPreviousView).not.toHaveBeenCalled()
  })

  it('keeps focus on an enabled Retry action after hierarchy navigation fails', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const onReturnToPreviousView = vi.fn()
    const renderHud = (
      cameraHierarchyNavigationStatus: 'idle' | 'loading' | 'error',
    ) => (
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="observed-system"
        cameraFrameName="TRAPPIST-1"
        cameraHierarchyNavigationStatus={cameraHierarchyNavigationStatus}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={vi.fn()}
      />
    )
    const { rerender } = render(renderHud('idle'))
    const previous = screen.getByRole('button', {
      name: 'Return to Observed universe',
    })
    previous.focus()
    fireEvent.click(previous)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)

    rerender(renderHud('loading'))
    expect((previous as HTMLButtonElement).disabled).toBe(true)
    rerender(renderHud('error'))

    const retry = screen.getByRole('button', {
      name: 'Retry return to Observed universe',
    })
    expect((retry as HTMLButtonElement).disabled).toBe(false)
    expect(retry.getAttribute('title')).toBe(
      'Retry return to Observed universe (Backspace)',
    )
    expect(document.activeElement).toBe(retry)
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not return to observed universe from TRAPPIST-1 system. Retry is available.',
    )
    expect(
      within(
        screen.getByRole('region', {
          name: 'TRAPPIST-1 system camera controls',
        }),
      ).getByText(
        'TRAPPIST-1 remains open. Check the connection and retry.',
      ),
    ).toBeTruthy()
    fireEvent.click(retry)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(2)
  })

  it('reflects hierarchy loading in a standalone object inspector', () => {
    render(
      <ObjectInspector
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="observed-system"
        cameraFrameName="TOI-700"
        cameraHierarchyNavigationStatus="loading"
        onCenterSelectedObject={vi.fn()}
      />,
    )

    expect(screen.getByText('Returning to observed universe…')).toBeTruthy()
    expect(screen.getByText('Loading the verified host index')).toBeTruthy()
    const actions = screen.getByRole('group', {
      name: 'Center camera on Alpha',
    })
    expect(actions.getAttribute('aria-busy')).toBe('true')
    for (const button of within(actions).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('keeps the selected object distinct from a centered object inside an observed system', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={{
          ...CENTERED_BOREALIS,
          closeApproachAvailable: false,
        }}
        cameraFrameMode="observed-system"
        cameraFrameName="Kepler-90"
        onCenterSelectedObject={vi.fn()}
        onCameraViewModeChange={vi.fn()}
        onReturnToPreviousView={vi.fn()}
        onSystemOverview={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByText('Centered: Borealis')).toBeTruthy()
    const cameraContext = screen.getByText('Camera', { selector: 'dt' })
      .parentElement
    expect(cameraContext?.textContent).toContain('Centered on Borealis')
    expect(cameraContext?.textContent).toContain('Kepler-90 system')

    const cameraControls = screen.getByRole('region', {
      name: 'Body-centered camera controls',
    })
    expect(
      within(cameraControls).getByText('Centered on Borealis', {
        selector: 'strong',
      }),
    ).toBeTruthy()
    expect(
      (within(cameraControls).getByRole('button', {
        name: 'Close approach',
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (within(cameraControls).getByRole('button', {
        name: 'System overview',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('announces an observed-system transition and disables its camera actions in transit', () => {
    render(
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode="observed-system"
        cameraFrameName="TOI-700"
        cameraFrameTransitioning
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={vi.fn()}
        onSystemOverview={vi.fn()}
      />,
    )

    const cameraControls = screen.getByRole('region', {
      name: 'TOI-700 system camera controls',
    })
    expect(cameraControls.getAttribute('aria-busy')).toBe('true')
    expect(
      within(cameraControls).getByText('Opening TOI-700 system…'),
    ).toBeTruthy()
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent === 'Opening TOI-700 system'),
    ).toBe(true)
    for (const button of within(cameraControls).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('restores keyboard focus after returning from a host system to the observed universe', () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const onReturnToPreviousView = vi.fn()
    const renderHud = (
      cameraFrameMode: 'observed-system' | 'observed-universe',
      cameraFrameTransitioning: boolean,
    ) => (
      <ExplorerHud
        {...BASE_HUD_PROPS}
        selectedObject={SELECTED_ALPHA}
        cameraView={null}
        cameraFrameMode={cameraFrameMode}
        cameraFrameName={
          cameraFrameMode === 'observed-system' ? 'TRAPPIST-1' : undefined
        }
        cameraFrameCount={4_749}
        cameraFrameTransitioning={cameraFrameTransitioning}
        onCenterSelectedObject={vi.fn()}
        onReturnToPreviousView={onReturnToPreviousView}
        onSystemOverview={vi.fn()}
      />
    )
    const { rerender } = render(renderHud('observed-system', false))

    fireEvent.click(
      within(
        screen.getByRole('region', {
          name: 'TRAPPIST-1 system camera controls',
        }),
      ).getByRole('button', { name: 'Return to Observed universe' }),
    )
    rerender(renderHud('observed-universe', true))
    rerender(renderHud('observed-universe', false))

    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrame).toHaveBeenCalled()
    expect(document.activeElement).toBe(
      within(
        screen.getByRole('region', {
          name: 'Observed-universe camera controls',
        }),
      ).getByRole('button', { name: 'Return to Asteria system' }),
    )
  })

  it('keeps observed-system actions accessible at a mobile viewport width', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    try {
      render(
        <ExplorerHud
          {...BASE_HUD_PROPS}
          selectedObject={SELECTED_ALPHA}
          cameraView={CENTERED_BOREALIS}
          cameraFrameMode="observed-system"
          cameraFrameName="Kepler-90"
          onCameraViewModeChange={vi.fn()}
          onReturnToPreviousView={vi.fn()}
          onSystemOverview={vi.fn()}
        />,
      )

      const cameraControls = screen.getByRole('region', {
        name: 'Body-centered camera controls',
      })
      expect(
        within(cameraControls).getByRole('button', { name: 'Orbit' }),
      ).toBeTruthy()
      expect(
        within(cameraControls).getByRole('button', {
          name: 'Close approach',
        }),
      ).toBeTruthy()
      expect(
        within(cameraControls).getByRole('button', {
          name: 'System overview',
        }),
      ).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      })
    }
  })

  it.each([
    [
      'en',
      'Retry return to Observed universe',
      'Could not return to observed universe from Kepler-90 system. Retry is available.',
    ],
    [
      'es',
      'Reintentar volver al universo observado',
      'No se pudo volver al universo observado desde el sistema Kepler-90. Se puede volver a intentar.',
    ],
    [
      'zh-TW',
      '重試返回觀測宇宙',
      '無法從 Kepler-90 系統返回觀測宇宙。可以重試。',
    ],
    [
      'fr',
      'Réessayer le retour à l’univers observé',
      'Impossible de revenir à l’univers observé depuis le système Kepler-90. Une nouvelle tentative est possible.',
    ],
  ])(
    'localizes observed hierarchy recovery in %s',
    async (language, retryLabel, alertText) => {
      i18n.addResourceBundle(
        language,
        'hud',
        hudResources[language as keyof typeof hudResources],
        true,
        true,
      )
      await i18n.changeLanguage(language)
      render(
        <ExplorerHud
          {...BASE_HUD_PROPS}
          cameraView={null}
          cameraFrameMode="observed-system"
          cameraFrameName="Kepler-90"
          cameraHierarchyNavigationStatus="error"
          onReturnToPreviousView={vi.fn()}
          onSystemOverview={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: retryLabel })).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toBe(alertText)
    },
  )

  it.each([
    ['en', 'en-US', 'Observed universe.'],
    ['es', 'es-ES', 'Universo observado.'],
    ['zh-TW', 'zh-TW', '觀測宇宙。'],
    ['fr', 'fr-FR', 'Univers observé.'],
  ])(
    'announces the observed universe and localized host count in %s',
    async (language, intlLocale, announcementPrefix) => {
      i18n.addResourceBundle(
        language,
        'hud',
        hudResources[language as keyof typeof hudResources],
        true,
        true,
      )
      await i18n.changeLanguage(language)
      render(
        <ExplorerHud
          {...BASE_HUD_PROPS}
          cameraView={null}
          cameraFrameMode="observed-universe"
          cameraFrameCount={4_749}
          onSystemOverview={vi.fn()}
        />,
      )

      const expectedCount = new Intl.NumberFormat(intlLocale).format(4_749)
      const announcement = screen
        .getAllByRole('status')
        .find((status) => status.textContent?.startsWith(announcementPrefix))
      expect(announcement).toBeTruthy()
      expect(announcement?.textContent).toContain(expectedCount)
    },
  )
})
