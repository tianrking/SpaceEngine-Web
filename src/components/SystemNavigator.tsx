import { memo, type CSSProperties } from 'react'
import {
  ArrowDownToLine,
  Crosshair,
  LocateFixed,
  MousePointer2,
  Move3d,
  Orbit,
} from 'lucide-react'
import type { NavigationTarget } from '../engine/types'

export interface SystemNavigatorProps {
  targets: readonly NavigationTarget[]
  selectedId: string | null
  centeredId?: string | null
  centeredViewMode?: 'orbit' | 'close-approach'
  centeredTransitioning?: boolean
  hidden?: boolean
  onSelect: (id: string) => void
  onFocus: (id: string, surface?: boolean) => void
}

function SystemNavigatorComponent({
  targets,
  selectedId,
  centeredId = null,
  centeredViewMode,
  centeredTransitioning = false,
  hidden = false,
  onSelect,
  onFocus,
}: SystemNavigatorProps) {
  if (hidden) return null
  const centeredTarget = targets.find((target) => target.id === centeredId)
  const selectedTarget = targets.find((target) => target.id === selectedId)

  return (
    <aside
      className="system-navigator"
      aria-label="Asteria system browser"
    >
      <div className="system-navigator__heading">
        <div>
          <span>Current system</span>
          <strong>Asteria · 7A51E2</strong>
        </div>
        <Orbit size={18} aria-hidden="true" />
      </div>

      {centeredTarget ? (
        <div
          className="system-navigator__centered-status"
        >
          <Crosshair size={13} aria-hidden="true" />
          <span>{centeredTransitioning ? 'Centering on' : 'Centered on'}</span>
          <strong>{centeredTarget.name}</strong>
          <small>
            {centeredTransitioning
              ? 'In transit'
              : centeredViewMode === 'close-approach'
                ? 'Close approach'
                : 'Orbit'}
          </small>
        </div>
      ) : null}

      <ul className="system-navigator__targets" aria-label="Celestial objects">
        {targets.map((target, index) => {
          const selected = target.id === selectedId
          const cameraTarget = target.id === centeredId
          const centered = cameraTarget && !centeredTransitioning
          const centering = cameraTarget && centeredTransitioning
          return (
            <li key={target.id}>
              <button
                className={[
                  selected ? 'is-selected' : '',
                  centered ? 'is-centered' : '',
                  centering ? 'is-centering' : '',
                ].filter(Boolean).join(' ') || undefined}
                type="button"
                aria-pressed={selected}
                aria-current={centered ? 'location' : undefined}
                aria-label={`${target.name}, ${target.bodyClass}${selected ? ', selected' : ''}${centered ? ', camera centered' : ''}${centering ? ', camera centering' : ''}`}
                onClick={() => onSelect(target.id)}
                onDoubleClick={() => onFocus(target.id)}
              >
                <span className="system-navigator__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="system-navigator__body" style={{ '--body-color': target.color } as CSSProperties} />
                <span className="system-navigator__label">
                  <strong>{target.name}</strong>
                  <small>{target.bodyClass}</small>
                </span>
                {cameraTarget ? (
                  <Crosshair size={15} aria-hidden="true" />
                ) : selected ? (
                  <LocateFixed size={15} aria-hidden="true" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {selectedTarget ? (
        <div
          className="system-navigator__actions"
          role="group"
          aria-label={`Camera views for ${selectedTarget.name}`}
          aria-busy={centeredTransitioning || undefined}
        >
          <button
            type="button"
            aria-pressed={
              selectedTarget.id === centeredId && centeredViewMode === 'orbit'
            }
            disabled={
              centeredTransitioning ||
              (selectedTarget.id === centeredId && centeredViewMode === 'orbit')
            }
            onClick={() => onFocus(selectedTarget.id)}
          >
            <LocateFixed size={15} />
            <span>
              {selectedTarget.id === centeredId && centeredTransitioning
                ? 'Centering…'
                : selectedTarget.id === centeredId && centeredViewMode === 'orbit'
                ? 'Orbit active'
                : 'Go to orbit'}
            </span>
          </button>
          {selectedTarget.bodyKind !== 'star' ? (
            <button
              type="button"
              aria-pressed={
                selectedTarget.id === centeredId &&
                centeredViewMode === 'close-approach'
              }
              disabled={
                centeredTransitioning ||
                (selectedTarget.id === centeredId &&
                  centeredViewMode === 'close-approach')
              }
              onClick={() => onFocus(selectedTarget.id, true)}
            >
              <ArrowDownToLine size={15} />
              <span>
                {selectedTarget.id === centeredId && centeredTransitioning
                  ? 'Centering…'
                  : selectedTarget.id === centeredId &&
                    centeredViewMode === 'close-approach'
                  ? 'Approach active'
                  : 'Close approach'}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="system-navigator__hint">
        <span><MousePointer2 size={13} /> drag to orbit</span>
        <span><Move3d size={13} /> WASD + Q/E to fly</span>
        <kbd>G</kbd><span>center selected</span>
      </div>
    </aside>
  )
}

export const SystemNavigator = memo(SystemNavigatorComponent)
