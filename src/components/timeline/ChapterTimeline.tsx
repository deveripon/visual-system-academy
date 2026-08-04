'use client';

import { useCallback, useEffect, useRef } from 'react';
import { modeColor } from '@/scene/modeColors';
import {
  useActiveTimeline,
  useChapterProgress,
  useCurrentStep,
  type ChapterProgress,
} from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { MONO, cx, scrollIntoViewSoftly } from '@/components/overlays/overlayKit';
import { ChapterPill } from './ChapterPill';
import { StepList } from './StepList';

/**
 * The bottom dock: 24 chapters, the current one expanded into its steps, and one bar
 * that says how far through the journey the learner is. A flex child of the shell —
 * never absolutely positioned.
 */
export function ChapterTimeline() {
  const chapters = useChapterProgress();
  const timeline = useActiveTimeline();
  const step = useCurrentStep();
  const stepIndex = useSimStore((s) => s.stepIndex);
  const expandedChapter = useSimStore((s) => s.expandedChapter);
  const chaosId = useSimStore((s) => s.chaosId);

  const mode = step?.mode ?? 'user';
  const accent = modeColor(mode);
  const total = timeline.length;
  const position = total === 0 ? 0 : Math.min(stepIndex + 1, total);
  const percent = total === 0 ? 0 : (position / total) * 100;
  const currentChapter = timeline[stepIndex]?.chapter ?? 0;

  const activePillRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // When the current chapter is expanded, StepList scrolls the active *chip* into
    // view instead — scrolling both would fight over the same scroll container.
    if (expandedChapter === currentChapter) return;
    scrollIntoViewSoftly(activePillRef.current);
  }, [currentChapter, expandedChapter]);

  const select = useCallback(
    (chapter: ChapterProgress) => {
      if (chapter.state === 'empty') return;
      const store = useSimStore.getState();
      if (chapter.n === currentChapter) {
        // Clicking the chapter you are already in toggles its step list.
        store.setExpandedChapter(expandedChapter === chapter.n ? null : chapter.n);
        return;
      }
      store.jumpToChapter(chapter.n);
    },
    [currentChapter, expandedChapter],
  );

  return (
    <nav
      aria-label="Lesson timeline"
      className="relative z-20 shrink-0 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-1)_92%,transparent)] backdrop-blur-xl"
      // Space belongs to the focused pill here, not to the global play/pause binding.
      onKeyDown={(e) => {
        if (e.key === ' ') e.stopPropagation();
      }}
    >
      <div className="flex items-center gap-3 px-3 pt-2">
        <span className={cx(MONO, 'text-[10px] font-semibold uppercase tracking-wider')} style={{ color: accent }}>
          ch {String(currentChapter).padStart(2, '0')}
        </span>
        <div
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-valuetext={`Step ${position} of ${total}`}
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
        >
          <div
            className="h-full rounded-full transition-[width] ease-out"
            style={{
              width: `${percent}%`,
              transitionDuration: 'var(--t-ui)',
              background: chaosId
                ? 'linear-gradient(90deg, var(--ok), var(--err))'
                : `linear-gradient(90deg, var(--ok), ${accent})`,
            }}
          />
        </div>
        <span className={cx(MONO, 'text-[10px] tabular-nums text-[var(--text-3)]')}>
          {position} / {total}
        </span>
      </div>

      <ol
        className="flex snap-x snap-proximity items-stretch gap-2 overflow-x-auto px-3 py-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {chapters.map((chapter) => {
          const isCurrent = chapter.n === currentChapter;
          const isExpanded = expandedChapter === chapter.n && chapter.stepCount > 0;
          return (
            <li
              key={chapter.n}
              ref={isCurrent ? activePillRef : undefined}
              className="flex shrink-0 snap-center items-center gap-2"
            >
              <ChapterPill
                chapter={chapter}
                mode={mode}
                expanded={isExpanded}
                onSelect={() => select(chapter)}
              />
              {isExpanded ? <StepList chapter={chapter.n} mode={mode} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
