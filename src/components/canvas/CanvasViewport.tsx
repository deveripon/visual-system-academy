'use client';

import { useEffect, useRef } from 'react';
import createPanZoom from 'panzoom';
import { createCamera, type Camera } from '@/engine/cameraEngine';
import { SceneCanvas } from './SceneCanvas';

interface Props {
  cameraRef: React.RefObject<Camera | null>;
}

/**
 * Owns the panzoom instance — the single writer of the world transform — and hands it to
 * the camera engine. `bounds` is deliberately off: it clamps `moveTo` and would refuse to
 * centre nodes near the edges of the world, which the lesson does constantly.
 */
export function CanvasViewport({ cameraRef }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const world = host?.querySelector<SVGGElement>('[data-world]');
    if (!host || !world) return;

    const pz = createPanZoom(world, {
      maxZoom: 4,
      minZoom: 0.12,
      smoothScroll: false, // GSAP owns easing; panzoom smoothing would double-animate
      zoomDoubleClickSpeed: 1, // double-click belongs to the nodes, not the camera
    });

    const camera = createCamera(pz, host);
    cameraRef.current = camera;
    camera.fitAll();

    const onResize = () => camera.fitAll();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      camera.destroy();
      cameraRef.current = null;
      pz.dispose();
    };
  }, [cameraRef]);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      <SceneCanvas />

      <div className="glass absolute bottom-4 left-4 flex flex-col overflow-hidden p-0">
        <ZoomButton label="Zoom in" onClick={() => zoomBy(cameraRef, 1.35)}>
          +
        </ZoomButton>
        <ZoomButton label="Fit to view (f)" onClick={() => cameraRef.current?.fitAll()}>
          ⤢
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => zoomBy(cameraRef, 1 / 1.35)}>
          −
        </ZoomButton>
      </div>

      <p className="glass pointer-events-none absolute bottom-4 right-4 px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-wider text-[var(--text-3)]">
        drag to pan · scroll to zoom · click a node for its dossier
      </p>
    </div>
  );
}

/** Zoom relative to the current view, routed through the camera so tweens are cancelled. */
function zoomBy(cameraRef: React.RefObject<Camera | null>, factor: number) {
  cameraRef.current?.zoomBy(factor);
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-9 w-9 text-[15px] leading-none text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
    >
      {children}
    </button>
  );
}
