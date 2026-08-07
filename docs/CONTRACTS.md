# Frozen Contracts

These interfaces are what let independent agents build separate modules that snap
together on first integration. **Do not change anything here without the integrator.**
If your task seems to require a change, log it in `tasks/_INBOX.md` and work around it.

Status legend: 🧊 frozen · 🌡 provisional (may still move before its owning task starts).

---

## C1 🧊 Lesson data types — `src/data/types.ts`

Already written and frozen. Everything else imports from here.
Key exports: `ZoneId`, `NodeId` (87 ids), `StepMode`, `MemSpace`, `PacketLayer`,
`EffectId`, `ScenarioFlags`, `DEFAULT_FLAGS`, `StepExplain`, `StepPacket`,
`StepStatePatch`, `StepBranch`, `StepQuiz`, `CodePane`, `Step`, `ComponentDossier`,
`ComponentMap`, `ChaosId`, `ChaosScenario`, `ChaosMap`, `OsState`, `CHAPTERS`.

**The 87 `NodeId` values are the universal join key**: scene layout, step `node`/`from`,
dossier keys and search all use them. Never introduce a node id that is not in that union.

## C2 🧊 Scene registry — `src/engine/registry.ts`

The only bridge between React-rendered DOM and the GSAP engine.

```ts
export const registry: {
  setNode(id: NodeId, el: SVGGElement | null): void;
  setEdge(id: EdgeId, el: SVGPathElement | null): void;
  setZone(id: ZoneId, el: SVGGElement | null): void;
  setPacket(el: SVGGElement | null): void;
  node(id: NodeId): SVGGElement | null;
  edge(id: EdgeId): SVGPathElement | null;
  zone(id: ZoneId): SVGGElement | null;
  packet(): SVGGElement | null;
  /** BFS over EDGES; [] when no route exists (engine then teleports the packet). */
  route(from: NodeId, to: NodeId): EdgeId[];
  clear(): void;
};
export type EdgeId = `${NodeId}__${NodeId}`;   // always source__target, undirected lookups try both
```

Scene components call `set*` from ref callbacks (and with `null` on unmount).
Engine code only ever *reads*. Registry never throws in production; in dev it warns once
per missing id.

## C3 🧊 Scene layout — `src/scene/layout.ts`

```ts
export interface ZoneLayout { id: ZoneId; label: string; mode: StepMode;
                              x: number; y: number; w: number; h: number }
export interface NodeLayout { id: NodeId; zone: ZoneId; label: string; sub?: string;
                              icon: IconName; x: number; y: number; w: number; h: number }
export interface EdgeLayout { id: EdgeId; from: NodeId; to: NodeId; d: string;
                              kind: 'flow' | 'aux' }
export const WORLD: { w: number; h: number };   // SVG viewBox dimensions
export const ZONES: ZoneLayout[];               // 12
export const NODES: NodeLayout[];               // 87, exactly one per NodeId
export const EDGES: EdgeLayout[];
export const NODE_BY_ID: Record<NodeId, NodeLayout>;
```

Coordinates are in one world space; `x,y` is the node's top-left. Everything (camera fit,
packet motion, layer views) derives from this data — never from `getBBox()`.

## C4 🧊 Store API — `src/state/store.ts`

Single zustand store. Components read via selectors; engines read via
`useSimStore.getState()` and subscribe transiently.

```ts
type Status = 'idle' | 'playing' | 'paused' | 'awaiting-branch' | 'awaiting-quiz' | 'finished';

interface SimStore {
  // playback
  stepIndex: number; status: Status; speed: number; autoplay: boolean;
  next(): void; prev(): void; jumpTo(target: number | string): void;
  replayStep(): void; restart(): void; play(): void; pause(): void; togglePlay(): void;
  setSpeed(s: number): void; setAutoplay(b: boolean): void;
  // scenario
  flags: ScenarioFlags; chaosId: ChaosId | null; prodMode: boolean; timelineVersion: number;
  resolveBranch(key: keyof ScenarioFlags, value: string): void;
  setFlag(key: keyof ScenarioFlags, value: string): void;
  enterChaos(id: ChaosId): void; exitChaos(): void; toggleProdMode(): void;
  // quiz
  answers: Record<string, { choice: number; correct: boolean }>;
  answerQuiz(stepId: string, choice: number): void;
  // ui
  layerView: LayerView | 'free'; dossierNodeId: NodeId | null; searchOpen: boolean;
  chaosMenuOpen: boolean; helpOpen: boolean; expandedChapter: number | null;
  setLayerView(v: LayerView | 'free'): void; openDossier(id: NodeId | null): void;
  setSearchOpen(b: boolean): void; setChaosMenuOpen(b: boolean): void;
  setHelpOpen(b: boolean): void; setExpandedChapter(n: number | null): void;
  closeTopOverlay(): boolean;   // returns true if something was closed
}
export const useSimStore: UseBoundStore<StoreApi<SimStore>>;
```

Selectors — `src/state/selectors.ts`:

```ts
useActiveTimeline(): Step[]        // flags-filtered + chaos-spliced
useCurrentStep(): Step | null      // prod overrides already merged when prodMode
useOsState(): OsState              // deterministic fold 0..stepIndex
useStepCount(): number
useChapterProgress(): { chapter: number; done: boolean }[]
```

**Invariants** (enforced by tests): `jumpTo(n)` produces the same `OsState` as stepping to
`n`; a timeline rebuild always sets `stepIndex` and `timelineVersion` in the same `set()`.

## C5 🧊 Engine APIs

```ts
// src/engine/scenarioEngine.ts   (pure — no DOM, no store)
buildTimeline(all: Step[], chaos: ChaosMap, flags: ScenarioFlags, chaosId: ChaosId | null): Step[]
nearestStepIndex(oldTl: Step[], oldIndex: number, newTl: Step[]): number
mergeProd(step: Step): Step

// src/state/foldOsState.ts       (pure)
foldOsState(timeline: Step[], upTo: number): OsState
INITIAL_OS_STATE: OsState

// src/engine/timelines.ts        (SceneCtx = { camera: Camera | null })
buildStepTimeline(timeline: Step[], index: number, prevIndex: number,
                  os: OsState, ctx: SceneCtx, onComplete: () => void): gsap.core.Timeline
applyStepStatics(timeline: Step[], index: number, os: OsState, ctx: SceneCtx): void

// src/engine/cameraEngine.ts
createCamera(pz: PanZoom, viewportEl: HTMLElement): Camera
interface Camera { focusNode(id: NodeId, o?: {scale?: number; duration?: number}): void;
                   focusZone(id: ZoneId): void;
                   focusRect(r: {x,y,w,h}, o?: {duration?: number; maxScale?: number}): void;
                   applyLayerView(v: LayerView): void;
                   fitAll(): void; cancel(): void; destroy(): void }

// src/engine/packetMotion.ts
flyPacket(tl: gsap.core.Timeline,
          o: { from: NodeId; to: NodeId; label: string; mode: StepMode; duration: number }): void
setPacketAt(nodeId: NodeId, label: string, mode: StepMode, visible: boolean): void

// src/engine/effectsEngine.ts
applyEffects(tl: gsap.core.Timeline, effects: EffectId[] | undefined,
             ctx: { mode: StepMode; nodeId: string; onZoomOut?: () => void }): void

// src/engine/reducedMotion.ts
prefersReducedMotion(): boolean
```

Engines never import React. Reduced motion is read from `reducedMotion.ts`, never from
`matchMedia` directly.

**Scene DOM contract** — the engine drives the scene purely through these hooks, so
`SceneCanvas` must style them with CSS attribute selectors, never React state:

| element | attribute / property |
|---|---|
| node `<g>` | `data-state="future\|visited\|active"`, `data-mode="user\|kernel\|hw\|net\|remote"`; GSAP tweens `scale` with `transformOrigin: center` |
| edge `<path>` | `data-state="future\|done\|active"` |
| zone `<g>` | `data-active="true\|false"` |
| root `<svg>` | `data-mode`, plus a `--current-mode` CSS variable |
| packet `<g>` | positioned via `transform="translate(x y)"` in world units; contains an element with `data-packet-label`; reads a `--packet-color` variable |

`CanvasViewport` signature: `({ cameraRef }: { cameraRef: React.RefObject<Camera | null> })`.
It creates the panzoom instance (**without** `bounds`, which would clamp camera framing)
and assigns `cameraRef.current = createCamera(pz, viewportEl)`.

## C6 🧊 Layer views — `src/scene/layerViews.ts`

```ts
export type LayerView = 'application' | 'os' | 'kernel' | 'network' | 'hardware'
                      | 'internet' | 'production';
export const LAYER_VIEWS: Record<LayerView,
  { label: string; zones: ZoneId[]; hint: string }>;   // camera frames the union of zones
```

## C7 🧊 Design tokens — `src/styles/tokens.css`

Contract = the CSS custom property **names** (values may be tuned):
`--bg-0 --bg-1 --surface --surface-2 --border --border-strong --text-1 --text-2 --text-3`
`--mode-user --mode-kernel --mode-hw --mode-net --mode-remote --ok --warn --err`
`--font-ui --font-mono --glass-blur --glass-shadow --r-sm --r-md --r-lg --t-micro --t-ui`
Utility classes: `.glass`, `.instrument-label`.
Mode → token mapping lives in `src/scene/modeColors.ts`: `modeColor(mode) → 'var(--mode-…)'`.

## C8 🧊 Content file names — `content/src/`

| file | global | scope |
|---|---|---|
| `data-components.js` | `window.COMPONENTS` | dossiers, browser+node+kernel(part) |


| `data-steps-a.js` | `window.STEPS_A` | chapters 1–8 |
| `data-steps-b1.js` | `window.STEPS_B1` | chapters 9–12 |
| `data-steps-b2.js` | `window.STEPS_B2` | chapters 13–16 |
| `data-steps-c.js` | `window.STEPS_C` | chapters 17–18 |
| `data-steps-c2.js` | `window.STEPS_C2` | chapters 19–24 |
| `data-chaos.js` | `window.CHAOS` | 5 failure scenarios |

Merge order for dossiers: `COMPONENTS` → `COMPONENTS_B` → `COMPONENTS_C` (later wins).
Steps concatenate in chapter order: A, B1, B2, C, C2.
`scripts/convert-content.mjs` turns each into `src/data/generated/*.ts`.

## C9 🧊 npm scripts

```
pnpm dev        # convert content, then next dev
pnpm build      # convert content, then next build
pnpm typecheck  # tsc --noEmit
pnpm lint       # next lint
pnpm convert    # content → src/data/generated
pnpm validate   # run data validators standalone (node)
```

## C10 🧊 Chaos entry points

Each chaos scenario splices in after a real step id. Authored `entryAfter` values are
normalised by `scripts/convert-content.mjs` through `CHAOS_ENTRY_REMAP`, so content
agents authoring in parallel cannot break integration — the remap is the seam:

| chaos | canonical entry step |
|---|---|
| `dnsdown` | `dns-flight-to-recursive` |
| `synfail` | `syn-driver-handoff` |
| `certfail` | the chapter-13 certificate-verification step |
| `dbdown` | the chapter-19 pool-checkout step |
| `portinuse` | *(standalone — `entryAfter: ''`)* |

`pnpm validate` fails if any `entryAfter` (post-remap) does not resolve to a real step id.
