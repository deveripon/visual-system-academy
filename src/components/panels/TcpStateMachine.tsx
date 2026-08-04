'use client';

import { Fragment } from 'react';

/**
 * The RFC 793 state machine, folded to the two paths a client actually walks: the active
 * open/close sequence, and the passive sequence it meets on the other side. Not a full
 * diagram — a legible rail that shows where the socket is and what it already survived.
 */
const ACTIVE_PATH = [
  'CLOSED',
  'SYN_SENT',
  'ESTABLISHED',
  'FIN_WAIT_1',
  'FIN_WAIT_2',
  'TIME_WAIT',
] as const;

const PASSIVE_PATH = ['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'] as const;

/**
 * Content annotates states ("ESTABLISHED (proxy → app)") so the learner knows *which*
 * socket. The graph keys off the bare state name; the annotation is shown verbatim above.
 */
function stateKey(raw: string): string {
  return /^[A-Z][A-Z0-9_]*/.exec(raw.trim())?.[0] ?? '';
}

type ChipTone = 'past' | 'current' | 'future';

function Chip({ label, tone, small }: { label: string; tone: ChipTone; small?: boolean }) {
  const base = small ? 'text-[9.5px] px-1.5 py-[2px]' : 'text-[10px] px-2 py-[3px]';
  const style =
    tone === 'current'
      ? {
          color: 'var(--mode-net)',
          borderColor: 'color-mix(in oklab, var(--mode-net) 55%, transparent)',
          background: 'color-mix(in oklab, var(--mode-net) 16%, transparent)',
          boxShadow: '0 0 10px color-mix(in oklab, var(--mode-net) 30%, transparent)',
        }
      : tone === 'past'
        ? {
            color: 'color-mix(in oklab, var(--ok) 78%, transparent)',
            borderColor: 'color-mix(in oklab, var(--ok) 28%, transparent)',
          }
        : { color: 'var(--text-3)', borderColor: 'var(--border)' };

  return (
    <li
      aria-current={tone === 'current' ? 'step' : undefined}
      className={`rounded-full border font-mono font-semibold tracking-[0.05em] whitespace-nowrap ${base}`}
      style={style}
    >
      {label}
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden="true" className="font-mono text-[10px] text-t3">
      →
    </li>
  );
}

function Path({
  states,
  currentIndex,
  small,
}: {
  states: readonly string[];
  currentIndex: number;
  small?: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {states.map((state, i) => (
        <Fragment key={state}>
          {i > 0 ? <Arrow /> : null}
          <Chip
            label={state}
            small={small}
            tone={
              currentIndex < 0
                ? 'future'
                : i === currentIndex
                  ? 'current'
                  : i < currentIndex
                    ? 'past'
                    : 'future'
            }
          />
        </Fragment>
      ))}
    </ol>
  );
}

export function TcpStateMachine({ state }: { state: string }) {
  const key = stateKey(state);
  const activeIndex = (ACTIVE_PATH as readonly string[]).indexOf(key);
  const passiveIndex = (PASSIVE_PATH as readonly string[]).indexOf(key);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="instrument-label">socket state</h3>
        <span
          className="ml-auto truncate font-mono text-[10.5px] font-semibold"
          style={{ color: 'var(--mode-net)' }}
        >
          {state}
        </span>
      </div>

      <div className="mt-1.5 rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-2">
        <Path states={ACTIVE_PATH} currentIndex={activeIndex} />
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
          {/* .instrument-label is unlayered CSS, so its 11px beats any utility — inline wins. */}
          <span className="instrument-label shrink-0" style={{ fontSize: '9.5px' }}>
            passive
          </span>
          <Path states={PASSIVE_PATH} currentIndex={passiveIndex} small />
        </div>
      </div>
    </div>
  );
}
