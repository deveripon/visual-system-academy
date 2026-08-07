'use client';

import { create } from 'zustand';
import { ALL_STEPS, CHAOS } from '@/data';
import {
  DEFAULT_FLAGS,
  type ChaosId,
  type NodeId,
  type ScenarioFlags,
  type Step,
} from '@/data/types';
import { buildTimeline, firstStepOfChapter, nearestStepIndex } from '@/engine/scenarioEngine';
import type { LayerView } from '@/scene/layerViews';

export type Status =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'awaiting-branch'
  | 'awaiting-quiz'
  | 'finished';

export interface SimState {
  // ── playback ────────────────────────────────────────────────────────────
  stepIndex: number;
  status: Status;
  speed: number;
  autoplay: boolean;
  /** Bumped whenever the active timeline is rebuilt — memo/animation cache key. */
  timelineVersion: number;
  /** Set on jumps so the director skips travel animation and applies end-state. */
  lastTransition: 'step' | 'jump';

  // ── scenario ────────────────────────────────────────────────────────────
  flags: ScenarioFlags;
  chaosId: ChaosId | null;
  prodMode: boolean;

  // ── quiz ────────────────────────────────────────────────────────────────
  answers: Record<string, { choice: number; correct: boolean }>;
  quizMode: boolean;

  // ── ui ──────────────────────────────────────────────────────────────────
  /** How the journey is drawn: the architecture map, or the storyboard. */
  view: 'map' | 'story';
  layerView: LayerView | 'free';
  dossierNodeId: NodeId | null;
  searchOpen: boolean;
  chaosMenuOpen: boolean;
  helpOpen: boolean;
  expandedChapter: number | null;

  // ── actions ─────────────────────────────────────────────────────────────
  next(): void;
  prev(): void;
  jumpTo(target: number | string): void;
  jumpToChapter(chapter: number): void;
  replayStep(): void;
  restart(): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(s: number): void;
  setAutoplay(b: boolean): void;

  setFlag(key: keyof ScenarioFlags, value: string): void;
  resolveBranch(key: keyof ScenarioFlags, value: string): void;
  enterChaos(id: ChaosId): void;
  exitChaos(): void;
  toggleProdMode(): void;

  answerQuiz(stepId: string, choice: number): void;
  setQuizMode(b: boolean): void;

  setView(v: 'map' | 'story'): void;
  setLayerView(v: LayerView | 'free'): void;
  openDossier(id: NodeId | null): void;
  setSearchOpen(b: boolean): void;
  setChaosMenuOpen(b: boolean): void;
  setHelpOpen(b: boolean): void;
  setExpandedChapter(n: number | null): void;
  closeTopOverlay(): boolean;
}

/**
 * The active timeline is derived, not stored — but recomputing it on every selector call
 * would be wasteful, so it is memoised on (flags, chaosId).
 */
let cachedKey = '';
let cachedTimeline: Step[] = [];

export function timelineFor(flags: ScenarioFlags, chaosId: ChaosId | null): Step[] {
  const key = `${flags.runtime}|${flags.dnscache}|${flags.medium}|${flags.scheme}|${flags.deploy}|${chaosId ?? ''}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedTimeline = buildTimeline(ALL_STEPS, CHAOS, flags, chaosId);
  }
  return cachedTimeline;
}

/** Does this step block forward playback until the learner acts? */
function gateFor(step: Step | undefined, state: SimState): Status | null {
  if (!step) return null;
  if (step.branch) return 'awaiting-branch';
  if (step.quiz && state.quizMode && !state.answers[step.id]) return 'awaiting-quiz';
  return null;
}

export const useSimStore = create<SimState>((set, get) => ({
  stepIndex: 0,
  status: 'idle',
  speed: 1,
  autoplay: false,
  timelineVersion: 0,
  lastTransition: 'jump',

  flags: { ...DEFAULT_FLAGS },
  chaosId: null,
  prodMode: false,

  answers: {},
  quizMode: true,

  view: 'story',
  layerView: 'free',
  dossierNodeId: null,
  searchOpen: false,
  chaosMenuOpen: false,
  helpOpen: false,
  expandedChapter: null,

  next() {
    const s = get();
    const tl = timelineFor(s.flags, s.chaosId);

    // A gate on the CURRENT step blocks advancing past it.
    const gate = gateFor(tl[s.stepIndex], s);
    if (gate) {
      if (s.status !== gate) set({ status: gate });
      return;
    }

    const nextIndex = s.stepIndex + 1;
    if (nextIndex >= tl.length) {
      set({ status: 'finished' });
      return;
    }

    const nextGate = gateFor(tl[nextIndex], s);
    set({
      stepIndex: nextIndex,
      lastTransition: 'step',
      status: nextGate ?? (s.status === 'playing' ? 'playing' : 'paused'),
      expandedChapter: tl[nextIndex]?.chapter ?? s.expandedChapter,
    });
  },

  prev() {
    const s = get();
    if (s.stepIndex === 0) return;
    const tl = timelineFor(s.flags, s.chaosId);
    const idx = s.stepIndex - 1;
    set({
      stepIndex: idx,
      lastTransition: 'step',
      status: s.status === 'playing' ? 'playing' : 'paused',
      expandedChapter: tl[idx]?.chapter ?? s.expandedChapter,
    });
  },

  jumpTo(target) {
    const s = get();
    const tl = timelineFor(s.flags, s.chaosId);
    const idx =
      typeof target === 'number' ? target : tl.findIndex((step) => step.id === target);
    if (idx < 0 || idx >= tl.length) return;

    // Jumping is always allowed; skipped quizzes are recorded so gates do not re-fire.
    const answers = { ...s.answers };
    for (let i = 0; i <= idx; i++) {
      const step = tl[i];
      if (step?.quiz && !answers[step.id]) answers[step.id] = { choice: -1, correct: false };
    }

    set({
      stepIndex: idx,
      answers,
      lastTransition: 'jump',
      status: tl[idx]?.branch ? 'awaiting-branch' : 'paused',
      expandedChapter: tl[idx]?.chapter ?? s.expandedChapter,
    });
  },

  jumpToChapter(chapter) {
    const s = get();
    const tl = timelineFor(s.flags, s.chaosId);
    const idx = firstStepOfChapter(tl, chapter);
    if (idx >= 0) get().jumpTo(idx);
    else set({ expandedChapter: chapter });
  },

  replayStep() {
    // Re-fire the current step's animation without changing the index.
    set((s) => ({ timelineVersion: s.timelineVersion + 1, lastTransition: 'step' }));
  },

  restart() {
    set({
      stepIndex: 0,
      status: 'idle',
      answers: {},
      lastTransition: 'jump',
      timelineVersion: get().timelineVersion + 1,
      expandedChapter: 1,
    });
  },

  play() {
    const s = get();
    const tl = timelineFor(s.flags, s.chaosId);
    const gate = gateFor(tl[s.stepIndex], s);
    if (gate) {
      set({ status: gate });
      return;
    }
    set({ status: 'playing' });
  },

  pause() {
    if (get().status === 'playing') set({ status: 'paused' });
  },

  togglePlay() {
    const s = get();
    if (s.status === 'playing') get().pause();
    else get().play();
  },

  setSpeed(speed) {
    set({ speed });
  },

  setAutoplay(autoplay) {
    set({ autoplay });
  },

  setFlag(key, value) {
    const s = get();
    if (s.flags[key] === value) return;
    const oldTl = timelineFor(s.flags, s.chaosId);
    const nextFlags = { ...s.flags, [key]: value } as ScenarioFlags;
    const nextTl = timelineFor(nextFlags, s.chaosId);
    // Position and version move together so no selector ever sees a mismatched pair.
    set({
      flags: nextFlags,
      stepIndex: nearestStepIndex(oldTl, s.stepIndex, nextTl),
      timelineVersion: s.timelineVersion + 1,
      lastTransition: 'jump',
      status: 'paused',
    });
  },

  resolveBranch(key, value) {
    const s = get();
    const oldTl = timelineFor(s.flags, s.chaosId);
    const branchStepId = oldTl[s.stepIndex]?.id;
    const nextFlags = { ...s.flags, [key]: value } as ScenarioFlags;
    const nextTl = timelineFor(nextFlags, s.chaosId);

    // Land on the step after the branch so the chosen path starts playing immediately.
    const branchIdx = branchStepId ? nextTl.findIndex((st) => st.id === branchStepId) : -1;
    const landing =
      branchIdx >= 0
        ? Math.min(branchIdx + 1, nextTl.length - 1)
        : nearestStepIndex(oldTl, s.stepIndex, nextTl);

    set({
      flags: nextFlags,
      stepIndex: landing,
      timelineVersion: s.timelineVersion + 1,
      lastTransition: 'step',
      status: s.autoplay ? 'playing' : 'paused',
      expandedChapter: nextTl[landing]?.chapter ?? s.expandedChapter,
    });
  },

  enterChaos(id) {
    const s = get();
    const nextTl = timelineFor(s.flags, id);
    const scenario = CHAOS[id];
    // Start just before the failure so the learner sees it happen.
    let idx = 0;
    if (scenario?.entryAfter) {
      const entry = nextTl.findIndex((st) => st.id === scenario.entryAfter);
      idx = entry >= 0 ? entry : 0;
    }
    set({
      chaosId: id,
      stepIndex: idx,
      timelineVersion: s.timelineVersion + 1,
      lastTransition: 'jump',
      status: 'paused',
      chaosMenuOpen: false,
      expandedChapter: nextTl[idx]?.chapter ?? null,
    });
  },

  exitChaos() {
    const s = get();
    if (!s.chaosId) return;
    const oldTl = timelineFor(s.flags, s.chaosId);
    const nextTl = timelineFor(s.flags, null);
    set({
      chaosId: null,
      stepIndex: nearestStepIndex(oldTl, s.stepIndex, nextTl),
      timelineVersion: s.timelineVersion + 1,
      lastTransition: 'jump',
      status: 'paused',
    });
  },

  toggleProdMode() {
    // Content overlay only — the timeline is untouched, so no version bump.
    set((s) => ({ prodMode: !s.prodMode }));
  },

  answerQuiz(stepId, choice) {
    const s = get();
    const tl = timelineFor(s.flags, s.chaosId);
    const step = tl.find((st) => st.id === stepId);
    if (!step?.quiz) return;
    const correct = choice === step.quiz.answer;
    set({
      answers: { ...s.answers, [stepId]: { choice, correct } },
      status: correct && s.status === 'awaiting-quiz' ? 'paused' : s.status,
    });
  },

  setQuizMode(quizMode) {
    set({ quizMode });
    if (!quizMode && get().status === 'awaiting-quiz') set({ status: 'paused' });
  },

  setView(view) {
    set({ view });
  },

  setLayerView(layerView) {
    set({ layerView });
  },

  openDossier(dossierNodeId) {
    set({ dossierNodeId });
  },

  setSearchOpen(searchOpen) {
    set({ searchOpen });
  },

  setChaosMenuOpen(chaosMenuOpen) {
    set({ chaosMenuOpen });
  },

  setHelpOpen(helpOpen) {
    set({ helpOpen });
  },

  setExpandedChapter(expandedChapter) {
    set({ expandedChapter });
  },

  /** Esc handling: close the top-most overlay only. Returns true if something closed. */
  closeTopOverlay() {
    const s = get();
    if (s.searchOpen) return set({ searchOpen: false }), true;
    if (s.helpOpen) return set({ helpOpen: false }), true;
    if (s.dossierNodeId) return set({ dossierNodeId: null }), true;
    if (s.chaosMenuOpen) return set({ chaosMenuOpen: false }), true;
    return false;
  },
}));
