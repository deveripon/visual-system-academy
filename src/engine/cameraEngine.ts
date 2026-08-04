'use client';

import gsap from 'gsap';
import type { PanZoom } from 'panzoom';
import type { NodeId, ZoneId } from '@/data/types';
import { NODE_BY_ID, WORLD, ZONES } from '@/scene/layout';
import { LAYER_VIEWS, type LayerView } from '@/scene/layerViews';
import { prefersReducedMotion } from './reducedMotion';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Camera {
  focusNode(id: NodeId, opts?: { scale?: number; duration?: number }): void;
  focusZone(id: ZoneId): void;
  focusRect(rect: Rect, opts?: { duration?: number; maxScale?: number }): void;
  applyLayerView(view: LayerView): void;
  fitAll(): void;
  cancel(): void;
  destroy(): void;
}

/**
 * panzoom is the ONLY writer of the world transform. Programmatic moves tween a proxy and
 * push each frame through panzoom under a guard flag, so a user gesture is always
 * distinguishable from our own updates and can cancel an in-flight camera move.
 * See docs/ARCHITECTURE.md §3.
 */
export function createCamera(pz: PanZoom, viewportEl: HTMLElement): Camera {
  let tween: gsap.core.Tween | null = null;
  let programmatic = false;
  let disposed = false;

  const cancel = () => {
    tween?.kill();
    tween = null;
  };

  // Any user-initiated pan/zoom cancels a running camera move.
  const onUserInput = () => {
    if (!programmatic) cancel();
  };
  pz.on('panstart', onUserInput);
  pz.on('zoom', onUserInput);

  function apply(x: number, y: number, scale: number) {
    programmatic = true;
    try {
      pz.zoomAbs(0, 0, scale);
      pz.moveTo(x, y);
    } finally {
      programmatic = false;
    }
  }

  /** Compute the transform that centres `rect` in the viewport at a comfortable scale. */
  function transformFor(rect: Rect, maxScale: number) {
    const vw = viewportEl.clientWidth || 1;
    const vh = viewportEl.clientHeight || 1;
    const pad = 1.25; // breathing room around the target
    const scale = Math.min(maxScale, Math.min(vw / (rect.w * pad), vh / (rect.h * pad)));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return { x: vw / 2 - cx * scale, y: vh / 2 - cy * scale, scale };
  }

  function moveTo(rect: Rect, duration: number, maxScale: number) {
    if (disposed) return;
    cancel();
    const target = transformFor(rect, maxScale);
    const t = pz.getTransform();
    const from = { x: t.x, y: t.y, scale: t.scale };

    if (prefersReducedMotion() || duration <= 0) {
      apply(target.x, target.y, target.scale);
      return;
    }

    tween = gsap.to(from, {
      ...target,
      duration,
      ease: 'power2.inOut',
      onUpdate() {
        apply(from.x, from.y, from.scale);
      },
    });
  }

  function unionOfZones(zoneIds: ZoneId[]): Rect {
    const rects = ZONES.filter((z) => zoneIds.includes(z.id));
    if (!rects.length) return { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
    const x1 = Math.min(...rects.map((r) => r.x));
    const y1 = Math.min(...rects.map((r) => r.y));
    const x2 = Math.max(...rects.map((r) => r.x + r.w));
    const y2 = Math.max(...rects.map((r) => r.y + r.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  return {
    focusNode(id, opts) {
      const n = NODE_BY_ID[id];
      if (!n) return;
      // Frame a generous neighbourhood, not just the node — context is the point.
      const padX = n.w * 3.2;
      const padY = n.h * 3.4;
      moveTo(
        { x: n.x - padX / 2, y: n.y - padY / 2, w: n.w + padX, h: n.h + padY },
        opts?.duration ?? 0.7,
        opts?.scale ?? 1.5,
      );
    },
    focusZone(id) {
      moveTo(unionOfZones([id]), 0.7, 1.2);
    },
    focusRect(rect, opts) {
      moveTo(rect, opts?.duration ?? 0.7, opts?.maxScale ?? 1.5);
    },
    applyLayerView(view) {
      const def = LAYER_VIEWS[view];
      if (!def) return;
      moveTo(unionOfZones(def.zones), 0.8, 1.1);
    },
    fitAll() {
      moveTo({ x: 0, y: 0, w: WORLD.w, h: WORLD.h }, 0.7, 1);
    },
    cancel,
    destroy() {
      disposed = true;
      cancel();
      pz.off('panstart', onUserInput);
      pz.off('zoom', onUserInput);
    },
  };
}
