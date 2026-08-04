'use client';

import { useSimStore } from '@/state/store';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.getAttribute('role') === 'textbox'
  );
}

/** One window listener for the whole app. Returns an unsubscribe function. */
export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const s = useSimStore.getState();

    // Esc always works, even from inside an input (it closes the overlay).
    if (e.key === 'Escape') {
      if (s.closeTopOverlay()) e.preventDefault();
      return;
    }

    if (isTypingTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        s.next();
        break;
      case 'ArrowLeft':
      case 'h':
        e.preventDefault();
        s.prev();
        break;
      case ' ':
        e.preventDefault();
        s.togglePlay();
        break;
      case '/':
        e.preventDefault();
        s.setSearchOpen(true);
        break;
      case 'r':
        e.preventDefault();
        s.replayStep();
        break;
      case 'R':
        e.preventDefault();
        s.restart();
        break;
      case '?':
        e.preventDefault();
        s.setHelpOpen(!s.helpOpen);
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
