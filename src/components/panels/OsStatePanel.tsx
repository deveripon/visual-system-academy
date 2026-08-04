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
 */
export function OsStatePanel() {
  const os = useOsState();
  const { counters } = os;

  return (
    <section
      aria-label="Machine state"
      className="flex flex-col gap-3 p-3.5 text-t2"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="instrument-label">machine state</h2>
        <span className="ml-auto font-mono text-[9.5px] text-t3 tabular-nums">
          ring {counters.ring} · pool {counters.pool} · queue {counters.queue}
        </span>
      </div>

      <CpuRingIndicator mode={os.mode} />

      <div className="flex items-baseline gap-2 rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1.5">
        <span className="instrument-label shrink-0">process</span>
        <span className="ml-auto truncate font-mono text-[11px] text-t1">{os.proc}</span>
      </div>

      <FdTable fds={os.fds} />
      <TcpStateMachine state={os.sock} />
      <MemoryMapWidget mem={os.mem} />
    </section>
  );
}
