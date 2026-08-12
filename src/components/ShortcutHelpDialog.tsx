import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { Keyboard, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ShortcutHelpDialogProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { keys: ['/'], actionKey: 'search' },
  { keys: ['?'], actionKey: 'guide' },
  { keys: ['Esc'], actionKey: 'escape' },
  { keys: ['G'], actionKey: 'center' },
  { keys: ['Shift', 'G'], actionKey: 'approach' },
  { keys: ['Backspace'], actionKey: 'previous' },
  { keys: ['0'], actionKey: 'overview' },
  { keys: ['W', 'A', 'S', 'D'], actionKey: 'fly' },
  { keys: ['Q', 'E'], actionKey: 'vertical' },
  { keys: ['Space'], actionKey: 'pause' },
] as const

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
  const { t } = useTranslation('tools')
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    closeButtonRef.current?.focus()
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus()
      }
    }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      closeButtonRef.current?.focus()
    }
  }

  return (
    <div className="shortcut-dialog-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className="shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <span className="shortcut-dialog__mark" aria-hidden="true">
            <Keyboard size={20} />
          </span>
          <div>
            <small>{t('shortcuts.eyebrow')}</small>
            <h2 id={titleId}>{t('shortcuts.title')}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('shortcuts.close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <dl className="shortcut-dialog__list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.actionKey}>
              <dt>
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </dt>
              <dd>{t(`shortcuts.actions.${shortcut.actionKey}`)}</dd>
            </div>
          ))}
        </dl>

        <p>
          {t('shortcuts.note')}
        </p>
      </div>
    </div>
  )
}
