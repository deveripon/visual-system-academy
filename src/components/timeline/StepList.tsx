'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import type { StepMode } from '@/data/types';
import { modeColor } from '@/scene/modeColors';
import { useChapterSteps } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { MONO, cx, scrollIntoViewSoftly } from '@/components/overlays/overlayKit';

interface StepListProps {
  chapter: number;
  mode: StepMode;
}

function chipStyle(state: 'done' | 'current' | 'future', accent: string): CSSProperties {
  switch (state) {
    case 'current':
      return {
        borderColor: accent,
        background: `color-mix(in oklab, ${accent} 18%, transparent)`,
        color: 'var(--text-1)',
      };
    case 'done':
      return {
        borderColor: 'color-mix(in oklab, var(--ok) 26%, transparent)',
        color: 'color-mix(in oklab, var(--ok) 82%, var(--text-2))',
      };
    default:
      return { borderColor: 'var(--border)', color: 'var(--text-3)' };
  }
}

/** The current chapter's steps, inline in the dock — every step is one click away. */
export function StepList({ chapter, mode }: StepListProps) {
  const steps = useChapterSteps(chapter);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const answers = useSimStore((s) => s.answers);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    scrollIntoViewSoftly(activeRef.current);
  }, [stepIndex, chapter]);

  if (steps.length === 0) return null;

  return (
    <ul
      className="flex shrink-0 items-center gap-1.5 border-l border-[var(--border)] pl-2"
      aria-label={`Steps in chapter ${chapter}`}
    >
      {steps.map(({ step, index }) => {
        const state = index === stepIndex ? 'current' : index < stepIndex ? 'done' : 'future';
        const answered = step.quiz ? answers[step.id] : undefined;
        return (
          <li key={step.id} className="shrink-0">
            <button
              type="button"
              ref={state === 'current' ? activeRef : undefined}
              onClick={() => useSimStore.getState().jumpTo(index)}
              aria-current={state === 'current' ? 'step' : undefined}
              title={step.title}
              className={cx(
                MONO,
                'flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors duration-150',
                state === 'current' ? '' : 'hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
              )}
              style={chipStyle(state, modeColor(mode))}
            >
              <span className="max-w-[10.5rem] truncate">{step.title}</span>
              {step.branch ? (
                <span aria-hidden="true" style={{ color: 'var(--mode-remote)' }}>
                  ⑂
                </span>
              ) : null}
              {step.quiz ? (
                <span
                  aria-hidden="true"
                  style={{ color: answered?.correct ? 'var(--ok)' : 'var(--mode-user)' }}
                >
                  ?
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
