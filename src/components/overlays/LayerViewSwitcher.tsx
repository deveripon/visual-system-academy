'use client';

import { LAYER_VIEWS, LAYER_VIEW_ORDER, type LayerView } from '@/scene/layerViews';
import { useSimStore } from '@/state/store';
import { MONO, cx, glassStyle } from '@/components/overlays/overlayKit';

/** "Operating System" does not fit a seven-up segmented control; the full label stays
 *  in the tooltip and the accessible name. */
const SHORT_LABEL: Record<LayerView, string> = {
  application: 'App',
  os: 'OS',
  kernel: 'Kernel',
  network: 'Network',
  hardware: 'Hardware',
  internet: 'Internet',
  production: 'Prod',
};

export function LayerViewSwitcher() {
  const layerView = useSimStore((s) => s.layerView);
  const free = layerView === 'free';
  const active = free ? null : LAYER_VIEWS[layerView];

  return (
    <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {active ? (
        <p
          className={cx(MONO, 'max-w-[34rem] truncate px-2 text-[11px] text-[var(--text-3)]')}
          aria-hidden="true"
        >
          {active.hint}
        </p>
      ) : null}

      <div
        role="group"
        aria-label="Layer view"
        className="flex items-center gap-0.5 rounded-full border border-[var(--border)] p-1"
        style={glassStyle}
      >
        <button
          type="button"
          onClick={() => useSimStore.getState().setLayerView('free')}
          aria-pressed={free}
          title="Free look — manual pan and zoom, no layer framed"
          className={cx(
            MONO,
            'h-7 rounded-full px-2.5 text-[11px] uppercase tracking-wider transition-colors duration-150',
            free ? '' : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
          )}
          style={
            free
              ? {
                  color: 'var(--text-1)',
                  background: 'var(--surface-2)',
                  boxShadow: 'inset 0 0 0 1px var(--border-strong)',
                }
              : undefined
          }
        >
          free
        </button>

        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[var(--border)]" />

        {LAYER_VIEW_ORDER.map((view) => {
          const def = LAYER_VIEWS[view];
          const on = layerView === view;
          return (
            <button
              key={view}
              type="button"
              onClick={() => useSimStore.getState().setLayerView(view)}
              aria-pressed={on}
              title={`${def.label} — ${def.hint}`}
              className={cx(
                MONO,
                'h-7 rounded-full px-2.5 text-[11px] uppercase tracking-wider transition-colors duration-150',
                on ? '' : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
              )}
              style={
                on
                  ? {
                      color: 'var(--mode-user)',
                      background: 'color-mix(in oklab, var(--mode-user) 16%, transparent)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--mode-user) 45%, transparent)',
                    }
                  : undefined
              }
            >
              <span aria-hidden="true">{SHORT_LABEL[view]}</span>
              <span className="sr-only">{def.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
