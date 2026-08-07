'use client';

import { useOsState } from '@/state/selectors';
import { CpuRingIndicator } from './CpuRingIndicator';
import { FdTable } from './FdTable';
import { MemoryMapWidget } from './MemoryMapWidget';
import { TcpStateMachine } from './TcpStateMachine';

/**
 * Every value here comes from `useOsState()`, which is a pure fold over steps 0..N.
 * Nothing in this subtree accumulates, so an arbitrary jump reconstructs exactly the same
 * picture as walking there one step at a time (docs/ARCHITECTURE.md §1).
 *
 * Voice: this panel is read by beginners mid-lesson, so every section carries one plain
 * sentence saying what it IS before the instrument shows its value.
 */
export function OsStatePanel() {
  const os = useOsState();
  const { counters } = os;
  const hasCounters = counters.ring > 0 || counters.pool > 0 || counters.queue > 0;

  return (
    <section aria-label="Machine state" className="flex flex-col gap-3 p-3 text-t2">
      <div>
        <h2 className="instrument-label">machine state</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-t3">
          A live view of the computer at this exact step.
        </p>
      </div>

      <CpuRingIndicator mode={os.mode} />

      <div className="rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="instrument-label shrink-0">process</span>
          <span className="ml-auto truncate font-mono text-[11px] text-t1">{os.proc}</span>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-snug text-t3">
          The program doing the work right now.
        </p>
      </div>

      {/* Hardware queues only earn screen space once something is actually in them. */}
      {hasCounters && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1.5 font-mono text-[10.5px] text-t2">
          {counters.ring > 0 && <span>NIC ring buffer: {counters.ring} frame(s)</span>}
          {counters.pool > 0 && <span>DB connections out: {counters.pool}</span>}
          {counters.queue > 0 && <span>accept queue: {counters.queue} waiting</span>}
        </div>
      )}

      {/*
        The fd table sits last on purpose: it is the only widget whose height varies with
        content and it already scrolls internally, so when the rail runs out of room it is
        the one that gives — never the memory map, whose whole job is to show the
        user/kernel crossing at the exact moment `mem: 'copy'` happens.
      */}
      <TcpStateMachine state={os.sock} />
      <MemoryMapWidget mem={os.mem} />
      <FdTable fds={os.fds} />
    </section>
  );
}
