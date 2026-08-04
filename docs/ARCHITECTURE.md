# Architecture

**Stack:** Next.js 16 (App Router, static-exportable) · React 19 · TypeScript strict ·
Tailwind v4 + CSS-variable tokens · GSAP + @gsap/react · anvaka/panzoom · zustand ·
prism-react-renderer · pnpm.

The simulator is a fully client-side lesson player. `src/app/page.tsx` loads the shell via
`next/dynamic({ ssr: false })` behind a static skeleton — no hydration hazards, tiny first load.

## Folder structure

```text
src/
  app/                    # layout.tsx, page.tsx (skeleton + dynamic shell import)
  components/
    shell/                # SimulatorShell (grid, engines mount, keyboard), SimSkeleton
    controls/             # ControlBar, SpeedSelect, SearchPalette
    canvas/               # SceneCanvas (render-once SVG), CanvasViewport (panzoom),
                          # ZoneGroup, NodeGlyph, EdgePath, PacketDot, CanvasDefs,
                          # AnimationDirector (renders null; owns GSAP)
    panels/               # RightRail, ExplainPanel, CodePane, OsStatePanel,
                          # CpuRingIndicator, FdTable, TcpStateMachine, MemoryMapWidget
    timeline/             # ChapterTimeline, ChapterPill, StepList
    overlays/             # PacketInspector, BranchCard, QuizCard, ChaosMenu,
                          # DossierModal, LayerViewSwitcher, ShortcutsHelp
    ui/                   # Button, Kbd, Modal, Sheet, Tooltip, Collapse
  engine/
    registry.ts           # DOM ref maps: node/edge/zone/packet/widget elements
    stepEngine.ts         # advance/retreat/jump/replay orchestration
    scenarioEngine.ts     # buildTimeline(flags, chaos), nearestStepIndex
    timelines.ts          # buildStepTimeline(), applyStepStatics()
    effectsEngine.ts      # irq/ctx/ring±/pool±/queue±/flash/modeAura primitives
    packetMotion.ts       # multi-hop flight via cached getPointAtLength sampling
    cameraEngine.ts       # panzoom-proxy tweens; focusNode/focusZone/layer presets
    reducedMotion.ts
  scene/
    layout.ts             # ZONES (12), NODES (87: id, zone, x/y/w/h, label, icon), EDGES
    layerViews.ts         # view → camera rect + emphasized zones
    modeColors.ts         # user/kernel/hw/net/remote → token names
    geometry.ts           # rect math, orthogonal edge path generation
  state/
    store.ts              # one zustand store: playback + scenario + quiz + ui slices
    foldOsState.ts        # deterministic patch fold (see below)
    selectors.ts          # useCurrentStep, useOsState, useActiveTimeline, …
  data/
    types.ts              # NodeId literal union, Step, ComponentDossier, ChaosScenario…
    generated/            # OUTPUT of scripts/convert-content.mjs — never hand-edit
    index.ts              # ALL_STEPS, CHAOS, lazy getComponents(); dev validation
    validate.ts
  lib/                    # keyboard.ts, invariant.ts, useMediaQuery, useFocusTrap, cx
  styles/                 # tokens.css, globals.css
content/src/              # agent-authored plain-JS content (window.X = …)
scripts/convert-content.mjs
```

## The three load-bearing decisions

### 1. Deterministic OS state — fold, never accumulate

Steps author OS-state as **patches** (`state: { mode, proc, sock, fds, mem }` — only keys
that change) plus effect deltas (`ring+`, `pool-`, …). The displayed state at step N is a
pure left fold of patches `0..N` over the **active timeline**:

```text
stateAt(N) = fold(INITIAL_OS_STATE, activeTimeline[0..N])
```

Jump anywhere → identical state as stepping there. Widget values (ring-buffer fill, pool
slots) come from folded counters, never from animation side effects. Forward walks fold
incrementally from a cache; backward jumps or timeline rebuilds refold from zero
(microseconds at ~170 steps).

### 2. React owns structure, GSAP owns per-step visuals

React renders chrome UI and the SVG scene **once** (`SceneCanvas` is a no-props memo).
Ref callbacks register every node/edge/zone element in `engine/registry.ts`.
`AnimationDirector` renders `null`, subscribes to the store *transiently*
(`store.subscribe`, not hooks), and on step change kills the single live GSAP timeline and
builds the next one: dim-out previous node → packet flight along edges → light-in current
node → effects → mode aura. Jumps skip motion via `applyStepStatics()` (instant `gsap.set`
of end-state derived from the fold). Autoplay = timeline `onComplete` → `store.next()`.
No animation value ever enters React state; panels re-render only on step change.

### 3. Camera single-writer rule

panzoom is the **only** writer of the world transform. `cameraEngine` tweens a
`{x, y, scale}` proxy with GSAP and applies via `pz.zoomAbs()/moveTo()` inside a
`programmatic` guard; panzoom events without the guard are user gestures → cancel any
camera tween and set `layerView: 'free'`. Fit targets are computed from `scene/layout.ts`
data (never `getBBox()`), so framing works pre-paint and stays deterministic.

## Store (zustand, single store)

- **playback:** `stepIndex`, `status: idle|playing|paused|awaiting-branch|awaiting-quiz|finished`,
  `speed`, `autoplay` + actions `next/prev/jumpTo/replayStep/restart/play/pause`.
- **scenario:** `flags {runtime,dnscache,medium,scheme,deploy}`, `chaosId|null`,
  `prodMode`, `timelineVersion` + `resolveBranch`, `enterChaos/exitChaos`, `toggleProdMode`.
  Flag changes rebuild the timeline and remap position atomically
  (`nearestStepIndex` by step id → nearest preceding survivor) with `timelineVersion++`.
- **quiz:** `answers{stepId → {choice, correct}}`; unanswered quiz on a sequentially-reached
  step sets `awaiting-quiz` and gates `next()` only (jumps always allowed).
- **ui:** `layerView`, `dossierNodeId`, `searchOpen`, `chaosMenuOpen`, `helpOpen`,
  `expandedChapter`, `sheet` state, Esc-stack `closeTopOverlay()`.

Derived via memoized selectors: `activeTimeline` (filter by `when` vs flags, chaos splice
at `entryAfter`), `currentStep` (prod overrides shallow-merged when `prodMode`),
`osState` (the fold), chapter progress.

## Event flow

```text
user input (button/key/timeline/branch/quiz)
  → store action (pure state transition)
    → AnimationDirector subscription → kill old GSAP tl → build new (or statics on jump)
    → panels/timeline re-render from selectors (once per step)
    → cameraEngine.focusNode(step.node) unless layerView pinned/free
GSAP tl onComplete → (autoplay && playing) → store.next()   // store drives GSAP; never both ways in one tick
```

## Data pipeline

Content is authored as standalone `window.X = …` ES2019 files in `content/src/` (see
DATA_MODEL.md). `scripts/convert-content.mjs` (run via `predev`/`prebuild`) rewrites each
to `src/data/generated/*.ts` (`const X = …; export default X;` + GENERATED banner).
`src/data/index.ts` assembles typed `ALL_STEPS`/`CHAOS`; the dossier map (largest chunk)
is a lazy dynamic import prefetched on idle. `validate.ts` runs dev-only invariants:
unique step ids, node refs ∈ NodeId union, chapters 1–24 non-decreasing, 10 explain keys,
quiz answer in range, `entryAfter` resolves, dossier exists for all 87 nodes.

## Performance

- Zero animation state in React; fine-grained zustand selectors.
- One SVG world group transformed by panzoom (compositor-friendly, `will-change`).
- Glow discipline: one `feGaussianBlur` filter, applied only to packet + active node;
  idle glows are pre-blurred radial gradients.
- Edge path lengths cached once (static scene); edges hidden with `opacity:0`, never
  `display:none` (keeps `getPointAtLength` valid).
- GSAP core only (no plugins — packet motion is a hand-rolled onUpdate).
- Simulator chunk `ssr:false`; content split from engine; budget ~250KB gz app JS
  excluding content chunks.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| panzoom vs GSAP transform fight | single-writer rule + programmatic guard flag |
| getPointAtLength on hidden path | opacity-hide only; lengths cached post-mount |
| hydration mismatch | whole simulator ssr:false behind static skeleton |
| timeline rebuild corrupts position | atomic remap + refold; property test fold(jump) === fold(walk) |
| GSAP leaks on rapid input | single live tl, kill-before-build, transition token, useGSAP context |
| counter drift on jumps | counters live in the fold, statics applied from fold |
| Prism grammar gaps (c/sql) | verify day 1; register grammars or plain-text fallback |
| content schema drift | convert script + dev validators fail loudly with step id |
