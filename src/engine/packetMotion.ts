'use client';

import gsap from 'gsap';
import type { NodeId, StepMode } from '@/data/types';
import { NODE_BY_ID } from '@/scene/layout';
import { modeColor } from '@/scene/modeColors';
import { registry } from './registry';

/** Path lengths never change (the scene is static), so measure each edge once. */
const lengthCache = new WeakMap<SVGPathElement, number>();

function totalLength(path: SVGPathElement): number {
  let len = lengthCache.get(path);
  if (len === undefined) {
    len = path.getTotalLength();
    lengthCache.set(path, len);
  }
  return len;
}

function nodeCenter(id: NodeId): { x: number; y: number } | null {
  const n = NODE_BY_ID[id];
  if (!n) return null;
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function placePacket(el: SVGGElement, x: number, y: number) {
  el.setAttribute('transform', `translate(${x} ${y})`);
}

/** Instantly park the packet on a node (used by jumps and reduced motion). */
export function setPacketAt(nodeId: NodeId, label: string, mode: StepMode, visible: boolean) {
  const el = registry.packet();
  if (!el) return;
  const c = nodeCenter(nodeId);
  if (c) placePacket(el, c.x, c.y);
  el.setAttribute('data-mode', mode);
  el.style.setProperty('--packet-color', modeColor(mode));
  const text = el.querySelector('[data-packet-label]');
  if (text) text.textContent = label;
  gsap.set(el, { opacity: visible ? 1 : 0, scale: visible ? 1 : 0.6 });
}

export interface FlyOptions {
  from: NodeId;
  to: NodeId;
  label: string;
  mode: StepMode;
  duration: number;
}

/**
 * Animate the packet from one node to another along the real edge geometry, hop by hop.
 * Falls back to a straight interpolation when the two nodes are not connected — a lesson
 * step should never fail to animate just because an aux edge is missing.
 */
export function flyPacket(tl: gsap.core.Timeline, o: FlyOptions): void {
  const el = registry.packet();
  if (!el) return;

  const from = nodeCenter(o.from);
  const to = nodeCenter(o.to);
  if (!from || !to) return;

  const label = el.querySelector('[data-packet-label]');

  tl.call(
    () => {
      if (label) label.textContent = o.label;
      el.setAttribute('data-mode', o.mode);
      el.style.setProperty('--packet-color', modeColor(o.mode));
    },
    undefined,
    '<',
  );

  tl.fromTo(
    el,
    { opacity: 0, scale: 0.5 },
    { opacity: 1, scale: 1, duration: 0.18, ease: 'back.out(2)' },
    '<',
  );

  const hops = registry.route(o.from, o.to);

  if (!hops.length) {
    // No routed path: interpolate directly so the step still reads as movement.
    const proxy = { t: 0 };
    tl.to(
      proxy,
      {
        t: 1,
        duration: o.duration,
        ease: 'sine.inOut',
        onUpdate() {
          placePacket(el, from.x + (to.x - from.x) * proxy.t, from.y + (to.y - from.y) * proxy.t);
        },
      },
      '<',
    );
    return;
  }

  const per = o.duration / hops.length;
  let cursor: NodeId = o.from;

  for (const edgeId of hops) {
    const path = registry.edge(edgeId);
    const [a, b] = edgeId.split('__') as [NodeId, NodeId];
    // Edges are stored source__target; traverse backwards when we entered from the target.
    const forward = a === cursor;
    const nextNode: NodeId = forward ? b : a;

    if (path) {
      const len = totalLength(path);
      const proxy = { t: 0 };
      tl.to(proxy, {
        t: 1,
        duration: per,
        ease: hops.length === 1 ? 'sine.inOut' : 'none',
        onUpdate() {
          const at = forward ? proxy.t : 1 - proxy.t;
          const p = path.getPointAtLength(at * len);
          placePacket(el, p.x, p.y);
        },
      });
    } else {
      const start = nodeCenter(cursor);
      const end = nodeCenter(nextNode);
      if (start && end) {
        const proxy = { t: 0 };
        tl.to(proxy, {
          t: 1,
          duration: per,
          ease: 'none',
          onUpdate() {
            placePacket(el, start.x + (end.x - start.x) * proxy.t, start.y + (end.y - start.y) * proxy.t);
          },
        });
      }
    }

    cursor = nextNode;
  }
}
