import type { ChaosId, ChaosMap, ScenarioFlags, Step } from '@/data/types';

/** A step plays when every key in its `when` matches the current scenario flags. */
export function stepMatches(step: Step, flags: ScenarioFlags): boolean {
  const when = step.when;
  if (!when) return true;
  for (const [key, value] of Object.entries(when)) {
    if (flags[key as keyof ScenarioFlags] !== value) return false;
  }
  return true;
}

/**
 * The active timeline: flag-filtered steps, with a chaos sequence spliced in after its
 * entry step (everything past that point is replaced — the request never completes).
 * Pure: no DOM, no store.
 */
export function buildTimeline(
  all: Step[],
  chaos: ChaosMap,
  flags: ScenarioFlags,
  chaosId: ChaosId | null,
): Step[] {
  const base = all.filter((s) => stepMatches(s, flags));
  if (!chaosId) return base;

  const scenario = chaos[chaosId];
  if (!scenario) return base;

  const chaosSteps = (scenario.steps ?? []).filter((s) => stepMatches(s, flags));
  if (!chaosSteps.length) return base;

  // A standalone scenario (no entry point) replaces the timeline entirely.
  if (!scenario.entryAfter) return chaosSteps;

  const entryIndex = base.findIndex((s) => s.id === scenario.entryAfter);
  if (entryIndex === -1) return [...base, ...chaosSteps];

  return [...base.slice(0, entryIndex + 1), ...chaosSteps];
}

/**
 * Keep the learner roughly where they were when the timeline is rebuilt: prefer the same
 * step id, else the nearest preceding step that survived the rebuild.
 */
export function nearestStepIndex(oldTl: Step[], oldIndex: number, nextTl: Step[]): number {
  if (!nextTl.length) return 0;
  if (!oldTl.length) return 0;

  const clamped = Math.max(0, Math.min(oldIndex, oldTl.length - 1));
  for (let i = clamped; i >= 0; i--) {
    const id = oldTl[i]?.id;
    if (!id) continue;
    const found = nextTl.findIndex((s) => s.id === id);
    if (found !== -1) return found;
  }
  return 0;
}

/**
 * Production mode is a content overlay, never a timeline change: it swaps the story to a
 * real deployment (Island Tours) without altering which steps play.
 */
export function mergeProd(step: Step): Step {
  if (!step.prod) return step;
  const { title, explain, code, packet } = step.prod;
  return {
    ...step,
    title: title ?? step.title,
    explain: explain ? { ...step.explain, ...explain } : step.explain,
    code: code ?? step.code,
    packet: packet ?? step.packet,
  };
}

/** Index of the first step of a chapter, or -1. */
export function firstStepOfChapter(timeline: Step[], chapter: number): number {
  return timeline.findIndex((s) => s.chapter === chapter);
}
