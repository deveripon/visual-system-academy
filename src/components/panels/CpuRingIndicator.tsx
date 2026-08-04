'use client';

import type { StepMode } from '@/data/types';
import { MODE_HINT, MODE_LABEL, modeColor } from '@/scene/modeColors';

/**
 * x86 protection rings: 3 is unprivileged user code, 0 is the kernel. Rings 1 and 2 exist
 * on paper and no mainstream OS uses them, so the dial shows the two that matter.
 * When the story is off-CPU (wire, NIC, remote infrastructure) neither ring is lit — the
 * local processor is not the thing executing, and pretending otherwise would be a lie.
 */
function activeRing(mode: StepMode): 0 | 3 | null {
  if (mode === 'user') return 3;
  if (mode === 'kernel') return 0;
  return null;
}

interface RingProps {
  r: number;
  lit: boolean;
  color: string;
}

function Ring({ r, lit, color }: RingProps) {
  return (
    <circle
      cx="32"
      cy="32"
      r={r}
      fill="none"
      strokeWidth="4.5"
      stroke={lit ? color : 'var(--border-strong)'}
      style={lit ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}
    />
  );
}

export function CpuRingIndicator({ mode }: { mode: StepMode }) {
  const ring = activeRing(mode);
  const color = modeColor(mode);
  const numeral = ring === null ? '—' : String(ring);

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 64 64"
        width="58"
        height="58"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* outer band = ring 3, inner band = ring 0 */}
        <Ring r={27} lit={ring === 3} color={color} />
        <Ring r={16} lit={ring === 0} color={color} />
        <text
          x="32"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-mono)"
          fontSize="15"
          fontWeight="600"
          fill={ring === null ? 'var(--text-3)' : color}
        >
          {numeral}
        </text>
      </svg>

      <div className="min-w-0">
        <p
          className="font-mono text-[13px] font-semibold tracking-[0.06em]"
          style={{ color }}
        >
          {MODE_LABEL[mode]}
        </p>
        <p className="mt-1 text-[11px] leading-[1.45] text-t3">{MODE_HINT[mode]}</p>
      </div>
    </div>
  );
}
