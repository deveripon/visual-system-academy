'use client';

/** Single source of truth for motion preference — engines consult this, never matchMedia. */
let reduced = false;

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = mq.matches;
  mq.addEventListener('change', (e) => {
    reduced = e.matches;
  });
}

export function prefersReducedMotion(): boolean {
  return reduced;
}
