'use client';

import type { MemSpace } from '@/data/types';

/**
 * The single most under-taught fact in networking: a `send()` does not hand your buffer
 * to the NIC — it *copies* it across the user/kernel boundary into an sk_buff. This
 * widget exists to make that boundary a place, so `mem: 'copy'` can visibly cross it.
 */
interface BandProps {
  title: string;
  ring: string;
  range: string;
  contents: string;
  color: string;
  lit: boolean;
}

function Band({ title, ring, range, contents, color, lit }: BandProps) {
  return (
    <div
      className="rounded-[6px] border px-2.5 py-1.5 transition-colors duration-[var(--t-ui)]"
      style={{
        borderColor: lit ? `color-mix(in oklab, ${color} 55%, transparent)` : 'var(--border)',
        background: lit
          ? `color-mix(in oklab, ${color} 13%, transparent)`
          : 'var(--surface)',
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-[10.5px] font-semibold tracking-[0.06em]"
          style={{ color: lit ? color : 'var(--text-2)' }}
        >
          {title}
        </span>
        <span className="font-mono text-[9.5px] text-t3">{ring}</span>
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-t3">{range}</span>
      </div>
      <p className="mt-0.5 font-mono text-[10px] leading-[1.45] text-t3">{contents}</p>
    </div>
  );
}

export function MemoryMapWidget({ mem }: { mem: MemSpace }) {
  const crossing = mem === 'copy';
  const userLit = mem === 'user' || crossing;
  const kernelLit = mem === 'kernel' || crossing;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="instrument-label">memory map</h3>
        <span
          className="ml-auto font-mono text-[10px] font-semibold"
          style={{
            color: crossing
              ? 'var(--warn)'
              : mem === 'kernel'
                ? 'var(--mode-kernel)'
                : 'var(--mode-user)',
          }}
        >
          {crossing ? 'CROSSING' : mem === 'kernel' ? 'KERNEL SPACE' : 'USER SPACE'}
        </span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1">
        <Band
          title="USER SPACE"
          ring="ring 3"
          range="0x0000…7fff"
          contents="JS heap · V8 objects · stack · request body"
          color="var(--mode-user)"
          lit={userLit}
        />

        {/* The boundary is always drawn so the layout never jumps; it only lights up on a copy. */}
        <div
          className="flex items-center gap-2 px-1 py-[3px]"
          style={{
            borderTop: `1px ${crossing ? 'solid' : 'dashed'} ${
              crossing
                ? 'color-mix(in oklab, var(--warn) 60%, transparent)'
                : 'var(--border)'
            }`,
            borderBottom: `1px ${crossing ? 'solid' : 'dashed'} ${
              crossing
                ? 'color-mix(in oklab, var(--warn) 60%, transparent)'
                : 'var(--border)'
            }`,
          }}
        >
          <span
            aria-hidden="true"
            className="font-mono text-[11px]"
            style={{ color: crossing ? 'var(--warn)' : 'var(--text-3)' }}
          >
            {crossing ? '⇅' : '—'}
          </span>
          <span
            className="font-mono text-[9.5px] tracking-[0.04em]"
            style={{ color: crossing ? 'var(--warn)' : 'var(--text-3)' }}
          >
            {crossing
              ? 'copy_to_user() / copy_from_user() — the boundary is crossed'
              : 'user / kernel boundary'}
          </span>
        </div>

        <Band
          title="KERNEL SPACE"
          ring="ring 0"
          range="0xffff8000…"
          contents="sk_buff · socket send queue · TCP retransmit queue"
          color="var(--mode-kernel)"
          lit={kernelLit}
        />
      </div>
    </div>
  );
}
