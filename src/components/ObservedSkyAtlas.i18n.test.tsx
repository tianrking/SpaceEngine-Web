// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProgressiveHostSkyIndex } from '../data/progressiveExoplanetCatalog'
import { i18n, setAppLocale, SUPPORTED_LOCALES } from '../i18n'
import { nasaResources } from '../i18n/namespaces/nasa'
import { ObservedSkyAtlas } from './ObservedSkyAtlas'

const index: ProgressiveHostSkyIndex = {
  schemaVersion: '1.0.0',
  catalogRevision: 'test-release',
  coordinateFrame: 'ICRS',
  columns: [],
  provenance: {
    selection: 'NASA source selection',
    conflictPolicy: 'NASA conflict policy',
    nullPolicy: 'NASA null policy',
  },
  records: [
    ['Kepler-186', 299.0, 43.8, 12.5, 14.62, 'M1 V', 5, 1, 'Gaia DR3 123', null, 'Kepler-186 f'],
  ],
}

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  for (const locale of SUPPORTED_LOCALES) {
    i18n.addResourceBundle(locale, 'nasa', nasaResources[locale], true, true)
  }
})

afterEach(cleanup)

describe('observed NASA sky localization', () => {
  it.each([
    ['en', 'Observed host sky', 'ICRS discovery atlas', 'Open verified system records', '12.5 pc'],
    ['es', 'Cielo de anfitriones observados', 'Atlas de descubrimientos ICRS', 'Abrir registros verificados del sistema', '12,5 pc'],
    ['zh-TW', '已觀測宿主星空', 'ICRS 發現圖集', '開啟已驗證系統記錄', '12.5 pc'],
    ['fr', 'Ciel des hôtes observés', 'Atlas des découvertes ICRS', 'Ouvrir les enregistrements vérifiés du système', '12,5 pc'],
  ] as const)(
    'renders representative atlas copy and localized numbers in %s',
    async (locale, eyebrow, title, open, distance) => {
      await setAppLocale(locale)
      render(
        <ObservedSkyAtlas
          index={index}
          filterQuery=""
          loadMs={1.5}
          source="memory"
          onOpenHost={vi.fn()}
        />,
      )

      expect(screen.getByText(eyebrow)).toBeTruthy()
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
      expect(screen.getByRole('button', { name: open })).toBeTruthy()
      expect(screen.getByText(distance)).toBeTruthy()
      expect(screen.getByText('Kepler-186')).toBeTruthy()
      expect(screen.getByText('M1 V · 5', { exact: false })).toBeTruthy()
      cleanup()
    },
  )
})
