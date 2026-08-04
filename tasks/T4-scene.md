# T4 — Scene: layout data + SVG canvas

**Goal:** the architecture canvas everything else animates on. 12 zones, 87 nodes, the
journey edges, rendered once as SVG, pan/zoomable, with every element registered so the
animation engine can reach it.

## OWNS (only these paths)

- `src/scene/layout.ts`, `src/scene/geometry.ts`, `src/scene/modeColors.ts`,
  `src/scene/layerViews.ts`
- `src/components/canvas/SceneCanvas.tsx`, `CanvasViewport.tsx`, `ZoneGroup.tsx`,
  `NodeGlyph.tsx`, `EdgePath.tsx`, `PacketDot.tsx`, `CanvasDefs.tsx`, `icons.tsx`
- `src/engine/registry.ts`

*(`src/components/canvas/AnimationDirector.tsx` belongs to T5 — do not create it.)*

## MUST READ

`docs/AGENT_PROTOCOL.md` → `docs/CONTRACTS.md` C1, C2, C3, C6, C7 → `docs/DESIGN_SYSTEM.md`
→ `src/data/types.ts`.

## Spec

**Layout.** One world coordinate space (suggested `WORLD = { w: 5200, h: 2600 }`).
12 zones laid out to read as a journey, left→right, wrapping so the return path is
visually adjacent to the outbound one:

```text
row 1 (client)   z-browser → z-node → z-kernel → z-hw
row 2 (transit)  z-lan → z-isp → z-inet → z-dns  (dns sits above/aside — it is a detour)
row 3 (server)   z-cf → z-origin → z-app → z-db
```

Zones are glass frames with a mono label and a mode tint (`modeColors.ts`). Nodes are
rounded rects ~150×62 with an icon, a mono label, and an optional `sub` line. Space them
so labels never collide; do not overlap zones.

**Edges.** `kind: 'flow'` for the main journey (drawn prominently), `'aux'` for side
relationships (DNS detour, ARP, IRQ line NIC→CPU). Generate orthogonal paths in
`geometry.ts` — deterministic, computed at module load, no DOM. Every consecutive pair of
nodes in the lesson journey must be connected, and `registry.route()` must find a path
between any two nodes the steps use (BFS). Include the return-path edges.

**Rendering.** `SceneCanvas` is a **no-props `React.memo`** — it must be structurally
impossible for it to re-render. Ref callbacks register every node/edge/zone into
`registry`. Node visual state is driven by `data-state` attributes / CSS classes that GSAP
toggles — never React state.

**Defs.** Exactly ONE `feGaussianBlur` glow filter (used by the packet and the single
active node). Everything else uses pre-blurred radial gradients. Grid pattern + noise for
canvas atmosphere.

**Viewport.** `CanvasViewport` owns the panzoom instance
(`panzoom(worldGroup, { maxZoom: 4, minZoom: 0.15, smoothScroll: false, bounds: true, boundsPadding: 0.15 })`)
and exposes it via a ref/context so T5's camera engine can drive it. Expose
`programmatic` guard support (a settable flag) per contract C5/ARCHITECTURE §3.
Zoom in / out / fit buttons live here.

## ACCEPTANCE

- `NODES.length === 87` and every `NodeId` appears exactly once (assert in a dev check).
- `ZONES.length === 12`; every node's `zone` matches the zone it is geometrically inside.
- No two nodes overlap; no node escapes its zone rect.
- `registry.route()` returns a non-empty path for every consecutive node pair used by the
  lesson steps (test with `content/src/data-steps-*.js` node sequences if available).
- Scrolling zooms toward the cursor; dragging pans; the fit button frames the whole world.
- `SceneCanvas` renders exactly once on mount (verify with a render counter in dev).
- Looks like `docs/DESIGN_SYSTEM.md`: glass zone frames, mono labels, mode tints,
  blueprint grid, no emoji.

## VERIFY

```bash
pnpm typecheck && pnpm lint
node --input-type=module -e "
  const m = await import('./src/scene/layout.ts');  // or run via a temp vitest/tsx script
  console.log('nodes', m.NODES.length, 'zones', m.ZONES.length, 'edges', m.EDGES.length);
"
```

Plus: run `pnpm dev`, open the app, screenshot the canvas, confirm pan/zoom by hand.
