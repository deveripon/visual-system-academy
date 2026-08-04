'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { getComponents } from '@/data';
import { CHAPTERS, type ComponentMap, type NodeId } from '@/data/types';
import { useActiveTimeline } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import {
  MONO,
  cx,
  glassStyle,
  scrimStyle,
  useOverlayFocus,
} from '@/components/overlays/overlayKit';

type Row =
  | { kind: 'step'; key: string; title: string; sub: string; hay: string; index: number }
  | { kind: 'chapter'; key: string; title: string; sub: string; hay: string; n: number }
  | { kind: 'component'; key: string; title: string; sub: string; hay: string; id: NodeId };

interface Group {
  label: string;
  rows: Row[];
}

const LIMITS = { step: 8, component: 8, chapter: 4 } as const;

/**
 * Substring first, subsequence second — at ~300 rows this is instant and costs no
 * dependency. Higher is better; -1 means "no match".
 */
function score(query: string, text: string): number {
  const hay = text.toLowerCase();
  const at = hay.indexOf(query);
  if (at === 0) return 1000 - text.length * 0.2;
  if (at > 0) {
    const boundary = /[\s\-_/.:(]/.test(hay.charAt(at - 1));
    return (boundary ? 760 : 560) - at * 2 - text.length * 0.2;
  }

  let cursor = 0;
  let gaps = 0;
  for (const char of query) {
    const found = hay.indexOf(char, cursor);
    if (found === -1) return -1;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return 300 - gaps * 3 - text.length * 0.2;
}

function rank(query: string, row: Row): number {
  const primary = score(query, row.title);
  const secondary = score(query, row.hay);
  return Math.max(primary, secondary === -1 ? -1 : secondary * 0.55);
}

export function SearchPalette() {
  const open = useSimStore((s) => s.searchOpen);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const timeline = useActiveTimeline();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [components, setComponents] = useState<ComponentMap | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => useSimStore.getState().setSearchOpen(false), []);
  const ref = useOverlayFocus<HTMLDivElement>(open, close);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open || components) return;
    let cancelled = false;
    void getComponents().then((loaded) => {
      if (!cancelled) setComponents(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [open, components]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    timeline.forEach((step, index) => {
      const chapter = CHAPTERS.find((c) => c.n === step.chapter);
      out.push({
        kind: 'step',
        key: `step:${step.id}`,
        title: step.title,
        sub: `ch ${step.chapter} · ${chapter?.title ?? ''}`,
        hay: `${step.title} ${step.id} ${chapter?.title ?? ''} ${step.explain.what}`,
        index,
      });
    });

    CHAPTERS.forEach((chapter) => {
      out.push({
        kind: 'chapter',
        key: `chapter:${chapter.n}`,
        title: chapter.title,
        sub: `chapter ${chapter.n}`,
        hay: `chapter ${chapter.n} ${chapter.title}`,
        n: chapter.n,
      });
    });

    if (components) {
      for (const [id, dossier] of Object.entries(components)) {
        out.push({
          kind: 'component',
          key: `component:${id}`,
          title: dossier.name,
          sub: dossier.tagline,
          hay: `${dossier.name} ${id} ${dossier.tagline}`,
          id: id as NodeId,
        });
      }
    }

    return out;
  }, [timeline, components]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      const current = timeline[stepIndex]?.chapter;
      const nearby = rows.filter((r) => r.kind === 'step' && timeline[r.index]?.chapter === current);
      return nearby.length > 0 ? [{ label: 'this chapter', rows: nearby.slice(0, 8) }] : [];
    }

    const scored = rows
      .map((row) => ({ row, value: rank(q, row) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);

    const bucket = (kind: Row['kind'], label: string): Group => ({
      label,
      rows: scored
        .filter((entry) => entry.row.kind === kind)
        .slice(0, LIMITS[kind])
        .map((entry) => entry.row),
    });

    return [bucket('step', 'steps'), bucket('component', 'components'), bucket('chapter', 'chapters')].filter(
      (group) => group.rows.length > 0,
    );
  }, [query, rows, timeline, stepIndex]);

  const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  useEffect(() => {
    setActive((current) => (current >= flat.length ? 0 : current));
  }, [flat.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  const activate = useCallback((row: Row) => {
    const store = useSimStore.getState();
    store.setSearchOpen(false);
    if (row.kind === 'step') store.jumpTo(row.index);
    else if (row.kind === 'chapter') store.jumpToChapter(row.n);
    else store.openDossier(row.id);
  }, []);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (event.key === 'Enter') {
      const row = flat[active];
      if (row) {
        event.preventDefault();
        activate(row);
      }
    }
  };

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        style={scrimStyle}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Search steps and components"
        tabIndex={-1}
        className="relative flex max-h-[70vh] w-full max-w-[38rem] flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)]"
        style={glassStyle}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="var(--text-3)"
            strokeWidth={1.7}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="vsa-search-results"
            aria-autocomplete="list"
            aria-activedescendant={flat[active] ? `vsa-search-${flat[active].key}` : undefined}
            placeholder="Search steps, components, chapters…"
            className={cx(
              MONO,
              'h-7 w-full bg-transparent text-[14px] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)]',
            )}
          />
          <kbd className={cx(MONO, 'shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-3)]')}>
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="vsa-search-results"
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {flat.length === 0 ? (
            <p className={cx(MONO, 'px-2 py-8 text-center text-[12px] text-[var(--text-3)]')}>
              {query.trim() ? `nothing matches “${query.trim()}”` : 'type to search'}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label} className="mb-1">
                <p
                  aria-hidden="true"
                  className={cx(
                    MONO,
                    'px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]',
                  )}
                >
                  {group.label}
                </p>
                {group.rows.map((row) => {
                  cursor += 1;
                  const index = cursor;
                  const on = index === active;
                  return (
                    <button
                      key={row.key}
                      id={`vsa-search-${row.key}`}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-active={on}
                      tabIndex={-1}
                      onMouseMove={() => setActive(index)}
                      onClick={() => activate(row)}
                      className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 py-1.5 text-left transition-colors duration-150"
                      style={on ? { background: 'var(--surface-2)' } : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(MONO, 'w-[4.5rem] shrink-0 text-[10px] uppercase tracking-wider')}
                        style={{
                          color:
                            row.kind === 'component'
                              ? 'var(--mode-hw)'
                              : row.kind === 'chapter'
                                ? 'var(--mode-remote)'
                                : 'var(--mode-user)',
                        }}
                      >
                        {row.kind}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx(MONO, 'block truncate text-[13px] text-[var(--text-1)]')}>
                          {row.title}
                        </span>
                        <span className="block truncate text-[11.5px] text-[var(--text-3)]">
                          {row.sub}
                        </span>
                      </span>
                      {on ? (
                        <span className={cx(MONO, 'shrink-0 text-[10px] text-[var(--text-3)]')}>↵</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          className={cx(
            MONO,
            'flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-3)]',
          )}
        >
          <span>↑↓ navigate</span>
          <span>↵ jump</span>
          <span>esc close</span>
          <span className="ml-auto">steps jump the timeline · components open a dossier</span>
        </div>
      </div>
    </div>
  );
}
