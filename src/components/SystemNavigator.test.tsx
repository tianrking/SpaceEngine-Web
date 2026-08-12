// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NavigationTarget } from '../engine/types'
import { SystemNavigator } from './SystemNavigator'

const TARGETS: readonly NavigationTarget[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    kind: 'terrestrial',
    bodyKind: 'planet',
    bodyClass: 'Terrestrial planet',
    color: '#7be8ed',
  },
  {
    id: 'borealis',
    name: 'Borealis',
    kind: 'gas-giant',
    bodyKind: 'planet',
    bodyClass: 'Gas giant',
    color: '#ff8e81',
  },
]

afterEach(cleanup)

describe('SystemNavigator camera state', () => {
  it('exposes selected Alpha and camera-centered Borealis as different ARIA states', () => {
    render(
      <SystemNavigator
        targets={TARGETS}
        selectedId="alpha"
        centeredId="borealis"
        centeredViewMode="orbit"
        onSelect={vi.fn()}
        onFocus={vi.fn()}
      />,
    )

    const alpha = screen.getByRole('button', {
      name: /Alpha, Terrestrial planet, selected/,
    })
    const borealis = screen.getByRole('button', {
      name: /Borealis, Gas giant, camera centered/,
    })

    expect(alpha.getAttribute('aria-pressed')).toBe('true')
    expect(alpha.hasAttribute('aria-current')).toBe(false)
    expect(borealis.getAttribute('aria-pressed')).toBe('false')
    expect(borealis.getAttribute('aria-current')).toBe('location')
  })

  it('disables camera actions while transitioning and shows the destination', () => {
    render(
      <SystemNavigator
        targets={TARGETS}
        selectedId="alpha"
        centeredId="borealis"
        centeredViewMode="close-approach"
        centeredTransitioning
        onSelect={vi.fn()}
        onFocus={vi.fn()}
      />,
    )

    const navigator = screen.getByRole('complementary', {
      name: 'Asteria system browser',
    })
    expect(navigator.hasAttribute('aria-busy')).toBe(false)
    const centeredStatus = navigator.querySelector(
      '.system-navigator__centered-status',
    )
    expect(centeredStatus?.textContent).toContain('Centering on')
    expect(centeredStatus?.textContent).toContain('Borealis')
    expect(screen.queryByRole('status')).toBeNull()

    const actions = screen.getByRole('group', {
      name: 'Camera views for Alpha',
    })
    expect(actions.getAttribute('aria-busy')).toBe('true')
    for (const button of within(actions).getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('marks the selected current orbit mode pressed and disabled', () => {
    const onFocus = vi.fn()
    render(
      <SystemNavigator
        targets={TARGETS}
        selectedId="alpha"
        centeredId="alpha"
        centeredViewMode="orbit"
        onSelect={vi.fn()}
        onFocus={onFocus}
      />,
    )

    const orbit = screen.getByRole('button', { name: /Orbit active/ })
    const closeApproach = screen.getByRole('button', { name: /Close approach/ })
    expect(orbit.getAttribute('aria-pressed')).toBe('true')
    expect((orbit as HTMLButtonElement).disabled).toBe(true)
    expect(closeApproach.getAttribute('aria-pressed')).toBe('false')
    expect((closeApproach as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(closeApproach)
    expect(onFocus).toHaveBeenCalledWith('alpha', true)
  })

  it('retains explicit orbit and close-approach controls at mobile width', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    try {
      render(
        <SystemNavigator
          targets={TARGETS}
          selectedId="alpha"
          centeredId={null}
          onSelect={vi.fn()}
          onFocus={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: /Go to orbit/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Close approach/ })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      })
    }
  })
})
