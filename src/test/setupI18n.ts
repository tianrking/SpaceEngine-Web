import { beforeAll } from 'vitest'
import { initializeAppLocale } from '../i18n/i18n'

beforeAll(async () => {
  await initializeAppLocale()
})
