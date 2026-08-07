'use client';

import { useEffect } from 'react';
import { useSimStore } from '@/state/store';

/** Reading pace for one slide at 1× speed. Speed divides it. */
const SLIDE_MS = 4600;

/**
 * The auto-play driver for story mode. The map view is driven by the GSAP director's
 * onComplete chain; story mode has no GSAP, so this schedules the next slide on a
 * reading-pace timer instead. It only ever runs while status === 'playing', so every
 * gate (branch, quiz, finished) pauses it for free — next() refuses to pass a gate and
 * flips the status, and the timer chain stops with it.
 */
export function StoryAutoplay() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      clear();
      const s = useSimStore.getState();
      if (s.status !== 'playing') return;
      timer = setTimeout(() => {
        const now = useSimStore.getState();
        if (now.status === 'playing') now.next();
        // next() either advanced (stepIndex change re-schedules via the subscription)
        // or hit a gate/the end (status change stops the chain). Nothing to do here.
      }, SLIDE_MS / s.speed);
    };

    schedule();
    const unsubscribe = useSimStore.subscribe((s, prev) => {
      if (s.status !== prev.status || s.speed !== prev.speed || s.stepIndex !== prev.stepIndex) {
        schedule();
      }
    });

    return () => {
      clear();
      unsubscribe();
    };
  }, []);

  return null;
}
