'use client';

import { useEffect, useRef } from 'react';
import type { Step } from '@/data/types';
import { TREE_INSTANCE, useActiveTimeline } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { modeColor, modeFill } from '@/scene/modeColors';
import { mergeProd } from '@/engine/scenarioEngine';
import type { TreeId } from '@/engine/simulation-engine';
import { StepCard } from './StepCard';

/**
 * Story mode as a 2D animated slide deck. The shell never moves; the canvas is a fixed
 * stage with two regions:
 *
 *   chain rail   one chip per node visited, in a single row that GLIDES one notch left
 *                each time the story enters a new node — the camera move
 *   the slide    the current step's card, centre stage, sliding in keyed on step.id
 *
 * Composition is stable on every step: rail up top, card in the middle. No zig-zag, no
 * graveyard of past cards, no dead space.
 */
export function FlowCanvas() {
  const timeline = useActiveTimeline();
  const index = useSimStore((s) => s.stepIndex);
  const prodMode = useSimStore((s) => s.prodMode);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const revealed = timeline.slice(0, index + 1);

  /*
   * One chip per PLACE, ever — global dedup, not just consecutive. The journey genuinely
   * bounces back to hubs like the Network Service; drawing a new chip each visit filled
   * the rail with repeats. Revisiting a place re-lights its existing chip instead, and
   * the camera pans back to it — which reads exactly like returning somewhere.
   */
  const chain: { node: TreeId; step: Step }[] = [];
  const position = new Map<TreeId, number>();
  let latest: Step | null = null;
  for (const raw of revealed) {
    const step = prodMode ? mergeProd(raw) : raw;
    latest = step;
    const at = position.get(step.node);
    if (at === undefined) {
      position.set(step.node, chain.length);
      chain.push({ node: step.node, step });
    } else {
      chain[at].step = step; // latest beat inside the node wins the colour
    }
  }
  const currentChipIndex = latest ? (position.get(latest.node) ?? -1) : -1;
  const current = latest ? { node: latest.node, step: latest } : null;

  /*
   * The camera: an imperative transform on the rail track (never React state). The
   * current chip parks at 62% of the stage width, so there is always a visible trail of
   * where you came from and room for what is next.
   */
  useEffect(() => {
    const pan = () => {
      const stage = stageRef.current;
      const track = railRef.current;
      const chip = track?.querySelector<HTMLElement>('[data-chip-current="true"]');
      if (!stage || !track || !chip) return;
      const target = chip.offsetLeft + chip.offsetWidth / 2 - stage.clientWidth * 0.62;
      track.style.transform = `translateX(${-Math.max(0, target)}px)`;
    };
    const raf = requestAnimationFrame(pan);
    const settle = setTimeout(pan, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [index]);

  if (!current) return null;

  return (
    <div
      ref={stageRef}
      className="flex h-full flex-col overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(var(--dots) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      {/* ── chain rail ──────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 overflow-hidden pt-7"
        style={{
          // The oldest chips slip off the left edge under a fade, not a hard cut.
          maskImage: 'linear-gradient(to right, transparent, black 9%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 9%, black 100%)',
        }}
      >
        <div
          ref={railRef}
          className="flex w-max items-center pl-4 pr-24 transition-transform duration-700 will-change-transform sm:pl-12"
          style={{ transitionTimingFunction: 'var(--ease-inout)' }}
        >
          {chain.map((link, i) => {
            const isCurrent = i === currentChipIndex;
            return (
              <div key={link.node} className="flex shrink-0 items-center">
                {i > 0 && <RailConnector signal={isCurrent ? modeColor(link.step.mode) : null} />}
                <NodeChip step={link.step} node={link.node} current={isCurrent} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── the slide ───────────────────────────────────────────────────────── */}
      {/* pb-24 on phones: clearance for the bottom sheet's peek header. */}
      <div className="grid min-h-0 flex-1 place-items-center px-3 pb-24 pt-3 sm:px-8 sm:pb-8 sm:pt-5">
        {/* Keyed on step.id: each step slides in like the next slide of a deck. */}
        <div
          key={current.step.id}
          className="flex max-h-full w-full max-w-[600px] min-h-0"
          style={{ animation: 'vsa-slide-in var(--t-flow) var(--ease-out) both' }}
        >
          <StepCard step={current.step} />
        </div>
      </div>
    </div>
  );
}

function NodeChip({ step, node, current }: { step: Step; node: TreeId; current: boolean }) {
  const ink = modeColor(step.mode);
  const openDossier = useSimStore((s) => s.openDossier);
  const label = TREE_INSTANCE.label[node] ?? node;

  return (
    <button
      type="button"
      data-chip-current={current ? 'true' : 'false'}
      onClick={() => openDossier(step.node)}
      title={`What is ${label}?`}
      className="shrink-0 rounded-full border px-4 py-2 transition-[opacity,border-color,box-shadow,background] duration-500"
      style={{
        background: current ? modeFill(step.mode) : 'var(--bg-1)',
        borderColor: current ? ink : 'var(--line-strong)',
        boxShadow: current ? 'var(--shadow-lift)' : 'none',
        opacity: current ? 1 : 0.55,
        animation: current ? 'vsa-pop-in var(--t-flow) var(--ease-out) both' : undefined,
        transitionTimingFunction: 'var(--ease-out)',
      }}
    >
      <span
        className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[12.5px] font-semibold tracking-tight"
        style={{ color: current ? ink : 'var(--ink-3)' }}
      >
        {label}
      </span>
    </button>
  );
}

const RAIL_PATH = 'M0 12 H44';

/** A short horizontal stroke between chips; the newest one draws in and runs the dot. */
function RailConnector({ signal }: { signal: string | null }) {
  return (
    <div className="relative mx-1 shrink-0" aria-hidden="true">
      <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
        <path
          d={RAIL_PATH}
          pathLength={1}
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="1"
          style={
            signal ? { animation: 'vsa-draw 360ms var(--ease-inout) both' } : undefined
          }
        />
        <path
          d="M39 7 L46 12 L39 17"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={signal ? { animation: 'vsa-fade-in 180ms var(--ease-out) 240ms both' } : undefined}
        />
      </svg>
      {signal && (
        <span
          className="absolute left-0 top-0 h-2 w-2 rounded-full"
          style={{
            background: signal,
            boxShadow: `0 0 8px ${signal}`,
            offsetPath: `path('${RAIL_PATH}')`,
            animation: 'vsa-travel 480ms var(--ease-inout) 80ms both',
          }}
        />
      )}
    </div>
  );
}
