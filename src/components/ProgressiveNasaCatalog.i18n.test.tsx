// @vitest-environment jsdom

import { createRef } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppLocale } from '../i18n'
import { ProgressiveNasaCatalog } from './ProgressiveNasaCatalog'

const catalogClient = vi.hoisted(() => ({
  initialize: vi.fn(() => new Promise(() => undefined)),
  cancel: vi.fn(),
}))

vi.mock('../data/progressiveCatalogClient', () => ({
  getProgressiveCatalogClient: () => ({
    initialize: catalogClient.initialize,
    cancel: catalogClient.cancel,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('progressive NASA catalogue localization', () => {
  it.each([
    ['en', 'Loading the progressive NASA catalogue', 'Verifying the full archive index'],
    ['es', 'Cargando el catálogo progresivo de la NASA', 'Verificando el índice completo del archivo'],
    ['zh-TW', '正在載入 NASA 漸進式目錄', '正在驗證完整歸檔索引'],
    ['fr', 'Chargement du catalogue progressif de la NASA', 'Vérification de l’index complet des archives'],
  ] as const)(
    'renders representative loading copy in %s',
    async (locale, announcement, status) => {
      await setAppLocale(locale)
      render(<ProgressiveNasaCatalog searchInputRef={createRef<HTMLInputElement>()} />)

      expect(screen.getByRole('status').textContent).toContain(announcement)
      expect(screen.getByText(status)).toBeTruthy()
      cleanup()
    },
  )

  it('does not restart the catalogue client when language changes', async () => {
    await setAppLocale('en')
    render(<ProgressiveNasaCatalog searchInputRef={createRef<HTMLInputElement>()} />)
    await waitFor(() => expect(catalogClient.initialize).toHaveBeenCalledTimes(1))

    await setAppLocale('fr')
    expect(screen.getByText('Vérification de l’index complet des archives')).toBeTruthy()
    expect(catalogClient.initialize).toHaveBeenCalledTimes(1)
  })
})
