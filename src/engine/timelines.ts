'use client';

import gsap from 'gsap';
import type { NodeId, OsState, Step } from '@/data/types';
import { NODE_BY_ID } from '@/scene/layout';
import { MODE_VAR } from '@/scene/modeColors';
import type { Camera } from './cameraEngine';
import { applyEffects } from './effectsEngine';
import { flyPacket, setPacketAt } from './packetMotion';
import { registry } from './registry';
import { prefersReducedMotion } from './reducedMotion';

export interface SceneCtx {
  camera: Camera | null;
}

type NodeState = 'future' | 'visited' | 'active';

function setNodeState(el: SVGGElement, state: NodeState, mode?: string) {
  el.setAttribute('data-state', state);
  if (mode) el.setAttribute('data-mode', mode);
}

function setEdgeState(el: SVGPathElement, state: 'future' | 'done' | 'active') {
  el.setAttribute('data-state', state);
}

/**
 * Which nodes have been visited by step `index`, and on which edges the packet has
 * travelled. Derived from the timeline itself so it is identical after a jump or a walk.
 */
function traversal(timeline: Step[], index: number) {
  const visited = new Set<NodeId>();
  const edges = new Set<string>();
  let prev: NodeId | null = null;

  for (let i = 0; i <= index && i < timeline.length; i++) {
    const step = timeline[i];
    const from: NodeId | null = step.from ?? prev;
    if (from && from !== step.node) {
      for (const e of registry.route(from, step.node)) edges.add(e);
    }
    visited.add(step.node);
    prev = step.node;
  }
  return { visited, edges };
}

/** Paint the whole scene to the exact end-state of `index`. Used for every jump. */
export function applyStepStatics(
  timeline: Step[],
  index: number,
  os: OsState,
  ctx: SceneCtx,
): void {
  const step = timeline[index];
  if (!step) return;

  const { visited, edges } = traversal(timeline, index);

  for (const [id, el] of registry.allNodes()) {
    if (id === step.node) setNodeState(el, 'active', step.mode);
    else if (visited.has(id)) setNodeState(el, 'visited');
    else setNodeState(el, 'future');
    gsap.set(el, { clearProps: 'x,y,scale,filter' });
  }

  for (const [id, el] of registry.allEdges()) {
    setEdgeState(el, edges.has(id) ? 'done' : 'future');
  }

  for (const [, el] of registry.allZones()) {
    el.setAttribute('data-active', 'false');
  }
  const zone = NODE_BY_ID[step.node]?.zone;
  if (zone) registry.zone(zone)?.setAttribute('data-active', 'true');

  setPacketAt(step.node, step.packet?.label ?? '', step.mode, Boolean(step.packet));

  // Mode aura on the canvas root so CSS can tint everything consistently.
  const root = registry.packet()?.ownerSVGElement;
  root?.setAttribute('data-mode', step.mode);
  root?.style.setProperty('--current-mode', `var(${MODE_VAR[step.mode]})`);

  ctx.camera?.focusNode(step.node, { duration: prefersReducedMotion() ? 0 : 0.5 });
  void os;
}

/**
 * Build the animated transition into `index`. Exactly one of these is alive at a time;
 * the director kills the previous one before building the next.
 */
export function buildStepTimeline(
  timeline: Step[],
  index: number,
  prevIndex: number,
  os: OsState,
  ctx: SceneCtx,
  onComplete: () => void,
): gsap.core.Timeline {
  const step = timeline[index];
  const tl = gsap.timeline({ onComplete });

  if (!step) return tl;

  const reduced = prefersReducedMotion();
  const prevStep = prevIndex >= 0 ? timeline[prevIndex] : null;
  const from: NodeId | null = step.from ?? prevStep?.node ?? null;

  // Everything not on the path recedes; the current node takes the spotlight.
  const { visited, edges } = traversal(timeline, index);

  tl.call(() => {
    for (const [id, el] of registry.allNodes()) {
      if (id === step.node) continue;
      setNodeState(el, visited.has(id) ? 'visited' : 'future');
    }
    for (const [id, el] of registry.allEdges()) {
      setEdgeState(el, edges.has(id) ? 'done' : 'future');
    }
    for (const [, el] of registry.allZones()) el.setAttribute('data-active', 'false');
    const zone = NODE_BY_ID[step.node]?.zone;
    if (zone) registry.zone(zone)?.setAttribute('data-active', 'true');

    const root = registry.packet()?.ownerSVGElement;
    root?.setAttribute('data-mode', step.mode);
    root?.style.setProperty('--current-mode', `var(${MODE_VAR[step.mode]})`);
  });

  // Light the active edges while the packet is in flight.
  if (from && from !== step.node) {
    const route = registry.route(from, step.node);
    tl.call(() => {
      for (const id of route) {
        const el = registry.edge(id);
        if (el) setEdgeState(el, 'active');
      }
    });
  }

  ctx.camera?.focusNode(step.node, { duration: reduced ? 0 : 0.7 });

  if (reduced) {
    tl.call(() => {
      const el = registry.node(step.node);
      if (el) setNodeState(el, 'active', step.mode);
      setPacketAt(step.node, step.packet?.label ?? '', step.mode, Boolean(step.packet));
    });
    tl.to({}, { duration: 0.15 });
    return tl;
  }

  if (from && from !== step.node) {
    flyPacket(tl, {
      from,
      to: step.node,
      label: step.packet?.label ?? step.title,
      mode: step.mode,
      duration: 0.9,
    });
  } else {
    tl.call(() => setPacketAt(step.node, step.packet?.label ?? '', step.mode, Boolean(step.packet)));
  }

  // Arrival: the node lights up and pulses once.
  tl.call(() => {
    const el = registry.node(step.node);
    if (el) setNodeState(el, 'active', step.mode);
    const route = from && from !== step.node ? registry.route(from, step.node) : [];
    for (const id of route) {
      const el2 = registry.edge(id);
      if (el2) setEdgeState(el2, 'done');
    }
  });

  const activeEl = registry.node(step.node);
  if (activeEl) {
    tl.fromTo(
      activeEl,
      { scale: 1 },
      { scale: 1.05, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, transformOrigin: 'center' },
    );
  }

  applyEffects(tl, step.effects, {
    mode: step.mode,
    nodeId: step.node,
    onZoomOut: () => ctx.camera?.fitAll(),
  });

  // A short beat so autoplay does not feel like a slideshow on rapid steps.
  tl.to({}, { duration: 0.25 });

  void os;
  return tl;
}
