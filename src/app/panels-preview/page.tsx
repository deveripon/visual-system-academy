'use client';

import { RightRail } from '@/components/panels/RightRail';
import { useSimStore } from '@/state/store';

export default function PanelsPreview() {
  const jumpTo = useSimStore((s) => s.jumpTo);
  const index = useSimStore((s) => s.stepIndex);
  return (
    <div className="relative z-10 flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        {[0, 24, 30, 46, 55, 70, 95, 120].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => jumpTo(n)}
            className="rounded border border-line px-2 py-1 font-mono text-[11px] text-t2"
          >
            {n}
          </button>
        ))}
        <span className="ml-3 font-mono text-[11px] text-t3">index {index}</span>
      </header>
      <main className="relative flex min-h-0 flex-1 lg:flex-row">
        <section className="relative min-h-0 min-w-0 flex-1" />
        <RightRail />
      </main>
      <div className="h-[80px] shrink-0 border-t border-line" />
    </div>
  );
}
