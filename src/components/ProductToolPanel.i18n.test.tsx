// @vitest-environment jsdom

import { createRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  i18n,
  readStoredLocale,
  setAppLocale,
  SUPPORTED_LOCALES,
} from '../i18n'
import { toolsResources } from '../i18n/namespaces/tools'
import { ProductToolPanel, type ProductToolPanelProps } from './ProductToolPanel'
import { ShortcutHelpDialog } from './ShortcutHelpDialog'

function panelProps(): ProductToolPanelProps {
  return {
    tool: 'settings',
    targets: [],
    selectedId: null,
    savedPlaces: [],
    persistence: 'local',
    capabilities: null,
    telemetry: null,
    searchInputRef: createRef<HTMLInputElement>(),
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
    onClearSaved: vi.fn(),
    onClose: vi.fn(),
    onResetView: vi.fn(),
    onOpenQuickTour: vi.fn(),
    onOpenShortcuts: vi.fn(),
  }
}

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

beforeAll(() => {
  for (const locale of SUPPORTED_LOCALES) {
    i18n.addResourceBundle(locale, 'tools', toolsResources[locale], true, true)
  }
})

beforeEach(async () => {
  window.localStorage.clear()
  await setAppLocale('en')
})

afterEach(cleanup)

describe('product tools localization', () => {
  it('keeps the tools namespace structurally identical in every locale', () => {
    const englishKeys = leafKeys(toolsResources.en).sort()
    expect(englishKeys.length).toBeGreaterThan(100)
    for (const locale of SUPPORTED_LOCALES) {
      expect(leafKeys(toolsResources[locale]).sort()).toEqual(englishKeys)
    }
  })

  it('changes language immediately and persists the selection', async () => {
    render(<ProductToolPanel {...panelProps()} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    const languageSelect = screen.getByLabelText('Interface language')
    expect((languageSelect as HTMLSelectElement).value).toBe('en')

    fireEvent.change(languageSelect, { target: { value: 'fr' } })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeTruthy()
    })
    expect(
      (screen.getByLabelText('Langue de l’interface') as HTMLSelectElement)
        .value,
    ).toBe('fr')
    expect(readStoredLocale(window.localStorage)).toBe('fr')
  })

  it.each([
    ['en', 'Settings', 'Display calibration', 'Keyboard guide'],
    ['es', 'Ajustes', 'Calibración de pantalla', 'Guía del teclado'],
    ['zh-TW', '設定', '顯示校正', '鍵盤指南'],
    ['fr', 'Paramètres', 'Étalonnage de l’affichage', 'Guide du clavier'],
  ] as const)(
    'renders representative settings copy in %s',
    async (locale, title, calibration, keyboardGuide) => {
      await setAppLocale(locale)
      render(<ProductToolPanel {...panelProps()} />)

      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
      expect(screen.getByText(calibration)).toBeTruthy()
      expect(screen.getByText(keyboardGuide)).toBeTruthy()
    },
  )

  it.each([
    ['en', 'Keyboard shortcuts', 'Pause or resume simulation time'],
    ['es', 'Atajos de teclado', 'Pausar o reanudar el tiempo de simulación'],
    ['zh-TW', '鍵盤快捷鍵', '暫停或繼續模擬時間'],
    ['fr', 'Raccourcis clavier', 'Suspendre ou reprendre le temps de simulation'],
  ] as const)(
    'renders the shortcut guide in %s',
    async (locale, title, pauseAction) => {
      await setAppLocale(locale)
      render(<ShortcutHelpDialog open onClose={vi.fn()} />)

      expect(screen.getByRole('dialog', { name: title })).toBeTruthy()
      expect(screen.getByText(pauseAction)).toBeTruthy()
    },
  )
})
