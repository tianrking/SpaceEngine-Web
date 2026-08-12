import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAppLocale, LocaleDocumentSync } from './i18n'
import { registerOfflineShell } from './pwa/registerServiceWorker'

registerOfflineShell()

async function bootstrap(): Promise<void> {
  try {
    await initializeAppLocale()
  } catch (error: unknown) {
    console.error('Unable to load the application language pack.', error)
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML = `
        <main role="alert" aria-live="assertive" style="min-height:100vh;display:grid;place-items:center;padding:2rem;background:#020713;color:#f4f8ff;font:16px/1.5 system-ui,sans-serif">
          <section style="max-width:34rem;text-align:center">
            <h1 style="font-size:1.5rem">Astral Surveyor could not start</h1>
            <p>The English language pack could not be loaded. Check your connection and try again.</p>
            <button data-retry-start type="button" style="margin-top:1rem;padding:.75rem 1rem;border:1px solid #5ee7ff;border-radius:.65rem;background:#09263b;color:#fff;cursor:pointer">Retry</button>
          </section>
        </main>`
      root
        .querySelector<HTMLButtonElement>('[data-retry-start]')
        ?.addEventListener('click', () => window.location.reload())
    }
    return
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LocaleDocumentSync />
      <App />
    </StrictMode>,
  )

}

void bootstrap()
