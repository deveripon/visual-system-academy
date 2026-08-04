'use client';

import type { StepMode } from '@/data/types';
import { MODE_HINT, MODE_LABEL, modeColor } from '@/scene/modeColors';
import { useCurrentStep } from '@/state/selectors';
import { MONO, OVERLAY_KEYFRAMES, cx, glassStyle } from '@/components/overlays/overlayKit';

/**
 * Where the CPU is, as colour *and* text (colour is never the only signal).
 * The pill's colour transitions while the label remounts on a key change and fades in —
 * a crossfade with no React state and no timers, since this is chrome and GSAP owns
 * everything in the scene itself.
 */
export function ModeIndicator() {
  const step = useCurrentStep();
  const mode: StepMode = step?.mode ?? 'user';
  const accent = modeColor(mode);

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-20 select-none"
      role="status"
      aria-live="polite"
      title={MODE_HINT[mode]}
    >
      <style>{OVERLAY_KEYFRAMES}</style>
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
        <span
          key={mode}
          className={cx(MONO, 'text-[11px] font-semibold uppercase tracking-[0.08em]')}
          style={{ color: accent, animation: 'vsa-label-in var(--t-ui) ease-out' }}
        >
          {MODE_LABEL[mode]}
        </span>
      </div>
    </div>
  );
}
