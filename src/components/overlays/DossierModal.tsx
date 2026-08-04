'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getComponents } from '@/data';
import type { ComponentMap, NodeId } from '@/data/types';
import { useSimStore } from '@/state/store';
import {
  MONO,
  cx,
  glassStyle,
  scrimStyle,
  useOverlayFocus,
} from '@/components/overlays/overlayKit';

function Section({
  title,
  children,
  accent,
}: {
  title: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <section className="mt-5">
      <h3
        className={cx(MONO, 'text-[10px] font-semibold uppercase tracking-[0.14em]')}
        style={{ color: accent ?? 'var(--text-3)' }}
      >
        {title}
      </h3>
      <div className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-2)]">{children}</div>
    </section>
  );
}

/**
 * The full component dossier. Content is loaded through `getComponents()` so the
 * dossier chunk never costs anything until a learner opens one.
 */
export function DossierModal() {
  const nodeId = useSimStore((s) => s.dossierNodeId);
  const open = nodeId !== null;

  const [map, setMap] = useState<ComponentMap | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [trail, setTrail] = useState<NodeId[]>([]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const close = useCallback(() => useSimStore.getState().openDossier(null), []);
  const ref = useOverlayFocus<HTMLDivElement>(open, close);

  useEffect(() => {
    if (!open || map) return;
    let cancelled = false;
    void getComponents().then((loaded) => {
      if (!cancelled) setMap(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [open, map]);

  // A new component means a new document: back to the top, focus on the new name.
  useEffect(() => {
    if (!nodeId) return;
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [nodeId]);

  useEffect(() => {
    if (!open) setTrail([]);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open || !nodeId) return null;

  const dossier = map?.[nodeId];

  const navigate = (next: NodeId): void => {
    setTrail((t) => [...t, nodeId]);
    useSimStore.getState().openDossier(next);
  };

  const back = (): void => {
    const previous = trail[trail.length - 1];
    if (!previous) return;
    setTrail((t) => t.slice(0, -1));
    useSimStore.getState().openDossier(previous);
  };

  const copy = (cmd: string): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(cmd).then(
      () => setCopied(cmd),
      () => undefined,
    );
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close dossier"
        onClick={close}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        style={scrimStyle}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vsa-dossier-name"
        tabIndex={-1}
        className="relative flex max-h-[88vh] w-full max-w-[48rem] flex-col rounded-[var(--r-lg)] border border-[var(--border)]"
        style={glassStyle}
      >
        {/* header */}
        <header className="flex items-start gap-3 border-b border-[var(--border)] p-5">
          {trail.length > 0 ? (
            <button
              type="button"
              onClick={back}
              className={cx(
                MONO,
                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
              )}
              aria-label="Back to previous component"
              title="Back"
            >
              ←
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cx(MONO, 'rounded px-1.5 py-0.5 text-[10px] tracking-wider')}
                style={{
                  color: 'var(--mode-user)',
                  background: 'color-mix(in oklab, var(--mode-user) 12%, transparent)',
                }}
              >
                {nodeId}
              </span>
              <span className={cx(MONO, 'text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]')}>
                component dossier
              </span>
            </div>
            <h2
              id="vsa-dossier-name"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1.5 text-[21px] font-semibold tracking-tight text-[var(--text-1)] outline-none"
            >
              {dossier?.name ?? nodeId}
            </h2>
            {dossier ? (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-2)]">
                {dossier.tagline}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cx(
              MONO,
              'ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
            )}
          >
            ✕
          </button>
        </header>

        {/* body */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {!map ? (
            <p className={cx(MONO, 'py-10 text-center text-[12px] text-[var(--text-3)]')}>
              loading dossier…
            </p>
          ) : !dossier ? (
            <p className="py-10 text-center text-[13px] text-[var(--text-2)]">
              No dossier has been authored for{' '}
              <span className={cx(MONO, 'text-[var(--text-1)]')}>{nodeId}</span> yet.
            </p>
          ) : (
            <>
              <Section title="What it is">
                <p>{dossier.description}</p>
              </Section>

              <Section title="Why it exists">
                <p>{dossier.purpose}</p>
              </Section>

              <Section title="History">
                <p>{dossier.history}</p>
              </Section>

              <Section title="Responsibilities">
                <ul className="grid gap-1.5">
                  {dossier.responsibilities.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full"
                        style={{ background: 'var(--mode-user)' }}
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {dossier.commands.length > 0 ? (
                <Section title="See it yourself">
                  <ul className="grid gap-2">
                    {dossier.commands.map((command) => (
                      <li
                        key={command.cmd}
                        className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <code
                            className={cx(
                              MONO,
                              'min-w-0 flex-1 whitespace-pre-wrap break-words text-[12.5px] text-[var(--text-1)]',
                            )}
                          >
                            {command.cmd}
                          </code>
                          <button
                            type="button"
                            onClick={() => copy(command.cmd)}
                            className={cx(
                              MONO,
                              'h-6 shrink-0 rounded border border-[var(--border)] px-1.5 text-[10px] uppercase tracking-wider text-[var(--text-3)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
                            )}
                            aria-label={`Copy command: ${command.cmd}`}
                          >
                            {copied === command.cmd ? '✓ copied' : 'copy'}
                          </button>
                        </div>
                        {command.note ? (
                          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                            {command.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              <Section title="In production" accent="var(--mode-remote)">
                <p
                  className="rounded-[var(--r-sm)] border p-3"
                  style={{
                    borderColor: 'color-mix(in oklab, var(--mode-remote) 30%, transparent)',
                    background: 'color-mix(in oklab, var(--mode-remote) 8%, transparent)',
                  }}
                >
                  {dossier.production}
                </p>
              </Section>

              {dossier.interview.length > 0 ? (
                <details className="mt-5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <summary
                    className={cx(
                      MONO,
                      'cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] hover:text-[var(--text-1)]',
                    )}
                  >
                    interview questions ({dossier.interview.length})
                  </summary>
                  <ol className="mt-3 grid gap-2">
                    {dossier.interview.map((question, i) => (
                      <li key={question} className="flex gap-2.5 text-[13px] leading-relaxed text-[var(--text-2)]">
                        <span className={cx(MONO, 'shrink-0 text-[11px] text-[var(--text-3)]')}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {dossier.sources.length > 0 ? (
                <Section title="Sources">
                  <ul className={cx(MONO, 'grid gap-1 text-[12px] text-[var(--text-3)]')}>
                    {dossier.sources.map((source) => (
                      <li key={source}>{source}</li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {dossier.related.length > 0 ? (
                <Section title="Related">
                  <ul className="flex flex-wrap gap-1.5">
                    {dossier.related.map((related) => {
                      const target = map[related];
                      return (
                        <li key={related}>
                          <button
                            type="button"
                            onClick={() => navigate(related)}
                            title={target?.tagline}
                            className={cx(
                              MONO,
                              'h-7 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-2)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
                            )}
                          >
                            {target?.name ?? related}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
