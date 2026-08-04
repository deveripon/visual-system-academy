'use client';

import { memo } from 'react';
import type { NodeId } from '@/data/types';
import { EDGES, NODES, WORLD, ZONES } from '@/scene/layout';
import { MODE_VAR } from '@/scene/modeColors';
import { registry } from '@/engine/registry';
import { useSimStore } from '@/state/store';

/**
 * Rendered exactly once (no props, memoized). Every per-step visual is applied by GSAP
 * through `registry`, driven by the `data-state` / `data-mode` attributes styled below.
 * Nothing here may depend on step state — that is the rule that keeps 60fps with 87
 * nodes (docs/ARCHITECTURE.md §2).
 */
export const SceneCanvas = memo(function SceneCanvas() {
  return (
    <svg
      ref={(el) => registry.setRoot(el)}
      viewBox={`0 0 ${WORLD.w} ${WORLD.h}`}
      className="vsa-scene h-full w-full"
      role="img"
      aria-label="Architecture map of the request journey. The explanation panel carries the accessible narration."
      data-mode="user"
    >
      <SceneStyles />
      <SceneDefs />

      <g data-world style={{ willChange: 'transform' }}>
        <rect x={0} y={0} width={WORLD.w} height={WORLD.h} fill="url(#vsa-grid)" />

        <g data-layer="zones">
          {ZONES.map((z) => (
            <g
              key={z.id}
              ref={(el) => registry.setZone(z.id, el)}
              data-zone-id={z.id}
              data-active="false"
              className="vsa-zone"
              style={{ ['--zone-color' as string]: `var(${MODE_VAR[z.mode]})` }}
            >
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} className="vsa-zone-frame" />
              <text x={z.x + 20} y={z.y + 27} className="vsa-zone-label">
                {z.label}
              </text>
              <text x={z.x + 20} y={z.y + 44} className="vsa-zone-sub">
                {z.sub}
              </text>
            </g>
          ))}
        </g>

        <g data-layer="edges" fill="none">
          {EDGES.map((e) => (
            <path
              key={e.id}
              ref={(el) => registry.setEdge(e.id, el)}
              d={e.d}
              data-edge-id={e.id}
              data-state="future"
              data-kind={e.kind}
              className="vsa-edge"
            />
          ))}
        </g>

        <g data-layer="nodes">
          {NODES.map((n) => (
            <NodeGlyph key={n.id} id={n.id} x={n.x} y={n.y} w={n.w} h={n.h} label={n.label} sub={n.sub} />
          ))}
        </g>

        <PacketDot />
      </g>
    </svg>
  );
});

function NodeGlyph({
  id,
  x,
  y,
  w,
  h,
  label,
  sub,
}: {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
}) {
  return (
    <g
      ref={(el) => registry.setNode(id, el)}
      data-node-id={id}
      data-state="future"
      className="vsa-node"
      style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px` }}
      onClick={() => useSimStore.getState().openDossier(id)}
      role="button"
      tabIndex={0}
      aria-label={`${label} — open component dossier`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          useSimStore.getState().openDossier(id);
        }
      }}
    >
      <rect x={x} y={y} width={w} height={h} rx={11} className="vsa-node-frame" />
      <rect x={x} y={y} width={3} height={h} rx={1.5} className="vsa-node-tab" />
      <text x={x + 16} y={sub ? y + 27 : y + 37} className="vsa-node-label">
        {label}
      </text>
      {sub ? (
        <text x={x + 16} y={y + 45} className="vsa-node-sub">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

/** The travelling packet. Position/label/colour are all driven imperatively. */
function PacketDot() {
  return (
    <g
      ref={(el) => registry.setPacket(el)}
      className="vsa-packet"
      data-mode="user"
      opacity={0}
    >
      <circle r={26} className="vsa-packet-halo" />
      <circle r={9} className="vsa-packet-core" />
      <g transform="translate(0 -34)">
        <rect x={-74} y={-13} width={148} height={24} rx={7} className="vsa-packet-chip" />
        <text data-packet-label className="vsa-packet-text" y={3} />
      </g>
    </g>
  );
}

function SceneDefs() {
  return (
    <defs>
      <pattern id="vsa-grid" width={48} height={48} patternUnits="userSpaceOnUse">
        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--border)" strokeOpacity={0.28} strokeWidth={1} />
      </pattern>
      {/* The only blur filter in the scene: packet + the single active node. */}
      <filter id="vsa-glow" x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation={7} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/**
 * Scene styling lives here as a single <style> so the attribute-driven states are
 * colocated with the markup they describe — and so no per-node React class churn is
 * needed when GSAP flips a state.
 */
function SceneStyles() {
  return (
    <style>{`
.vsa-scene { font-family: var(--font-mono); }

.vsa-zone-frame {
  fill: color-mix(in oklab, var(--zone-color) 4%, transparent);
  stroke: color-mix(in oklab, var(--zone-color) 22%, transparent);
  stroke-width: 1.5;
  transition: fill 400ms ease, stroke 400ms ease;
}
.vsa-zone[data-active='true'] .vsa-zone-frame {
  fill: color-mix(in oklab, var(--zone-color) 9%, transparent);
  stroke: color-mix(in oklab, var(--zone-color) 55%, transparent);
}
.vsa-zone-label {
  fill: color-mix(in oklab, var(--zone-color) 72%, var(--text-2));
  font-size: 15px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
}
.vsa-zone-sub { fill: var(--text-3); font-size: 11.5px; letter-spacing: 0.02em; }

/* Untravelled edges are barely there on purpose: 158 connectors at full strength read as
   spaghetti and bury the one path that matters. They exist to show the graph is dense,
   not to be individually traced. */
.vsa-edge {
  stroke: var(--text-3);
  stroke-opacity: 0.11;
  stroke-width: 1.1;
  transition: stroke 320ms ease, stroke-opacity 320ms ease, stroke-width 320ms ease;
}
.vsa-edge[data-kind='aux'] { stroke-dasharray: 3 7; stroke-opacity: 0.07; }
.vsa-edge[data-state='done'] { stroke: var(--ok); stroke-opacity: 0.42; stroke-width: 1.5; }
.vsa-edge[data-state='active'] {
  stroke: var(--current-mode, var(--mode-user));
  stroke-opacity: 1; stroke-width: 3;
  stroke-dasharray: 10 8;
  animation: vsa-dash 700ms linear infinite;
}
@keyframes vsa-dash { to { stroke-dashoffset: -18; } }

.vsa-node { cursor: pointer; }
.vsa-node-frame {
  fill: color-mix(in oklab, var(--bg-1) 88%, transparent);
  stroke: var(--border);
  stroke-width: 1.25;
  transition: fill 300ms ease, stroke 300ms ease;
}
.vsa-node-tab { fill: var(--text-3); transition: fill 300ms ease; }
.vsa-node-label { fill: var(--text-2); font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
.vsa-node-sub { fill: var(--text-3); font-size: 10.5px; }

.vsa-node[data-state='future'] { opacity: 0.4; }
.vsa-node[data-state='visited'] { opacity: 0.78; }
.vsa-node[data-state='visited'] .vsa-node-frame {
  stroke: color-mix(in oklab, var(--ok) 40%, transparent);
}
.vsa-node[data-state='visited'] .vsa-node-tab { fill: var(--ok); }
.vsa-node[data-state='visited'] .vsa-node-label { fill: var(--text-1); }

.vsa-node[data-state='active'] { opacity: 1; filter: url(#vsa-glow); }
.vsa-node[data-state='active'] .vsa-node-frame {
  fill: color-mix(in oklab, var(--node-color, var(--mode-user)) 14%, var(--bg-1));
  stroke: var(--node-color, var(--mode-user));
  stroke-width: 2;
}
.vsa-node[data-state='active'] .vsa-node-tab { fill: var(--node-color, var(--mode-user)); }
.vsa-node[data-state='active'] .vsa-node-label { fill: var(--text-1); }
.vsa-node[data-state='active'] .vsa-node-sub { fill: var(--text-2); }

.vsa-node[data-mode='user']   { --node-color: var(--mode-user); }
.vsa-node[data-mode='kernel'] { --node-color: var(--mode-kernel); }
.vsa-node[data-mode='hw']     { --node-color: var(--mode-hw); }
.vsa-node[data-mode='net']    { --node-color: var(--mode-net); }
.vsa-node[data-mode='remote'] { --node-color: var(--mode-remote); }

.vsa-node:focus-visible { outline: none; }
.vsa-node:focus-visible .vsa-node-frame { stroke: var(--mode-user); stroke-width: 2.5; }

.vsa-packet { pointer-events: none; filter: url(#vsa-glow); }
.vsa-packet-halo { fill: var(--packet-color, var(--mode-user)); opacity: 0.16; }
.vsa-packet-core { fill: var(--packet-color, var(--mode-user)); }
.vsa-packet-chip {
  fill: color-mix(in oklab, var(--bg-0) 82%, transparent);
  stroke: var(--packet-color, var(--mode-user));
  stroke-width: 1.25;
}
.vsa-packet-text {
  fill: var(--packet-color, var(--mode-user));
  font-size: 11px; font-weight: 600; text-anchor: middle; letter-spacing: 0.02em;
}

@media (prefers-reduced-motion: reduce) {
  .vsa-edge[data-state='active'] { animation: none; }
}
`}</style>
  );
}
