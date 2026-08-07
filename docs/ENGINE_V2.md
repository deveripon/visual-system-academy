# Engine v2 — the progressive-disclosure rebuild

**Status:** design, awaiting approval. No code written.
**Supersedes:** the flat-world scene described in `ARCHITECTURE.md` §"Scene strategy".

---

## 1. Why

v1 shipped and works: 194 lesson steps + 45 chaos steps, 24 chapters, 87 dossiers,
deterministic state fold, branching, quizzes, failure injection, production mode, all
gates green. And the product is still wrong.

It renders **all 87 components at once**. The consequences:

- A learner meets `Parser`, `AST`, `Ignition`, `conntrack` and `shared_buffers` in one
  glance, before being told what any of them are. You do not know where to look.
- **Depth is not encoded.** Twelve zones sit side by side in a grid, so "the kernel is
  *underneath* the runtime" is something you must already know to read the picture.
- **Every box is a black box.** Clicking one opens a text dossier — a footnote, not a
  door. We agreed nothing would stay a black box; we shipped 87 of them with captions.
- Camera zoom reveals nothing, because there is nothing *inside* anything.

Features that do exist — packet animation, collapsible code, five branch forks — were
invisible on first contact. That is evidence for the diagnosis, not against it: a feature
you cannot discover is not a feature.

**The engine, not the CSS, is the product.** This document defines it.

## 2. Philosophy (fixed)

- The student never sees the whole system at once.
- Every concept is a black box **until reached**; then it opens and reveals its internals.
- Exactly ONE concept is in focus at any moment. Everything else is hidden, collapsed, or
  heavily dimmed.
- NEXT moves the camera: the previous concept collapses, the next expands.
- Nothing stays a black box — Browser, Kernel, TCP, Socket, NIC, Router, DNS all open.
- The right panel is a **live inspector**, not documentation.
- Every concept carries collapsible code.
- **No new technologies, no new subsystems.** Redesign the engine; do not add content.

## 3. Decisions (settled with Ripon)

1. **Focus + breadcrumb + dimmed siblings.** Focused concept open and centered;
   breadcrumb (`Journey › Browser › V8`) carries the ancestors; siblings at ~20% at the
   edge so you know what is coming.
2. **The flat 87-node map survives as an opt-in overview** (`M`): whole journey, current
   position marked, path so far traced. Never the landing view.
3. **Derive, then hand-review.** Author the component tree once; derive every step's
   `path` and `action` from it; then walk all 24 chapters and fix awkward transitions.
   Re-authoring the 239 steps is out of scope.

## 4. What the content analysis says

Measured against the real authored content, not assumed:

| Measure | Result | Meaning |
|---|---|---|
| Consecutive transitions staying inside one zone | **107 / 151 (71%)** | the narrative is already local — a tree walk fits |
| Cross-zone transitions | 44 (29%), 31 distinct pairs | these become explicit `exit → travel → enter` moves |
| Steps carrying an explicit `from` | 18 / 194 | `action` must be derived, not read |
| Nodes focused by ≥ 1 step | 84 / 87 | `thread`, `udp`, `netns` are scenery, never entered |
| Nodes with ≥ 1 code pane | 73 / 84 focused | 11 nodes need code added for "every concept has code" |

**The decisive finding: a chapter is already a room.**

```text
ch2   parser > ast > ignition > bytecode > cpu > ignition > turbofan > machinecode   ← all inside V8
ch5   stubresolver > recursive > rootns > tldns > authns > stubresolver              ← all inside DNS
ch20  postgres > planner > executor > sharedbuf > memmap > disk > wal > executor     ← all inside PostgreSQL
ch23  nic > dma > irq > cpu > napi > softirq > ringbuffer > ip > netfilter > tcp …   ← hardware → kernel, the real story
```

The authors wrote rooms without being asked to. The tree formalises what the content
already does, which is why derivation is credible rather than wishful.

## 5. The component tree

Eleven stations at L0. **Fifteen new container ids** — these are rooms the existing boxes
already sit in, made explicit. No new *content* boxes are invented.

```text
journey
├── your-code ······ appcode
├── runtime
│   ├── v8 ★ ······· parser · ast · ignition · bytecode · turbofan · machinecode
│   ├── webapi
│   ├── eventloop
│   ├── netservice ·· httpcache · socketpool
│   └── nodejs ······ libuv · undici
├── dns-system ★ ··· stubresolver · recursive · rootns · tldns · authns
├── kernel ★
│   ├── syscall ★ ··· libc · syscallgate · syscalltable · cpu
│   ├── process ····· thread · scheduler · fdtable · memmap
│   ├── netstack ★ ·· socketlayer · socketobj · tcp · udp · ip · routing · arp
│   │                 netfilter · iptables · conntrack · qdisc · netns
│   └── driverlayer ★ driver · ringbuffer · dma · irq · softirq · napi
├── hardware ★ ····· nic · ethframe · wififrame · phy · signal
├── lan ★ ·········· switch · homerouter · nat · modem
├── internet ★ ····· headend · ispcore · bgp · fiber · tier1a · ixp · tier1b
├── edge ★ ········· anycast · ddos · waf · cftls · cfcache · originpull
├── origin ★ ······· lb · proxy · dnat · bridge · veth · cnetns
├── app ★ ·········· appserver · middleware · controller · service · prisma · pool
└── database ★ ····· postgres · planner · executor · sharedbuf · wal · disk

★ = new container id (15). All 87 existing NodeIds appear exactly once as leaves.
```

**Opening a leaf.** `tcp` has 11 steps but no children — and Ripon explicitly said "TCP
opens". A leaf opens to reveal **its own beats**: the steps focused on it, its code panes,
its packet structure and its live state. Opening a container reveals child boxes; opening
a leaf reveals its internals-as-content. Neither invents a new box, and nothing stays
opaque.

## 6. The Scene model

Ripon's sketch was:

```ts
Scene { id, focusComponent, visibleComponents[], animation, camera, explanation, code, quiz, next }
```

Right instinct, one change: **`visibleComponents` must be derived, not authored.**
Authoring it means maintaining a visibility list 239 times and letting it drift out of
sync with the tree. The engine can always compute it correctly from
`(tree, focus, expanded)`. Everything else in the sketch survives.

```ts
/** Authored (or derived once, then reviewed) — the lesson's own data. */
interface Step {                       // unchanged fields omitted
  id: string;
  focus: NodeId;                       // was `node`
  action: 'enter' | 'open' | 'travel' | 'exit' | 'stay';
  explain: StepExplain;                // all ten fields, unchanged
  code?: CodePane[];
  quiz?: StepQuiz;
  branch?: StepBranch;
  state?: StepStatePatch;              // + stack?: string[]
  packet?: StepPacket;
  effects?: EffectId[];
  when?: Partial<ScenarioFlags>;
  prod?: ProdOverride;
}

/** Computed by the engine. Never authored, never stored. */
interface Scene {
  step: Step;
  focus: NodeId;
  path: NodeId[];                      // ['runtime','v8','ignition'] — the breadcrumb
  room: NodeId;                        // the open container: path[path.length - 2]
  visible: NodeId[];                   // room's children — the only boxes on screen
  expanded: NodeId[];                  // which of them are open
  siblings: NodeId[];                  // dimmed, at the edge
  camera: { fit: NodeId; scale: number };
  transition: { kind: Step['action']; from: NodeId | null; depth: number };
}
```

**Why five actions.** Ripon's own example distinguishes them: *"Step 2 — Browser appears.
Still collapsed. Step 3 — Browser opens."* Same focus, different expansion. So `open` is a
real action, separate from `enter` (descending into a new room).

| action | meaning | motion |
|---|---|---|
| `enter` | descend into a container | its frame becomes the new room (shared-element) |
| `open` | the focused black box reveals its internals in place | contents fade/scale in |
| `travel` | move to a sibling in the same room | the packet flies (v1's existing motion) |
| `exit` | ascend to the parent | the room shrinks back into its box |
| `stay` | elaborate without moving | annotate in place |

## 7. `simulation-engine.ts`

The most important file in the project. Pure, synchronous, no DOM, no React, no store —
which makes it exhaustively testable.

```ts
// src/engine/simulation-engine.ts

export interface Tree {
  root: NodeId;
  parent: Record<NodeId, NodeId | null>;
  children: Record<NodeId, NodeId[]>;
  depth: Record<NodeId, number>;
}

export function buildTree(spec: TreeSpec): Tree;
export function pathTo(tree: Tree, node: NodeId): NodeId[];

/** The one function everything else is built on. */
export function resolveScene(
  tree: Tree,
  timeline: Step[],
  index: number,
): Scene;

/** Derivation used by the migration script AND at runtime for authored gaps. */
export function deriveAction(
  tree: Tree,
  prev: NodeId | null,
  next: NodeId,
): Step['action'];

/** Which boxes have been opened by step N — folded, never accumulated. */
export function foldDisclosure(
  tree: Tree,
  timeline: Step[],
  upTo: number,
): { seen: Set<NodeId>; opened: Set<NodeId>; entered: Set<NodeId> };
```

`deriveAction` is the whole migration in six lines of logic:

```text
prev is null                        → enter
next is a descendant of prev        → enter
next === prev                       → open   (if not already open) else stay
next is an ancestor of prev         → exit
next shares prev's parent           → travel
otherwise (cross-subsystem)         → exit ×n, then enter ×m   (expanded to real steps)
```

**The invariant that must survive from v1:** `resolveScene(t, tl, n)` and
`foldDisclosure(t, tl, n)` are pure folds over `0..n`, exactly like `foldOsState`. Jumping
to step N produces byte-identical state to walking there. This is already true of the
OS state and it is the property that makes the timeline scrubbable.

## 8. Transitions

Three motion primitives; the existing effects vocabulary (`irq`, `ctx`, `ring±`, `pool±`,
`flash`) composes on top unchanged.

- **`descend(parent, child)`** — a *shared-element* transition: the child's rectangle
  grows until it becomes the new room's frame, while its interior fades in. The box you
  were looking at visibly becomes the room you are standing in. This single move is what
  makes it a simulator rather than a deck, and it is the one thing that must feel perfect.
- **`ascend(child, parent)`** — the exact inverse, so the mental map stays intact.
- **`travel(a, b)`** — v1's packet flight along real edge geometry. Keep as is.

`open` is not a camera move: the room stays, the focused box unfolds in place.

**Reduced motion:** descend/ascend become a 150ms crossfade between rooms; the packet
appears at its destination. Same information, no travel.

## 9. Semantic depth vs camera zoom

v1 conflated these in `cameraEngine`. They separate cleanly:

- **Semantic depth** — changes *what exists*. Driven by the scene stack. This is what
  `enter`/`exit` move through.
- **Camera zoom** — panzoom scale *within* the current room. A lens. It never reveals or
  hides a component.

A learner in the runtime room who zooms out does not see the kernel. They see the runtime,
larger. Reaching the kernel requires ascending and descending — which is the entire point.

## 10. The live inspector

Ripon: *"It should always describe current component, layer, CPU mode, memory state,
packet state, socket state, code, animation. Only information relevant to THIS STEP."*

**The blocker, found during reconnaissance:** `foldOsState` returns a flat snapshot and
throws away provenance. The panel literally cannot know what changed this step. Fix:

```ts
interface OsState {
  mode: StepMode; proc: string; sock: string;
  fds: [string, string][]; mem: MemSpace;
  stack: string[];                                  // NEW — the call stack
  counters: { ring: number; pool: number; queue: number };
  touched: Set<keyof OsState>;                      // NEW — written by THIS step
}
```

`touched` is the relevance signal. Widget visibility rule:

| widget | shown when |
|---|---|
| CPU ring | always — it is the anchor |
| Call stack | always — it makes depth legible as a machine fact |
| Packet inspector | `step.packet` exists |
| TCP state machine | `sock` touched recently, or focus is inside `netstack` |
| FD table | `fds` touched recently, or focus is inside `process` |
| Memory map | `mem` touched, or `mem === 'copy'` |

**The call stack is derived, not authored.** The scene path *is* a call stack —
`Journey › Browser › V8 › Ignition` — so the breadcrumb and the stack widget are two
renderings of one truth. Steps may append real frames (`sys_socket`) via
`state.stack` where the content already names them.

## 11. Impact: what survives, what changes

Grounded in an actual read of the 23 UI files (3,705 lines).

### Survives untouched

- **All content** — 239 steps, 87 dossiers, chaos, prod overrides.
- **The four leaf state widgets** (`CpuRingIndicator`, `TcpStateMachine`,
  `MemoryMapWidget`, `FdTable` — 402 lines): props-in/pixels-out, store-free, stateless.
- `scenarioEngine` — flags, chaos splice, branch resolution, prod merge.
- `CodePane` (incl. the hand-written shell grammar — bash is 95 of 190 panes).
- `DossierModal`'s **body** (~140 lines) — cleanly liftable as the "inside" of an opened
  component. Its shell (fixed overlay, focus trap, header) is not reused.
- The GSAP director discipline, the docs suite, the task-board system.

### Rewritten

| File | Change |
|---|---|
| `src/scene/layout.ts` | flat world → tree + per-room layouts (per-room packing is *easier*: ≤ 9 boxes) |
| `src/engine/cameraEngine.ts` | world-fitting → room stack + shared-element descend/ascend |
| `src/engine/timelines.ts` | gains `descend`/`ascend`; `paintStates` scopes to the room |
| `src/components/canvas/SceneCanvas.tsx` | renders one room, not one world |
| `src/state/foldOsState.ts` | add `stack`, add `touched` provenance |
| `src/state/selectors.ts` | `useChapterProgress` is numeric-ordered (`c.n < current`); must become index-ordered |
| `src/components/timeline/*` | flat `<ol>` of pills with no nesting primitive → depth-aware dock |
| `src/components/panels/OsStatePanel.tsx` | fixed 1:1 field→widget list → relevance-filtered list (~10 of 48 lines) |
| `src/components/panels/RightRail.tsx` | the pinned `max-h-[50%]` box assumes constant widget count; must handle a panel that shrinks |

### Two defects to fix while in there

1. **`RightRail` mounts `ExplainPanel` twice on desktop** — both breakpoint branches are
   always mounted and hidden with CSS, so every hook runs twice and each `CodePane` has
   two independent open states.
2. **`ExplainPanel` renders all ten fields unconditionally** with a hardcoded template.
   For "only what is relevant to THIS step" it needs a relevance pass — safe only because
   `StepExplain` declares all ten as required.

### Store retyping

`expandedChapter: number | null` is written in six places and read with `0` as a sentinel;
`jumpToChapter(number)` and `firstStepOfChapter` are numeric. All become path-aware.

## 12. Build order

Each milestone ends in something runnable. No big-bang rewrite.

| # | Milestone | Verifiable by |
|---|---|---|
| **M1** | `simulation-engine.ts` + `componentTree.ts`, pure, plus a migration script that derives `path`/`action` for all 239 steps and prints a report | node script: every step resolves; action histogram is sane; zero orphan nodes |
| **M2** | Hand-review the derived actions across all 24 chapters; fix thrash | diff review + the report from M1 |
| **M3** | Room renderer — `SceneCanvas` draws ONE room + breadcrumb + dim siblings. Static, no motion | click through rooms in the browser |
| **M4** | Descend/ascend shared-element transitions + camera stack | walk ch2 (V8) and ch23 (kernel RX) end to end |
| **M5** | Live inspector — `touched` provenance, call stack, relevance rules; fix the double-mount | step through ch6 and ch20, watch widgets appear/disappear |
| **M6** | Depth-aware timeline dock; store retyping | jump correctness: state at N identical via jump and via walk |
| **M7** | Overview map (`M`) restored as opt-in, with position + path traced | toggle from any room and back |
| **M8** | Code coverage pass — add panes for the 11 focused nodes that have none | `pnpm validate` extended to assert coverage |

## 13. Verification

- **Purity tests** (new, and the reason the engine is a separate pure module):
  `resolveScene(n)` via jump ≡ via walk, for every n, across all 32 flag combinations and
  5 chaos splices. Same property test as `foldOsState`.
- **Derivation report**: action histogram per chapter; flag any chapter with more than two
  consecutive `exit`+`enter` pairs as thrash needing review.
- **Browser walk**: all 24 chapters; confirm at every step that exactly one box is focused
  and the room contains ≤ 9 boxes.
- **The cold-open test** — the one that actually matters: show it to someone who has never
  seen it and confirm they know where to look in the first two seconds.
- Existing gates unchanged: `convert → validate → typecheck → lint → build`.

## 14. Resolved (Ripon, 2026-08-04)

1. **The journey opens at L0 for a beat, then auto-descends.** Orientation happens once,
   at the start — the ten stations establish the shape of the trip — and then the camera
   drops into `appcode` and never shows the whole map again unless asked (`M`).
2. **Ascend is automatic.** When the narrative leaves a subsystem the camera pulls up on
   its own; the learner never has to press "up" to follow the story. Manual ascend stays
   available for free exploration.
3. **Depth gating is advisory.** A component whose parent has not been seen renders dimmed
   with a hint, never disabled. An expert must be able to jump straight to `conntrack`.
