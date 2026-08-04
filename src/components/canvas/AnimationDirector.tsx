'use client';

import { useEffect, useRef } from 'react';
import type gsap from 'gsap';
import { foldOsState } from '@/state/foldOsState';
import { timelineFor, useSimStore } from '@/state/store';
import type { Camera } from '@/engine/cameraEngine';
import { applyStepStatics, buildStepTimeline } from '@/engine/timelines';

interface Props {
  cameraRef: React.RefObject<Camera | null>;
}

/**
 * Renders nothing. Subscribes to the store *transiently* so a step change drives GSAP
 * without ever causing a React render (docs/ARCHITECTURE.md §2). Exactly one timeline is
 * alive at a time; a transition token discards completions from killed timelines.
 */
export function AnimationDirector({ cameraRef }: Props) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const tokenRef = useRef(0);
  const prevIndexRef = useRef(-1);

  useEffect(() => {
    const run = (index: number, transition: 'step' | 'jump') => {
      const state = useSimStore.getState();
      const timeline = timelineFor(state.flags, state.chaosId);
      if (!timeline.length) return;

      const token = ++tokenRef.current;
      tlRef.current?.kill();
      tlRef.current = null;

      const os = foldOsState(timeline, index);
      const ctx = { camera: cameraRef.current };
      const prev = prevIndexRef.current;
      const isNeighbour = Math.abs(index - prev) === 1 && prev >= 0;

      if (transition === 'jump' || !isNeighbour) {
        applyStepStatics(timeline, index, os, ctx);
        prevIndexRef.current = index;
        // A jump can still land on a gate (a branch step), so let the store settle.
        return;
      }

      const tl = buildStepTimeline(timeline, index, prev, os, ctx, () => {
        if (token !== tokenRef.current) return; // stale completion
        const s = useSimStore.getState();
        if (s.status === 'playing' && s.autoplay) s.next();
      });
      tlRef.current = tl;
      tl.timeScale(useSimStore.getState().speed);
      prevIndexRef.current = index;
    };

    // Paint the initial state once the scene has registered its elements.
    const raf = requestAnimationFrame(() => {
      const s = useSimStore.getState();
      run(s.stepIndex, 'jump');
    });

    let lastIndex = useSimStore.getState().stepIndex;
    let lastVersion = useSimStore.getState().timelineVersion;

    const unsubscribe = useSimStore.subscribe((state) => {
      const changed =
        state.stepIndex !== lastIndex || state.timelineVersion !== lastVersion;
      if (changed) {
        const wasVersionBump = state.timelineVersion !== lastVersion;
        lastIndex = state.stepIndex;
        lastVersion = state.timelineVersion;
        // A version bump means the timeline itself was rebuilt (branch/chaos/replay).
        if (wasVersionBump) prevIndexRef.current = -1;
        run(state.stepIndex, state.lastTransition);
        return;
      }
      // Speed changes retime the running animation rather than restarting it.
      if (tlRef.current) tlRef.current.timeScale(state.speed);
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      tlRef.current?.kill();
      tlRef.current = null;
    };
  }, [cameraRef]);

  // Autoplay: when the learner presses play on a paused step, kick the chain.
  useEffect(() => {
    let last = useSimStore.getState().status;
    return useSimStore.subscribe((s) => {
      if (s.status === last) return;
      const wasIdle = last !== 'playing';
      last = s.status;
      if (s.status === 'playing' && wasIdle && s.autoplay) {
        // If nothing is animating, advance immediately to start the chain.
        if (!tlRef.current || !tlRef.current.isActive()) s.next();
      }
    });
  }, []);

  return null;
}
