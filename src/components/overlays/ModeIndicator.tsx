'use client';

import { useEffect, useState } from 'react';
import type { StepMode } from '@/data/types';
import { MODE_HINT, MODE_LABEL, modeColor } from '@/scene/modeColors';
import { useCurrentStep } from '@/state/selectors';
import { MONO, cx, glassStyle } from '@/components/overlays/overlayKit';

/**
 * Where the CPU is, as colour *and* text (colour is never the only signal).
 * Positioned absolutely inside the canvas section; the crossfade is a plain CSS
 * animation because this is chrome, not scene animation — GSAP owns the scene.
 */
export function ModeIndicator() {
  const step = useCurrentStep();
  const mode: StepMode = step?.mode ?? 'user';
  const accent = modeColor(mode);

  // Keep the outgoing label mounted for one UI beat so the swap reads as a crossfade.
  const [outgoing, setOutgoing] = useState<StepMode | null>(null);
  const [shown, setShown] = useState<StepMode>(mode);

  useEffect(() => {
    if (mode === shown) return;
    setOutgoing(shown);
    setShown(mode);
    const timer = window.setTimeout(() => setOutgoing(null), 260);
    return () => window.clearTimeout(timer);
  }, [mode, shown]);

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-20 select-none"
      role="status"
      aria-live="polite"
      title={MODE_HINT[mode]}
    >
      <style>{`
@keyframes vsa-mode-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
@keyframes vsa-mode-out { from { opacity: .55; } to { opacity: 0; } }
`}</style>
      <div
        className="flex h-8 items-center gap-2 rounded-full border px-3 transition-colors"
        style={{
          ...glassStyle,
          background: `color-mix(in oklab, ${accent} 13%, var(--surface))`,
          borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
          transitionDuration: 'var(--t-ui)',
        }}
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full transition-colors"
          style={{
            background: accent,
            boxShadow: `0 0 10px ${accent}`,
            transitionDuration: 'var(--t-ui)',
          }}
        />
        <span className="grid min-w-[7.5rem] items-center">
          <span
            key={shown}
            className={cx(MONO, 'text-[11px] font-semibold uppercase tracking-[0.08em]')}
            style={{
              gridArea: '1 / 1',
              color: accent,
              animation: 'vsa-mode-in var(--t-ui) ease-out',
            }}
          >
            {MODE_LABEL[shown]}
          </span>
          {outgoing ? (
            <span
              aria-hidden="true"
              className={cx(MONO, 'text-[11px] font-semibold uppercase tracking-[0.08em]')}
              style={{
                gridArea: '1 / 1',
                color: modeColor(outgoing),
                animation: 'vsa-mode-out var(--t-ui) ease-out forwards',
              }}
            >
              {MODE_LABEL[outgoing]}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
