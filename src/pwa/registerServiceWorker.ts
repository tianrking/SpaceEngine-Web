export function runWhenPageLoaded(
  action: () => void,
  readyState: DocumentReadyState = document.readyState,
  addLoadListener: (listener: () => void) => void = (listener) => {
    window.addEventListener('load', listener, { once: true })
  },
): void {
  if (readyState === 'complete') action()
  else addLoadListener(action)
}

export function registerOfflineShell(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const register = () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined)
  }

  runWhenPageLoaded(register)
}
