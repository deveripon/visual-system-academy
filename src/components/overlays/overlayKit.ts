'use client';

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { getComponents } from '@/data';
import type { ComponentMap } from '@/data/types';
import { useSimStore } from '@/state/store';

/**
 * Shared chrome primitives for the timeline dock and every overlay.
 *
 * Colours are applied as inline style values rather than Tailwind arbitrary utilities:
 * mode accents are dynamic (`var(--mode-*)`) and several surfaces need `color-mix()`,
 * which is far more predictable inlined than round-tripped through a class name.
 */

/** The glass recipe from docs/DESIGN_SYSTEM.md.
 *  Inlined because `.glass` in tokens.css is unlayered and would beat any Tailwind
 *  radius utility we tried to compose with it (modals need 16px, not the 12px default). */
export const glassStyle: CSSProperties = {
  background: 'var(--surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-shadow)',
};

/** Full-bleed scrim for modals — flat, because nothing behind it stays interactive. */
export const scrimStyle: CSSProperties = {
  background: 'color-mix(in oklab, var(--bg-0) 68%, transparent)',
};

/** Softer scrim for the inline gates (branch / quiz): darkest under the card, so the
 *  timeline dock and panels stay legible and clickable behind it. */
export const gateScrimStyle: CSSProperties = {
  background:
    'radial-gradient(58rem 38rem at 50% 44%, color-mix(in oklab, var(--bg-0) 82%, transparent), color-mix(in oklab, var(--bg-0) 34%, transparent))',
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Bring a chip into view without ever scrolling the page itself. */
export function scrollIntoViewSoftly(
  el: Element | null | undefined,
  inline: ScrollLogicalPosition = 'center',
): void {
  el?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
    inline,
  });
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Keys `src/lib/keyboard.ts` binds globally and that focused chrome must claim first. */
const SHIELDED_KEYS = new Set([
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'h',
  'l',
  'r',
  'R',
]);

/** Same shield for surfaces that are not focus-trapped (the inline branch/quiz gates). */
export function shieldGlobalKeys(event: { key: string; stopPropagation(): void }): void {
  if (SHIELDED_KEYS.has(event.key)) event.stopPropagation();
}

type Focusable = HTMLElement | SVGElement;

function isFocusable(el: Element): el is Focusable {
  return el instanceof HTMLElement || el instanceof SVGElement;
}

/**
 * Focus trap for modal overlays: moves focus in on open, cycles Tab inside, restores
 * focus to whatever opened it on close.
 *
 * Escape is handled here rather than by a global listener so that only the top-most
 * overlay reacts — the native event is stopped at the overlay root, which keeps the
 * shell's window-level Esc binding from closing a second overlay in the same keystroke.
 */
export function useOverlayFocus<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const escapeRef = useRef<(() => void) | undefined>(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;

    const previous = document.activeElement;
    const restoreTo = previous && isFocusable(previous) ? previous : null;

    const focusables = (): Focusable[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );

    const initial =
      root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? root;
    initial.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const handler = escapeRef.current;
        if (handler) handler();
        else useSimStore.getState().closeTopOverlay();
        return;
      }
      if (event.key !== 'Tab') {
        // Keys the global keymap also claims (step, play/pause, replay) belong to the
        // overlay while it owns focus — otherwise Space on a button would also toggle
        // playback behind the modal.
        if (SHIELDED_KEYS.has(event.key)) event.stopPropagation();
        return;
      }

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && (activeEl === first || activeEl === root)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      // The trigger may itself have unmounted (search → dossier), so check first.
      if (restoreTo && restoreTo.isConnected) restoreTo.focus({ preventScroll: true });
    };
  }, [active]);

  return ref;
}

/** `font-mono` resolves to a self-referential theme value in globals.css, so mono text
 *  goes through the custom property directly (same as ControlBar). */
export const MONO = 'font-[family-name:var(--font-mono)]';

/**
 * Chrome keyframes. Overlays mount fresh (they render `null` when closed), so entrance
 * motion is a plain CSS animation — no React state, no timers, and `globals.css`
 * already neutralises all of it under `prefers-reduced-motion`.
 * Kept here rather than in globals.css, which this task does not own.
 */
export const OVERLAY_KEYFRAMES = `
@keyframes vsa-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes vsa-card-in { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
@keyframes vsa-label-in { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: none } }
@keyframes vsa-shake {
  10%, 90% { transform: translateX(-2px) }
  20%, 80% { transform: translateX(4px) }
  30%, 50%, 70% { transform: translateX(-6px) }
  40%, 60% { transform: translateX(6px) }
}
`;

/** Dossier content, loaded once per session and shared by the modal and the palette. */
let componentCache: ComponentMap | null = null;

export function useComponentMap(): ComponentMap | null {
  const [map, setMap] = useState<ComponentMap | null>(componentCache);

  useEffect(() => {
    if (componentCache) return;
    let cancelled = false;
    void getComponents().then((loaded) => {
      componentCache = loaded;
      if (!cancelled) setMap(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
