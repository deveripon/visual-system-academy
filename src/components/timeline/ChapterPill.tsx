'use client';

import type { CSSProperties } from 'react';
import type { StepMode } from '@/data/types';
import { modeColor } from '@/scene/modeColors';
import type { ChapterProgress } from '@/state/selectors';
import { MONO, cx } from '@/components/overlays/overlayKit';

interface ChapterPillProps {
  chapter: ChapterProgress;
  /** Mode of the step currently playing — the "current" pill is keyed to it. */
  mode: StepMode;
  expanded: boolean;
  onSelect(): void;
}

function TickGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

function pillStyle(state: ChapterProgress['state'], accent: string): CSSProperties {
  switch (state) {
    case 'current':
      return {
        borderColor: accent,
        background: `color-mix(in oklab, ${accent} 16%, transparent)`,
        color: 'var(--text-1)',
        // Subtle glow: the current chapter is the one thing on the dock that emits light.
        boxShadow: `0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent), 0 8px 26px -10px ${accent}`,
      };
    case 'done':
      return {
        borderColor: 'color-mix(in oklab, var(--ok) 32%, transparent)',
        background: 'color-mix(in oklab, var(--ok) 7%, transparent)',
        color: 'var(--ok)',
      };
    case 'empty':
      return {
        borderColor: 'var(--border)',
        borderStyle: 'dashed',
        color: 'color-mix(in oklab, var(--text-3) 65%, transparent)',
      };
    default:
      return { borderColor: 'var(--border)', color: 'var(--text-3)' };
  }
}

export function ChapterPill({ chapter, mode, expanded, onSelect }: ChapterPillProps) {
  const { n, title, branch, state, stepCount } = chapter;
  const accent =
    state === 'current' ? modeColor(mode) : state === 'done' ? 'var(--ok)' : 'var(--text-3)';
  const empty = state === 'empty';

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={empty}
      aria-current={state === 'current' ? 'step' : undefined}
      aria-expanded={state === 'current' ? expanded : undefined}
      title={
        empty
          ? `Chapter ${n}: ${title} — no steps in this scenario`
          : `Chapter ${n}: ${title} · ${stepCount} step${stepCount === 1 ? '' : 's'}`
      }
      className={cx(
        'flex h-9 shrink-0 items-center gap-2 rounded-[10px] border px-2.5 transition-colors duration-150',
        empty ? 'cursor-not-allowed' : 'hover:bg-[var(--surface-2)]',
      )}
      style={pillStyle(state, accent)}
    >
      <span className={cx(MONO, 'text-[11px] font-semibold tabular-nums opacity-80')}>
        {String(n).padStart(2, '0')}
      </span>
      {state === 'done' ? <TickGlyph /> : null}
      <span className={cx(MONO, 'whitespace-nowrap text-[12px] tracking-tight')}>{title}</span>
      {branch ? (
        <>
          <span
            aria-hidden="true"
            className="text-[12px] leading-none"
            style={{ color: state === 'current' ? 'var(--text-1)' : 'var(--mode-remote)' }}
          >
            ⑂
          </span>
          <span className="sr-only">branches on {branch}</span>
        </>
      ) : null}
    </button>
  );
}
