import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { Keyboard, X } from 'lucide-react'

interface ShortcutHelpDialogProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { keys: ['/'], action: 'Open universal search' },
  { keys: ['?'], action: 'Show this keyboard guide' },
  { keys: ['Esc'], action: 'Close a panel and return to Explore' },
  { keys: ['G'], action: 'Center the selected body in orbit view' },
  { keys: ['Shift', 'G'], action: 'Move to a close approach when available' },
  { keys: ['Backspace'], action: 'Return to the previous camera view' },
  { keys: ['0'], action: 'Return to the system overview' },
  { keys: ['W', 'A', 'S', 'D'], action: 'Fly through the current reference frame' },
  { keys: ['Q', 'E'], action: 'Move vertically' },
  { keys: ['Space'], action: 'Pause or resume simulation time' },
] as const

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
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
            <small>Flight manual</small>
            <h2 id={titleId}>Keyboard shortcuts</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <dl className="shortcut-dialog__list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action}>
              <dt>
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>

        <p>
          Text fields capture typing, so flight controls remain inactive while search is focused.
        </p>
      </div>
    </div>
  )
}
