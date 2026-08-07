'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/**
 * The theme lives on <html data-theme> (stamped pre-hydration by layout.tsx), so the
 * DOM attribute IS the store — this component just subscribes to it. That keeps a
 * second tab, devtools edits and the boot script all in agreement, and avoids the
 * set-state-in-effect pattern this repo lints against.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const getServerSnapshot = (): Theme => 'light';

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dark = theme === 'dark';

  const flip = () => {
    const next: Theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('vsa-theme', next);
    } catch {
      /* private mode — the choice just won't persist */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="grid h-9 w-9 place-items-center rounded-[10px] border border-transparent text-[var(--text-2)] transition-colors duration-150 hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
    >
      {/* Sun and moon crossfade + rotate around the same centre — one 2D move. */}
      <span className="relative block h-[18px] w-[18px]">
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          className="absolute inset-0 transition-[opacity,transform] duration-300"
          style={{
            opacity: dark ? 0 : 1,
            transform: dark ? 'rotate(90deg) scale(0.6)' : 'none',
            transitionTimingFunction: 'var(--ease-out)',
          }}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute inset-0 transition-[opacity,transform] duration-300"
          style={{
            opacity: dark ? 1 : 0,
            transform: dark ? 'none' : 'rotate(-90deg) scale(0.6)',
            transitionTimingFunction: 'var(--ease-out)',
          }}
          aria-hidden="true"
        >
          <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 7.5 7.5 0 1 0 20 13.5z" />
        </svg>
      </span>
    </button>
  );
}
