'use client';

import { CHAOS } from '@/data';
import type { ChaosId } from '@/data/types';
import { useSimStore } from '@/state/store';
import {
  MONO,
  cx,
  glassStyle,
  scrimStyle,
  useOverlayFocus,
} from '@/components/overlays/overlayKit';

/** Canonical order + the browser-visible consequence of each failure (FR10). The data
 *  model has no field for the outcome, and naming it up front is the whole hook. */
const SCENARIOS: { id: ChaosId; name: string; consequence: string }[] = [
  { id: 'dnsdown', name: 'DNS resolver down', consequence: 'ERR_NAME_NOT_RESOLVED — the name never resolves.' },
  { id: 'synfail', name: 'SYN blackholed', consequence: 'ERR_CONNECTION_TIMED_OUT after retries with exponential backoff.' },
  { id: 'certfail', name: 'Invalid certificate', consequence: 'NET::ERR_CERT_AUTHORITY_INVALID — TLS alert 48, no bytes exchanged.' },
  { id: 'dbdown', name: 'PostgreSQL down', consequence: 'Pool checkout fails, Prisma P1001, HTTP 500 from the API.' },
  { id: 'portinuse', name: 'Port already in use', consequence: 'EADDRINUSE — the server never binds, so nothing is listening.' },
];

const FALLBACK_ICON = '⚠';

function ChaosBadge({ chaosId }: { chaosId: ChaosId }) {
  const scenario = CHAOS[chaosId];
  return (
    <div
      role="status"
      className="fixed left-1/2 top-[68px] z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full border px-3 py-1.5"
      style={{
        ...glassStyle,
        borderColor: 'color-mix(in oklab, var(--err) 55%, transparent)',
        background: 'color-mix(in oklab, var(--err) 16%, var(--surface))',
        boxShadow: '0 10px 40px -18px var(--err), var(--glass-shadow)',
      }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 animate-pulse rounded-full"
        style={{ background: 'var(--err)', boxShadow: '0 0 10px var(--err)' }}
      />
      <span
        className={cx(MONO, 'text-[11px] font-semibold uppercase tracking-[0.12em]')}
        style={{ color: 'var(--err)' }}
      >
        chaos active
      </span>
      <span className={cx(MONO, 'text-[11px] text-[var(--text-2)]')}>
        {scenario?.label ?? chaosId}
      </span>
      <button
        type="button"
        onClick={() => useSimStore.getState().exitChaos()}
        className={cx(
          MONO,
          'ml-1 h-6 rounded-full border border-[var(--border)] px-2 text-[10px] uppercase tracking-wider text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
        )}
      >
        exit ✕
      </button>
    </div>
  );
}

/**
 * "What if?" — failure injection. Renders the persistent chaos badge whenever a
 * scenario is running, and the launcher dialog when the store opens it.
 * Content may still be landing, so an unauthored scenario shows as "coming soon"
 * rather than a crash or a missing row.
 */
export function ChaosMenu() {
  const open = useSimStore((s) => s.chaosMenuOpen);
  const chaosId = useSimStore((s) => s.chaosId);
  const ref = useOverlayFocus<HTMLDivElement>(open);

  return (
    <>
      {chaosId ? <ChaosBadge chaosId={chaosId} /> : null}
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-6">
          <button
            type="button"
            aria-label="Close failure injection menu"
            onClick={() => useSimStore.getState().setChaosMenuOpen(false)}
            className="absolute inset-0 cursor-default"
            style={scrimStyle}
            tabIndex={-1}
          />

          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vsa-chaos-title"
            tabIndex={-1}
            className="relative max-h-[82vh] w-full max-w-[38rem] overflow-y-auto rounded-[var(--r-lg)] border p-5"
            style={{
              ...glassStyle,
              borderColor: 'color-mix(in oklab, var(--err) 34%, transparent)',
              boxShadow: '0 30px 90px -40px var(--err), var(--glass-shadow)',
            }}
          >
            <div className="flex items-start gap-3">
              <div>
                <p
                  className={cx(MONO, 'text-[10px] font-semibold uppercase tracking-[0.14em]')}
                  style={{ color: 'var(--err)' }}
                >
                  failure injection
                </p>
                <h2
                  id="vsa-chaos-title"
                  className="mt-1 text-[19px] font-semibold tracking-tight text-[var(--text-1)]"
                >
                  What if?
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                  Break one thing and follow the failure all the way to the error the browser
                  actually shows. Exit any time to return to the working timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => useSimStore.getState().setChaosMenuOpen(false)}
                className={cx(
                  MONO,
                  'ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
                )}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <ul className="mt-4 grid gap-2">
              {SCENARIOS.map(({ id, name, consequence }) => {
                const scenario = CHAOS[id] as (typeof CHAOS)[ChaosId] | undefined;
                const ready = Boolean(scenario?.steps?.length);
                const active = chaosId === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => useSimStore.getState().enterChaos(id)}
                      className={cx(
                        'flex w-full items-start gap-3 rounded-[var(--r-md)] border p-3 text-left transition-colors duration-150',
                        ready
                          ? 'hover:border-[color-mix(in_oklab,var(--err)_45%,transparent)] hover:bg-[var(--surface-2)]'
                          : 'cursor-not-allowed opacity-50',
                      )}
                      style={{
                        borderColor: active
                          ? 'color-mix(in oklab, var(--err) 55%, transparent)'
                          : 'var(--border)',
                        background: active
                          ? 'color-mix(in oklab, var(--err) 12%, transparent)'
                          : 'var(--surface)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border text-[15px]"
                        style={{
                          borderColor: 'color-mix(in oklab, var(--err) 30%, transparent)',
                          background: 'color-mix(in oklab, var(--err) 10%, transparent)',
                        }}
                      >
                        {scenario?.icon || FALLBACK_ICON}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span
                            className={cx(MONO, 'text-[13px] font-semibold text-[var(--text-1)]')}
                          >
                            {scenario?.label ?? name}
                          </span>
                          {active ? (
                            <span
                              className={cx(MONO, 'rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider')}
                              style={{
                                color: 'var(--err)',
                                background: 'color-mix(in oklab, var(--err) 16%, transparent)',
                              }}
                            >
                              running
                            </span>
                          ) : null}
                          {!ready ? (
                            <span
                              className={cx(MONO, 'rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-3)]')}
                              style={{ background: 'var(--surface-2)' }}
                            >
                              coming soon
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-2)]">
                          {consequence}
                        </span>
                      </span>
                      {ready ? (
                        <span
                          aria-hidden="true"
                          className={cx(MONO, 'ml-auto self-center text-[13px] text-[var(--text-3)]')}
                        >
                          →
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {chaosId ? (
              <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4">
                <span className={cx(MONO, 'text-[11px] text-[var(--text-3)]')}>
                  currently running a failure scenario
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const store = useSimStore.getState();
                    store.exitChaos();
                    store.setChaosMenuOpen(false);
                  }}
                  className={cx(
                    MONO,
                    'ml-auto h-8 rounded-lg border px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150',
                  )}
                  style={{
                    borderColor: 'color-mix(in oklab, var(--err) 50%, transparent)',
                    background: 'color-mix(in oklab, var(--err) 12%, transparent)',
                    color: 'var(--err)',
                  }}
                >
                  exit chaos
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
