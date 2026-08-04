'use client';

import { useMemo } from 'react';
import { CHAPTERS, type OsState, type Step } from '@/data/types';
import { mergeProd } from '@/engine/scenarioEngine';
import { foldOsState } from './foldOsState';
import { timelineFor, useSimStore } from './store';

/** The steps that actually play under the current scenario flags and chaos selection. */
export function useActiveTimeline(): Step[] {
  const flags = useSimStore((s) => s.flags);
  const chaosId = useSimStore((s) => s.chaosId);
  const version = useSimStore((s) => s.timelineVersion);
  // `version` is deliberately a dependency even though timelineFor does not read it:
  // it is the cache-bust signal for a rebuilt timeline (branch chosen, chaos entered).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => timelineFor(flags, chaosId), [flags, chaosId, version]);
}

export function useCurrentStep(): Step | null {
  const timeline = useActiveTimeline();
  const index = useSimStore((s) => s.stepIndex);
  const prodMode = useSimStore((s) => s.prodMode);
  return useMemo(() => {
    const step = timeline[index];
    if (!step) return null;
    return prodMode ? mergeProd(step) : step;
  }, [timeline, index, prodMode]);
}

/**
 * Accumulated OS state — always a pure fold, so a jump and a walk to the same index
 * produce identical results (docs/ARCHITECTURE.md §1).
 */
export function useOsState(): OsState {
  const timeline = useActiveTimeline();
  const index = useSimStore((s) => s.stepIndex);
  return useMemo(() => foldOsState(timeline, index), [timeline, index]);
}

export interface ChapterProgress {
  n: number;
  title: string;
  branch?: string;
  /** Index of this chapter's first step in the active timeline, or -1 if it has none. */
  firstIndex: number;
  stepCount: number;
  state: 'done' | 'current' | 'future' | 'empty';
}

export function useChapterProgress(): ChapterProgress[] {
  const timeline = useActiveTimeline();
  const index = useSimStore((s) => s.stepIndex);

  return useMemo(() => {
    const currentChapter = timeline[index]?.chapter ?? 0;
    return CHAPTERS.map((c) => {
      const firstIndex = timeline.findIndex((s) => s.chapter === c.n);
      const stepCount = timeline.reduce((n, s) => (s.chapter === c.n ? n + 1 : n), 0);
      const state: ChapterProgress['state'] =
        stepCount === 0
          ? 'empty'
          : c.n === currentChapter
            ? 'current'
            : c.n < currentChapter
              ? 'done'
              : 'future';
      return { n: c.n, title: c.title, branch: c.branch, firstIndex, stepCount, state };
    });
  }, [timeline, index]);
}

/** Steps belonging to one chapter, with their absolute timeline indices. */
export function useChapterSteps(chapter: number | null): { step: Step; index: number }[] {
  const timeline = useActiveTimeline();
  return useMemo(() => {
    if (chapter == null) return [];
    const out: { step: Step; index: number }[] = [];
    timeline.forEach((step, index) => {
      if (step.chapter === chapter) out.push({ step, index });
    });
    return out;
  }, [timeline, chapter]);
}

export function useStepCount(): number {
  return useActiveTimeline().length;
}
