import { memo, useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  Crosshair,
  LocateFixed,
  MousePointer2,
  Move3d,
  Orbit,
} from 'lucide-react'
import type { NavigationTarget } from '../engine/types'
import { localeOption } from '../i18n'

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
  const { t, i18n } = useTranslation('tools')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const indexFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale, {
        minimumIntegerDigits: 2,
        useGrouping: false,
      }),
    [intlLocale],
  )
  if (hidden) return null
  const centeredTarget = targets.find((target) => target.id === centeredId)
  const selectedTarget = targets.find((target) => target.id === selectedId)

  return (
    <aside
      className="system-navigator"
      aria-label={t('navigator.browserLabel')}
    >
      <div className="system-navigator__heading">
        <div>
          <span>{t('navigator.currentSystem')}</span>
          <strong>Asteria · 7A51E2</strong>
        </div>
        <Orbit size={18} aria-hidden="true" />
      </div>

      {centeredTarget ? (
        <div
          className="system-navigator__centered-status"
        >
          <Crosshair size={13} aria-hidden="true" />
          <span>
            {centeredTransitioning
              ? t('navigator.centeringStatus')
              : t('navigator.centeredStatus')}
          </span>
          <strong>{centeredTarget.name}</strong>
          <small>
            {centeredTransitioning
              ? t('navigator.inTransit')
              : centeredViewMode === 'close-approach'
                ? t('navigator.closeApproach')
                : t('navigator.orbit')}
          </small>
        </div>
      ) : null}

      <ul
        className="system-navigator__targets"
        aria-label={t('navigator.objectsLabel')}
      >
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
                aria-label={t('navigator.targetAria', {
                  name: target.name,
                  class: target.bodyClass,
                  selected: selected ? t('navigator.selectedSuffix') : '',
                  centered: centered ? t('navigator.centeredSuffix') : '',
                  centering: centering ? t('navigator.centeringSuffix') : '',
                })}
                onClick={() => onSelect(target.id)}
                onDoubleClick={() => onFocus(target.id)}
              >
                <span className="system-navigator__index">
                  {indexFormatter.format(index + 1)}
                </span>
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
          aria-label={t('navigator.cameraViews', {
            name: selectedTarget.name,
          })}
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
                ? t('navigator.centering')
                : selectedTarget.id === centeredId && centeredViewMode === 'orbit'
                ? t('navigator.orbitActive')
                : t('navigator.goOrbit')}
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
                  ? t('navigator.centering')
                  : selectedTarget.id === centeredId &&
                    centeredViewMode === 'close-approach'
                  ? t('navigator.approachActive')
                  : t('navigator.closeApproach')}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="system-navigator__hint">
        <span><MousePointer2 size={13} /> {t('navigator.hints.orbit')}</span>
        <span><Move3d size={13} /> {t('navigator.hints.fly')}</span>
        <kbd>G</kbd><span>{t('navigator.hints.center')}</span>
      </div>
    </aside>
  )
}

export const SystemNavigator = memo(SystemNavigatorComponent)
