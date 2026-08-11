import type { CSSProperties } from 'react'
import { ArrowDownToLine, LocateFixed, MousePointer2, Move3d, Orbit } from 'lucide-react'
import type { NavigationTarget } from '../engine/types'

interface SystemNavigatorProps {
  targets: readonly NavigationTarget[]
  selectedId: string | null
  hidden?: boolean
  onSelect: (id: string) => void
  onFocus: (id: string, surface?: boolean) => void
}

const KIND_LABELS: Record<NavigationTarget['kind'], string> = {
  star: 'G2 V star',
  terrestrial: 'temperate terra',
  oceanic: 'ocean world',
  desert: 'rocky desert',
  'gas-giant': 'gas giant',
  'ice-giant': 'ice giant',
}

export function SystemNavigator({
  targets,
  selectedId,
  hidden = false,
  onSelect,
  onFocus,
}: SystemNavigatorProps) {
  return (
    <aside className={`system-navigator${hidden ? ' is-hidden' : ''}`} aria-label="Asteria system browser">
      <div className="system-navigator__heading">
        <div>
          <span>Current system</span>
          <strong>Asteria · 7A51E2</strong>
        </div>
        <Orbit size={18} aria-hidden="true" />
      </div>

      <div className="system-navigator__targets" role="listbox" aria-label="Celestial objects">
        {targets.map((target, index) => {
          const selected = target.id === selectedId
          return (
            <button
              key={target.id}
              className={selected ? 'is-selected' : undefined}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(target.id)}
              onDoubleClick={() => onFocus(target.id)}
            >
              <span className="system-navigator__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="system-navigator__body" style={{ '--body-color': target.color } as CSSProperties} />
              <span className="system-navigator__label">
                <strong>{target.name}</strong>
                <small>{KIND_LABELS[target.kind]}</small>
              </span>
              {selected ? <LocateFixed size={15} aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>

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
