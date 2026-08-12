// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(within(cameraControls).getByText('System overview')).toBeTruthy()
    const previousView = within(cameraControls).getByRole('button', {
      name: 'Return to previous view',
    })
    expect((previousView as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(previousView)
    expect(onReturnToPreviousView).toHaveBeenCalledTimes(1)
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
})
