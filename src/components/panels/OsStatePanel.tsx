'use client';

import { useOsState } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { CpuRingIndicator } from './CpuRingIndicator';
import { FdTable } from './FdTable';
import { MemoryMapWidget } from './MemoryMapWidget';
import { TcpStateMachine } from './TcpStateMachine';

/**
 * Every value here comes from `useOsState()`, a pure fold over steps 0..N — jumps
 * reconstruct the identical picture (docs/ARCHITECTURE.md §1).
 *
 * The panel is REACTIVE: a widget only opens fully while its value just changed
 * (provenance from `os.touched`); the rest collapse to one plain sentence. A wall of
 * frozen instruments reads as "out of sync" — showing only what moved is what makes the
 * rail feel alive. Freshly-changed sections pulse once.
 */
export function OsStatePanel() {
  const os = useOsState();
  const stepIndex = useSimStore((s) => s.stepIndex);
  const { counters } = os;
  const hasCounters = counters.ring > 0 || counters.pool > 0 || counters.queue > 0;

  /** Changed at this step or the one before — recent enough to deserve full size. */
  const fresh = (field: keyof typeof os.touched) =>
    os.touched[field] >= 0 && stepIndex - os.touched[field] <= 1;

  const connectionStarted = os.touched.sock >= 0;

  return (
    <section aria-label="Machine state" className="flex flex-col gap-3 p-3 text-t2">
      <div>
        <h2 className="instrument-label">machine state</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-t3">
          A live view of the computer at this exact step. Sections open when they change.
        </p>
      </div>

      <Pulse when={os.touched.mode === stepIndex} k={`mode-${os.touched.mode}`}>
        <CpuRingIndicator mode={os.mode} />
      </Pulse>

      <Pulse when={os.touched.proc === stepIndex} k={`proc-${os.touched.proc}`}>
        <div className="rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1.5">
          <div className="flex items-baseline gap-2">
            <span className="instrument-label shrink-0">process</span>
            <span className="ml-auto truncate font-mono text-[11px] text-t1">{os.proc}</span>
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-t3">
            The program doing the work right now.
          </p>
        </div>
      </Pulse>

      {hasCounters && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1.5 font-mono text-[10.5px] text-t2">
          {counters.ring > 0 && <span>NIC ring buffer: {counters.ring} frame(s)</span>}
          {counters.pool > 0 && <span>DB connections out: {counters.pool}</span>}
          {counters.queue > 0 && <span>accept queue: {counters.queue} waiting</span>}
        </div>
      )}

      {fresh('sock') ? (
        <Pulse when={os.touched.sock === stepIndex} k={`sock-${os.touched.sock}`}>
          <TcpStateMachine state={os.sock} />
        </Pulse>
      ) : (
        <SummaryRow
          label="connection"
          value={os.sock}
          note={
            connectionStarted
              ? 'The path to the server — opens fully when it changes.'
              : 'No connection yet — we have not dialled the server.'
          }
        />
      )}

      {fresh('mem') || os.mem === 'copy' ? (
        <Pulse when={os.touched.mem === stepIndex} k={`mem-${os.touched.mem}`}>
          <MemoryMapWidget mem={os.mem} />
        </Pulse>
      ) : (
        <SummaryRow
          label="memory"
          value={os.mem === 'kernel' ? 'kernel space' : 'user space'}
          note={
            os.mem === 'kernel'
              ? 'Working in the kernel’s half of RAM.'
              : 'Working in your program’s half of RAM.'
          }
        />
      )}

      {fresh('fds') ? (
        <Pulse when={os.touched.fds === stepIndex} k={`fds-${os.touched.fds}`}>
          <FdTable fds={os.fds} />
        </Pulse>
      ) : (
        <SummaryRow
          label="open handles"
          value={`${os.fds.length} open`}
          note="Files, pipes and connections this program holds — opens when one is added."
        />
      )}
    </section>
  );
}

/** A collapsed instrument: one honest line instead of a frozen widget. */
function SummaryRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-dashed border-line px-2.5 py-1.5 opacity-80">
      <div className="flex items-baseline gap-2">
        <span className="instrument-label shrink-0">{label}</span>
        <span className="ml-auto truncate font-mono text-[10.5px] text-t2">{value}</span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug text-t3">{note}</p>
    </div>
  );
}

/** Replays a one-shot pulse whenever `k` changes — remount is the animation trigger. */
function Pulse({ when, k, children }: { when: boolean; k: string; children: React.ReactNode }) {
  return (
    <div key={k} style={when ? { animation: 'vsa-changed 900ms var(--ease-out) both' } : undefined}>
      {children}
    </div>
  );
}
