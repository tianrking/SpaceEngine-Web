// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n, setAppLocale } from '../i18n/i18n'
import type { AppLocale } from '../i18n/locale'
import { hudResources } from '../i18n/namespaces/hud'
import { ExplorerHud } from './ExplorerHud'

const CASES: Array<{
  locale: AppLocale
  status: string
  navigation: string
  inspector: string
  time: string
  cinematic: string
}> = [
  {
    locale: 'en',
    status: 'Simulation status',
    navigation: 'Universe navigation',
    inspector: 'Selected object inspector',
    time: 'Simulation time controls',
    cinematic: 'Enable cinematic mode',
  },
  {
    locale: 'es',
    status: 'Estado de la simulación',
    navigation: 'Navegación del universo',
    inspector: 'Inspector del objeto seleccionado',
    time: 'Controles del tiempo de simulación',
    cinematic: 'Activar modo cinematográfico',
  },
  {
    locale: 'zh-TW',
    status: '模擬狀態',
    navigation: '宇宙導覽',
    inspector: '所選天體檢視器',
    time: '模擬時間控制',
    cinematic: '開啟電影模式',
  },
  {
    locale: 'fr',
    status: 'État de la simulation',
    navigation: 'Navigation dans l’univers',
    inspector: 'Inspecteur de l’objet sélectionné',
    time: 'Commandes du temps de simulation',
    cinematic: 'Activer le mode cinématique',
  },
]

afterEach(async () => {
  cleanup()
  window.localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('Explorer HUD internationalization', () => {
  it('keeps every HUD namespace at exact four-locale key parity', () => {
    const leafKeys = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key
        return typeof child === 'string'
          ? [path]
          : leafKeys(child as object, path)
      })
    const englishKeys = leafKeys(hudResources.en)

    expect(englishKeys).toHaveLength(151)
    for (const localeCase of CASES) {
      expect(leafKeys(hudResources[localeCase.locale])).toEqual(englishKeys)
    }
  })

  it('updates visible and accessible HUD copy across all supported locales', async () => {
    render(
      <ExplorerHud
        webGpuStatus="active"
        fps={60}
        speed={1_234}
        quality="balanced"
        cinematic={false}
        simulationTime={new Date('2187-03-20T14:32:00.000Z')}
        timeScale={1_000}
      />,
    )

    for (const localeCase of CASES) {
      await act(() => setAppLocale(localeCase.locale))

      expect(
        screen.getByRole('region', { name: localeCase.status }),
      ).toBeTruthy()
      expect(
        screen.getByRole('navigation', { name: localeCase.navigation }),
      ).toBeTruthy()
      expect(
        screen.getByRole('complementary', { name: localeCase.inspector }),
      ).toBeTruthy()
      expect(screen.getByRole('region', { name: localeCase.time })).toBeTruthy()
      expect(
        screen.getByRole('button', { name: localeCase.cinematic }),
      ).toBeTruthy()
    }
  })

  it('switches the welcome experience to Traditional Chinese before entry', async () => {
    await setAppLocale('en')
    render(
      <ExplorerHud
        webGpuStatus="active"
        fps={60}
        speed={0}
        quality="balanced"
        cinematic={false}
        simulationTime={new Date('2187-03-20T14:32:00.000Z')}
        timeScale={1}
        overlay="welcome"
      />,
    )

    const language = screen.getByRole('combobox', { name: 'Language' })
    fireEvent.change(language, { target: { value: 'zh-TW' } })

    expect(
      await screen.findByRole('heading', { name: '每一片地平線都能抵達。' }),
    ).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '語言' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '關閉歡迎畫面' })).toBeTruthy()
  })
})
