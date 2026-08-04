'use client';

import gsap from 'gsap';
import type { EffectId, StepMode } from '@/data/types';
import { MODE_VAR } from '@/scene/modeColors';
import { registry } from './registry';
import { prefersReducedMotion } from './reducedMotion';

/**
 * Effects are decorations on top of a step transition. Anything persistent they imply
 * (ring/pool/queue counters) lives in the folded OS state, never here — so replaying or
 * jumping can never make the widgets drift. See docs/ARCHITECTURE.md §1.
 */

function flashNode(tl: gsap.core.Timeline, nodeId: string | null, color: string) {
  if (!nodeId) return;
  const el = registry.node(nodeId as never);
  if (!el) return;
  tl.fromTo(
    el,
    { filter: 'brightness(1)' },
    { filter: 'brightness(2.2)', duration: 0.12, ease: 'expo.out', yoyo: true, repeat: 1 },
    '<',
  );
  tl.set(el, { filter: 'brightness(1)' });
}

/** The interrupt line NIC → CPU: a hard, fast strike. This is a hardware event. */
function irqStrike(tl: gsap.core.Timeline) {
  const line = registry.edge('nic__cpu') ?? registry.edge('cpu__nic') ?? registry.edge('nic__irq');
  const irqNode = registry.node('irq');

  if (line) {
    tl.fromTo(
      line,
      { opacity: 0.15, strokeWidth: 2 },
      {
        opacity: 1,
        strokeWidth: 5,
        duration: 0.14,
        ease: 'expo.out',
        yoyo: true,
        repeat: 3,
      },
      '<',
    );
  }
  if (irqNode) {
    tl.fromTo(
      irqNode,
      { scale: 1 },
      { scale: 1.14, duration: 0.1, ease: 'expo.out', yoyo: true, repeat: 3, transformOrigin: 'center' },
      '<',
    );
  }
}

/** A context switch: the scheduler swaps who owns the CPU. */
function contextSwitch(tl: gsap.core.Timeline) {
  const sched = registry.node('scheduler');
  const cpu = registry.node('cpu');
  for (const el of [sched, cpu]) {
    if (!el) continue;
    tl.fromTo(
      el,
      { x: 0 },
      { x: 6, duration: 0.09, ease: 'power2.inOut', yoyo: true, repeat: 3 },
      '<',
    );
    tl.set(el, { x: 0 });
  }
}

export function applyEffects(
  tl: gsap.core.Timeline,
  effects: EffectId[] | undefined,
  ctx: { mode: StepMode; nodeId: string; onZoomOut?: () => void },
): void {
  if (!effects?.length) return;
  const reduced = prefersReducedMotion();
  const color = `var(${MODE_VAR[ctx.mode]})`;

  for (const effect of effects) {
    switch (effect) {
      case 'irq':
        if (!reduced) irqStrike(tl);
        break;
      case 'ctx':
        if (!reduced) contextSwitch(tl);
        break;
      case 'flash':
        if (!reduced) flashNode(tl, ctx.nodeId, color);
        break;
      case 'zoomout':
        tl.call(() => ctx.onZoomOut?.(), undefined, '<');
        break;
      // Counter effects (ring/pool/queue) are rendered from the folded state by the
      // OS-state panel; nothing to animate on the canvas.
      default:
        break;
    }
  }
}
