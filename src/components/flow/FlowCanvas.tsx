'use client';

import { useEffect, useRef } from 'react';
import { TREE_INSTANCE, useActiveTimeline } from '@/state/selectors';
import { useSimStore } from '@/state/store';
import { modeColor, modeFill } from '@/scene/modeColors';
import { mergeProd } from '@/engine/scenarioEngine';
import type { TreeId } from '@/engine/simulation-engine';
import { StepCard } from './StepCard';

/**
 * The journey as a storyboard: every step the learner has reached is a node chip with its
 * explanation hanging beneath it, chained left to right. Steps not yet reached are not
 * drawn at all — that is the progressive disclosure.
 *
 * Nodes alternate height so the connectors read as a path rather than a straight rule,
 * which is what the sketch was getting at.
 */
export function FlowCanvas() {
  const timeline = useActiveTimeline();
  const index = useSimStore((s) => s.stepIndex);
  const prodMode = useSimStore((s) => s.prodMode);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Keep the current station in view as the story advances.
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  const revealed = timeline.slice(0, index + 1);

  return (
    <div ref={scrollerRef} className="h-full overflow-x-auto overflow-y-auto">
      <div className="flex min-h-full items-start gap-0 px-10 py-8">
        {revealed.map((raw, i) => {
          const step = prodMode ? mergeProd(raw) : raw;
          const current = i === index;
          // A node gets ONE chip even when several steps happen inside it — otherwise a
          // four-beat chapter draws "Your Code" four times in a row.
          const startsNode = i === 0 || revealed[i - 1].node !== raw.node;
          // Alternate the vertical offset per NODE so the chain reads as a path.
          const nodeOrdinal = revealed
            .slice(0, i + 1)
            .filter((s, j, a) => j === 0 || a[j - 1].node !== s.node).length - 1;
          const lift = nodeOrdinal % 2 === 0 ? 0 : 64;

          return (
            // `shrink-0` is load-bearing: without it flexbox crushes every station to a
            // sliver once the strip is long, and the cards overlap on top of each other.
            <div key={step.id} className="flex shrink-0 items-start">
              {startsNode && i > 0 && <Connector down={nodeOrdinal % 2 === 1} />}
              <div
                data-current={current ? 'true' : 'false'}
                className="flex shrink-0 flex-col items-start"
                style={{ paddingTop: lift }}
              >
                {startsNode ? (
                  <NodeChip step={step} current={current} />
                ) : (
                  // A continuation beat of the same node — no new chip, just a tick of
                  // rule so the eye reads it as "still inside this component".
                  <span className="h-[38px] w-full border-t border-dashed border-line" />
                )}
                <div className={startsNode ? 'mt-3' : 'mt-3 ml-3'}>
                  <StepCard step={step} current={current} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeChip({ step, current }: { step: ReturnType<typeof mergeProd>; current: boolean }) {
  const ink = modeColor(step.mode);
  const openDossier = useSimStore((s) => s.openDossier);
  const label = TREE_INSTANCE.label[step.node as TreeId] ?? step.node;

  return (
    <button
      type="button"
      onClick={() => openDossier(step.node)}
      title={`What is ${label}?`}
      className="rounded-[var(--r-md)] border px-4 py-2.5 text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-px"
      style={{
        background: modeFill(step.mode),
        borderColor: current ? ink : 'transparent',
        boxShadow: current ? 'var(--shadow-lift)' : 'var(--shadow-card)',
        opacity: current ? 1 : 0.78,
      }}
    >
      <span
        className="font-[family-name:var(--font-mono)] text-[13px] font-semibold tracking-tight"
        style={{ color: ink }}
      >
        {label}
      </span>
    </button>
  );
}

/** The elbow between two stations — flat then a step down, like the sketch. */
function Connector({ down }: { down: boolean }) {
  return (
    <svg
      width="72"
      height="140"
      viewBox="0 0 72 140"
      fill="none"
      aria-hidden="true"
      className="mt-[22px] shrink-0"
    >
      <path
        d={down ? 'M0 0 H40 V64 H64' : 'M0 64 H40 V0 H64'}
        stroke="var(--line-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={down ? 'M58 58 L66 64 L58 70' : 'M58 -6 L66 0 L58 6'}
        stroke="var(--line-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
