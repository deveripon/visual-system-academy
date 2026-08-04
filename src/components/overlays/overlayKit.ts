'use client';

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
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
      if (event.key !== 'Tab') return;

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
