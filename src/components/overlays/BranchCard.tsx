'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCurrentStep } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { modeColor } from '@/scene/modeColors';
import {
  MONO,
  cx,
  gateScrimStyle,
  glassStyle,
  shieldGlobalKeys,
} from '@/components/overlays/overlayKit';

/**
 * A fork in the story, not a modal nag: the canvas dims but stays live, nothing is
 * trapped, and the option matching the current flag is pre-focused so Enter takes the
 * default path. Choosing rebuilds the timeline through `resolveBranch`.
 */
export function BranchCard() {
  const status = useSimStore((s) => s.status);
  const flags = useSimStore((s) => s.flags);
  const step = useCurrentStep();
  const branch = step?.branch ?? null;
  const open = status === 'awaiting-branch' && branch !== null;

  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const currentValue = branch ? flags[branch.key] : null;
  const defaultIndex = branch
    ? Math.max(
        0,
        branch.options.findIndex((o) => o.value === currentValue),
      )
    : 0;

  useEffect(() => {
    if (!open) return;
    optionRefs.current[defaultIndex]?.focus({ preventScroll: true });
  }, [open, defaultIndex, step?.id]);

  if (!open || !branch) return null;

  const accent = modeColor(step?.mode ?? 'user');

  const choose = (value: string): void => {
    useSimStore.getState().resolveBranch(branch.key, value);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const count = branch.options.length;
    const index = optionRefs.current.findIndex((el) => el === document.activeElement);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      optionRefs.current[(Math.max(index, 0) + 1) % count]?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      optionRefs.current[(Math.max(index, 0) - 1 + count) % count]?.focus();
    } else if (/^[1-9]$/.test(event.key)) {
      const option = branch.options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        choose(option.value);
      }
    }
    shieldGlobalKeys(event);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity"
        style={{ ...gateScrimStyle, opacity: shown ? 1 : 0, transitionDuration: 'var(--t-ui)' }}
      />

      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="vsa-branch-question"
        onKeyDown={onKeyDown}
        className="pointer-events-auto relative w-full max-w-[44rem] rounded-[var(--r-lg)] border p-5 transition-all"
        style={{
          ...glassStyle,
          borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`,
          boxShadow: `0 24px 70px -30px ${accent}, var(--glass-shadow)`,
          opacity: shown ? 1 : 0,
          transform: shown ? 'none' : 'translateY(8px) scale(.985)',
          transitionDuration: 'var(--t-ui)',
        }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" style={{ color: accent }} className="text-[13px] leading-none">
            ⑂
          </span>
          <span className={cx(MONO, 'text-[10px] font-semibold uppercase tracking-[0.14em]')} style={{ color: accent }}>
            decision point · {branch.key}
          </span>
        </div>

        <h2
          id="vsa-branch-question"
          className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-[var(--text-1)]"
        >
          {branch.question}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {branch.options.map((option, i) => {
            const isCurrent = option.value === currentValue;
            return (
              <button
                key={option.value}
                type="button"
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                onClick={() => choose(option.value)}
                className="group flex h-full flex-col rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cx(
                      MONO,
                      'grid h-5 w-5 place-items-center rounded-md border border-[var(--border)] text-[10px] text-[var(--text-3)]',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={cx(MONO, 'text-[14px] font-semibold text-[var(--text-1)]')}>
                    {option.label}
                  </span>
                  {isCurrent ? (
                    <span
                      className={cx(MONO, 'ml-auto rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-wider')}
                      style={{
                        color: accent,
                        background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                      }}
                    >
                      current
                    </span>
                  ) : null}
                </span>
                {option.hint ? (
                  <span className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                    {option.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-3)]">
          Your choice rebuilds the timeline from here — the scene keeps playing on the path you
          pick. You can come back and take the other one at any time.
        </p>
      </section>
    </div>
  );
}
