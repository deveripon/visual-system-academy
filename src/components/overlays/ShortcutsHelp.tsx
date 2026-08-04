'use client';

import { useCallback } from 'react';
import { useSimStore } from '@/state/store';
import {
  MONO,
  cx,
  glassStyle,
  scrimStyle,
  useOverlayFocus,
} from '@/components/overlays/overlayKit';

/** Mirrors the bindings installed by `src/lib/keyboard.ts` — that file is the source
 *  of truth; this one only has to tell the truth about it. */
const GROUPS: { label: string; items: { keys: string[]; what: string }[] }[] = [
  {
    label: 'playback',
    items: [
      { keys: ['Space'], what: 'Play / pause' },
      { keys: ['→', 'l'], what: 'Next step' },
      { keys: ['←', 'h'], what: 'Previous step' },
      { keys: ['r'], what: 'Replay this step' },
      { keys: ['Shift', 'R'], what: 'Restart the whole journey' },
    ],
  },
  {
    label: 'navigation',
    items: [
      { keys: ['/'], what: 'Search steps, components and chapters' },
      { keys: ['click'], what: 'A chapter pill jumps to its first step' },
      { keys: ['click'], what: 'A step chip jumps straight to that step' },
      { keys: ['click'], what: 'A node on the canvas opens its dossier' },
    ],
  },
  {
    label: 'overlays',
    items: [
      { keys: ['?'], what: 'This help' },
      { keys: ['Esc'], what: 'Close the top-most overlay' },
      { keys: ['Tab'], what: 'Move focus — overlays keep it inside' },
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <kbd
      className={cx(
        MONO,
        'inline-grid h-6 min-w-6 place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 text-[11px] text-[var(--text-1)]',
      )}
    >
      {children}
    </kbd>
  );
}

export function ShortcutsHelp() {
  const open = useSimStore((s) => s.helpOpen);
  const close = useCallback(() => useSimStore.getState().setHelpOpen(false), []);
  const ref = useOverlayFocus<HTMLDivElement>(open, close);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      <button
        type="button"
        aria-label="Close shortcuts"
        onClick={close}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        style={scrimStyle}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vsa-help-title"
        tabIndex={-1}
        className="relative max-h-[82vh] w-full max-w-[36rem] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border)] p-5"
        style={glassStyle}
      >
        <div className="flex items-start">
          <div>
            <p className={cx(MONO, 'text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]')}>
              keyboard
            </p>
            <h2
              id="vsa-help-title"
              className="mt-1 text-[19px] font-semibold tracking-tight text-[var(--text-1)]"
            >
              Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cx(
              MONO,
              'ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
            )}
          >
            ✕
          </button>
        </div>

        {GROUPS.map((group) => (
          <section key={group.label} className="mt-5">
            <h3
              className={cx(
                MONO,
                'text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]',
              )}
            >
              {group.label}
            </h3>
            <ul className="mt-2 grid gap-1.5">
              {group.items.map((item) => (
                <li key={`${group.label}-${item.what}`} className="flex items-center gap-3">
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <Key key={key}>{key}</Key>
                    ))}
                  </span>
                  <span className="text-[13px] text-[var(--text-2)]">{item.what}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
