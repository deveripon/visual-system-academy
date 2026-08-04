import type { OsState, Step } from '@/data/types';

export const INITIAL_OS_STATE: OsState = {
  mode: 'user',
  proc: 'chrome renderer · PID 4821',
  sock: 'CLOSED',
  fds: [
    ['0', '/dev/null'],
    ['1', 'pipe:[log]'],
    ['2', 'pipe:[log]'],
  ],
  mem: 'user',
  counters: { ring: 0, pool: 0, queue: 0 },
};

const COUNTER_DELTAS: Record<string, [keyof OsState['counters'], number]> = {
  'ring+': ['ring', 1],
  'ring-': ['ring', -1],
  'pool+': ['pool', 1],
  'pool-': ['pool', -1],
  'queue+': ['queue', 1],
  'queue-': ['queue', -1],
};

function cloneState(s: OsState): OsState {
  return { ...s, fds: s.fds.map((fd) => [...fd] as [string, string]), counters: { ...s.counters } };
}

/**
 * The displayed OS state at step N is a pure left fold of the per-step patches over the
 * ACTIVE timeline. This is what makes an arbitrary jump produce exactly the same state
 * as stepping there — nothing accumulates through animation side effects.
 * See docs/ARCHITECTURE.md §1.
 */
export function foldOsState(timeline: Step[], upTo: number): OsState {
  const acc = cloneState(INITIAL_OS_STATE);
  const last = Math.min(upTo, timeline.length - 1);

  for (let i = 0; i <= last; i++) {
    const step = timeline[i];
    if (!step) continue;

    // `mode` on the step is authoritative for where we are; `state.mode` may repeat it.
    acc.mode = step.mode;

    const patch = step.state;
    if (patch) {
      if (patch.mode) acc.mode = patch.mode;
      if (patch.proc) acc.proc = patch.proc;
      if (patch.sock) acc.sock = patch.sock;
      if (patch.mem) acc.mem = patch.mem;
      // An `fds` patch replaces the whole table — content authors it as a full snapshot.
      if (patch.fds) acc.fds = patch.fds.map((fd) => [...fd] as [string, string]);
    }

    for (const effect of step.effects ?? []) {
      const delta = COUNTER_DELTAS[effect];
      if (!delta) continue;
      const [key, amount] = delta;
      acc.counters[key] = Math.max(0, acc.counters[key] + amount);
    }
  }

  return acc;
}
