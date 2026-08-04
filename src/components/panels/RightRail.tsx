'use client';

import { useId, useState } from 'react';
import { MODE_LABEL, modeColor } from '@/scene/modeColors';
import { useCurrentStep } from '@/state/selectors';
import { ExplainPanel } from './ExplainPanel';
import { OsStatePanel } from './OsStatePanel';
import { PacketInspector } from './PacketInspector';

type Tab = 'explain' | 'state' | 'packet';

const TABS: { id: Tab; label: string }[] = [
  { id: 'explain', label: 'Explain' },
  { id: 'state', label: 'State' },
  { id: 'packet', label: 'Packet' },
];

/**
 * The teaching rail.
 *
 * Desktop: a fixed 400px column — the explanation scrolls, the machine state stays
 * pinned to the bottom edge so a learner never has to scroll to see what ring the CPU is
 * in. Below `lg` the same content becomes a bottom sheet with peek/full states, so the
 * canvas keeps the whole viewport until the learner asks to read.
 *
 * The step-change `aria-live` announcement is owned by the shell, not by this rail —
 * two live regions announcing the same transition would double up in a screen reader.
 */
export function RightRail() {
  const step = useCurrentStep();
  const [tab, setTab] = useState<Tab>('explain');
  const [expanded, setExpanded] = useState(false);
  const tabsId = useId();

  const accent = step ? modeColor(step.mode) : 'var(--text-3)';

  return (
    <aside
      aria-label="Step explanation and machine state"
      style={{
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
      }}
      className={[
        // Mobile: a bottom sheet pinned to the bottom of <main>, lifted out of flow so the
        // canvas keeps the viewport. Anchored to main (not the viewport) so it never
        // covers the chapter timeline below it, and kept at z-20 so the branch/quiz cards
        // at z-30 still win.
        'absolute inset-x-0 bottom-0 z-20 flex w-full flex-col overflow-hidden',
        'rounded-t-[var(--r-lg)] border-t border-line',
        'bg-[color-mix(in_oklab,var(--bg-1)_88%,transparent)]',
        expanded ? 'h-[70%]' : 'h-auto',
        // Desktop: a real column in the shell's flex row, stretched by the row itself.
        'lg:static lg:z-auto lg:h-auto lg:min-h-0 lg:w-[400px] lg:shrink-0',
        'lg:rounded-none lg:border-t-0 lg:border-l',
        'lg:bg-[color-mix(in_oklab,var(--bg-1)_55%,transparent)]',
      ].join(' ')}
    >
      {/* ── desktop ─────────────────────────────────────────────────────────── */}
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ExplainPanel />
          <PacketInspector />
        </div>
        {/*
          Pinned. `shrink-0` + `max-h` makes this take min(its natural height, half the
          rail): it never grows past what the widgets need, and never eats the
          explanation. Scrollable with no focusable children, so it owns a tab stop.
        */}
        <div
          tabIndex={0}
          aria-label="Machine state"
          className="max-h-[50%] shrink-0 overflow-y-auto overscroll-contain border-t border-line bg-[color-mix(in_oklab,var(--bg-0)_45%,transparent)]"
        >
          <OsStatePanel />
        </div>
      </div>

      {/* ── bottom sheet (under lg) ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={tabsId}
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full flex-col items-stretch gap-1.5 px-3 pt-2 pb-2 text-left"
        >
          <span
            aria-hidden="true"
            className="mx-auto h-1 w-9 rounded-full bg-[var(--border-strong)]"
          />
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
            />
            <span className="truncate text-[13px] font-medium text-t1">
              {step?.title ?? 'No step loaded'}
            </span>
            <span
              className="ml-auto shrink-0 font-mono text-[9.5px] font-semibold tracking-[0.08em]"
              style={{ color: accent }}
            >
              {step ? MODE_LABEL[step.mode] : ''}
            </span>
          </span>
        </button>

        <div
          role="tablist"
          aria-label="Panel sections"
          className="flex gap-1 border-b border-line px-2 pb-1.5"
        >
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={tabsId}
                onClick={() => {
                  setTab(t.id);
                  setExpanded(true);
                }}
                className="rounded-full border px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] transition-colors duration-[var(--t-micro)]"
                style={
                  selected
                    ? {
                        color: accent,
                        borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
                        background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                      }
                    : { color: 'var(--text-3)', borderColor: 'var(--border)' }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          id={tabsId}
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`${tabsId}-tab-${tab}`}
          hidden={!expanded}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {tab === 'explain' ? <ExplainPanel /> : null}
          {tab === 'state' ? <OsStatePanel /> : null}
          {tab === 'packet' ? <PacketInspector /> : null}
        </div>
      </div>
    </aside>
  );
}
