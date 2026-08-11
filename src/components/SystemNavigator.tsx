import { memo, type CSSProperties } from 'react'
import { ArrowDownToLine, LocateFixed, MousePointer2, Move3d, Orbit } from 'lucide-react'
import type { NavigationTarget } from '../engine/types'

interface SystemNavigatorProps {
  targets: readonly NavigationTarget[]
  selectedId: string | null
  hidden?: boolean
  onSelect: (id: string) => void
  onFocus: (id: string, surface?: boolean) => void
}

function SystemNavigatorComponent({
  targets,
  selectedId,
  hidden = false,
  onSelect,
  onFocus,
}: SystemNavigatorProps) {
  if (hidden) return null

  return (
    <aside className="system-navigator" aria-label="Asteria system browser">
      <div className="system-navigator__heading">
        <div>
          <span>Current system</span>
          <strong>Asteria · 7A51E2</strong>
        </div>
        <Orbit size={18} aria-hidden="true" />
      </div>

      <ul className="system-navigator__targets" aria-label="Celestial objects">
        {targets.map((target, index) => {
          const selected = target.id === selectedId
          return (
            <li key={target.id}>
              <button
                className={selected ? 'is-selected' : undefined}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(target.id)}
                onDoubleClick={() => onFocus(target.id)}
              >
                <span className="system-navigator__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="system-navigator__body" style={{ '--body-color': target.color } as CSSProperties} />
                <span className="system-navigator__label">
                  <strong>{target.name}</strong>
                  <small>{target.bodyClass}</small>
                </span>
                {selected ? <LocateFixed size={15} aria-hidden="true" /> : null}
              </button>
            </li>
          )
        })}
      </ul>

      {selectedId ? (
        <div className="system-navigator__actions">
          <button type="button" onClick={() => onFocus(selectedId)}>
            <LocateFixed size={15} />
            Go to orbit
          </button>
          {selectedId !== 'asteria' ? (
            <button type="button" onClick={() => onFocus(selectedId, true)}>
              <ArrowDownToLine size={15} />
              Close approach
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="system-navigator__hint">
        <span><MousePointer2 size={13} /> drag to orbit</span>
        <span><Move3d size={13} /> WASD + Q/E to fly</span>
        <kbd>G</kbd><span>focus target</span>
      </div>
    </aside>
  )
}

export const SystemNavigator = memo(SystemNavigatorComponent)
