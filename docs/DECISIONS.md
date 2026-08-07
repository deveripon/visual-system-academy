# Decision log

Append-only, one line per decision, newest at the bottom. Safe for concurrent edits.
Record anything the next agent would otherwise have to rediscover.

- 2026-08-04 — Build as Next.js 16 + React 19 + TS, not a single HTML file: the feature
  set (branching, quizzes, chaos, dossiers, prod mode) is a product, not a diagram.
- 2026-08-04 — GSAP owns all per-step visuals; React renders the scene once. Animation
  values never enter React state — this is the rule that keeps 60fps with 87 nodes.
- 2026-08-04 — panzoom is the single writer of the world transform; camera tweens go
  through it via a proxy object, so user gestures and programmatic framing never fight.
- 2026-08-04 — OS state is a deterministic fold of per-step patches, so an arbitrary jump
  reconstructs exactly the same state as stepping there. No accumulation via animation.
- 2026-08-04 — Lesson content is authored as plain-JS `window.X = …` data files and
  converted to typed TS at build time; this keeps content machine-independent and lets
  many agents author in parallel without touching app code.
- 2026-08-04 — `NodeId` (87 ids) is the universal join key across scene layout, steps,
  dossiers and search. Anything referencing a component uses it.
- 2026-08-04 — panzoom ships its own `index.d.ts`; no `@types/panzoom` package exists
  (it is not on npm). Do not try to install it.
- 2026-08-04 — panzoom is created WITHOUT `bounds`: bounds clamping refuses to centre
  nodes near the world edges, which the lesson does constantly. Camera framing is the
  constraint, not content-on-screen.
- 2026-08-04 — Chaos `entryAfter` ids are resolved through `scripts/chaos-entry-map.mjs`,
  shared by the converter and the validator. This is deliberate: chaos content and step
  content are authored by different agents who cannot see each other's ids, so the seam
  belongs in the build, not in a coordination requirement.
- 2026-08-04 — `replayStep()` is a timelineVersion bump at an unchanged index; the
  director detects that pair and re-animates the arrival from index-1 rather than
  snapping to statics (which is what any other version bump means).
- 2026-08-04 — Content authoring converged on three step files (a: ch1-8, b: ch9-16,
  c: ch17-24) rather than the finer split first sketched. Contract C8 lists what actually
  exists; the converter skips missing files so the split can change again safely.
- 2026-08-04 — `prism-react-renderer` bundles grammars for c, cpp, sql, js/jsx/ts/tsx but
  NOT bash, and `prismjs` is not an installable direct dep here. `CodePane` registers a
  deliberately conservative shell grammar (command word only after a `$` prompt or a
  pipe) because a third of the `bash` panes are ASCII diagrams that a greedy grammar
  shreds. A missing grammar degrades to plain text — `Highlight` never throws.
- 2026-08-04 — `tokens.css` is imported *after* `tailwindcss`, so `.glass` and
  `.instrument-label` are UNLAYERED and beat every Tailwind utility. To recolour or
  resize an `.instrument-label`, use an inline `style`, not `text-warn`/`text-[10px]`.
- 2026-08-04 — Every overlay self-gates on store state and returns `null` when closed, so
  the shell mounts them unconditionally and never has to know their open conditions.
- 2026-08-04 — Esc is handled inside each modal's focus trap (native listener on the
  overlay root that calls `stopPropagation`), so the window binding in `src/lib/keyboard.ts`
  can never close a second overlay in the same keystroke. That listener also claims
  Space/arrows/`r`/`h`/`l` while a modal has focus, otherwise Space on a modal button would
  toggle playback behind it (`shieldGlobalKeys` does the same for the inline gates).
- 2026-08-04 — Branch and quiz cards are deliberately NOT modal: their scrim is
  `pointer-events-none` and nothing is trapped, so the learner can keep exploring the canvas
  and the timeline while deciding. Only search / dossier / chaos / help trap focus.
- 2026-08-04 — `react-hooks/set-state-in-effect` is an *error* in this config, so overlay
  state is reset by remounting (`<QuizGate key={step.id}>`, palette mounts fresh on open)
  and clamped in render, never corrected in an effect. Entrance motion is likewise a CSS
  keyframe (`OVERLAY_KEYFRAMES`, injected via inline `<style>` since T7 does not own
  globals.css) rather than a mount-transition flag.
- 2026-08-04 — QuizCard visibility cannot key on `status` alone: the store flips to
  `paused` the instant a correct answer lands, so the card also stays up on its local
  result — that is the only reason the green confirmation is ever seen.
- 2026-08-04 — `expandedChapter === null` means "the chapter you are in is open" (the dock
  has no sensible empty resting state); collapsing writes chapter `0`, which no chapter
  matches. The store's own writes keep working unchanged.
- 2026-08-04 — The five chaos consequences ("ERR_NAME_NOT_RESOLVED…") live in
  `ChaosMenu.tsx`: `ChaosScenario` has no field for the outcome, and naming it is the hook.
  Scenarios missing from `CHAOS` render as disabled "coming soon" rows.
- 2026-08-04 — `getComponents()` is cached at module level behind `useComponentMap()` in
  `overlays/overlayKit.ts` and shared by the dossier modal and the search palette, so
  reopening a dossier never flashes a loading state.
- 2026-08-04 — `@theme inline` maps `--font-mono` to itself, so `font-mono` resolves to
  nothing; mono text uses `font-[family-name:var(--font-mono)]` (exported as `MONO`).
- 2026-08-04 — Scene state (node/edge/zone/aura) is painted SYNCHRONOUSLY by
  `paintStates()`, shared by jumps and animated steps. A deferred GSAP callback can be
  killed before it runs, which left several nodes lit at once and the mode aura stale.
  Motion is decoration on top of a scene that is already correct.
- 2026-08-04 — `cpu` lives in the kernel zone, not the browser zone: the ring 3 → ring 0
  flip is the signature moment of the lesson and must light the kernel frame.
- 2026-08-04 — Untravelled edges sit at 0.11 opacity. 158 connectors at full strength
  read as spaghetti and bury the one path that matters; they exist to show the graph is
  dense, not to be individually traced.
- 2026-08-04 — QA note: browser extensions inject attributes on <body> before hydration
  (cz-shortcut-listen, Grammarly). `suppressHydrationWarning` on <body> is the fix; it is
  not an app bug.
- 2026-08-04 — ENGINE v2: the scene is a TREE of rooms, not one flat world. `componentTree.ts`
  places all 87 NodeIds as leaves under 15 new container ids. Containers are not new
  content — they are the rooms the existing boxes already sat in, made explicit so the
  camera has somewhere to descend into.
- 2026-08-04 — Arriving at a box does NOT open it; the next beat on it does. `foldDisclosure`
  therefore marks only ANCESTORS of the focus as opened. That pair of beats is the entire
  "black box until you reach it" mechanic, and without it `open` never fires.
- 2026-08-04 — `cross` is a distinct action from `travel`. A sibling hop is one packet
  flight; leaving a subsystem is climb-out-then-descend. Collapsing both into `travel` hid
  the most expensive camera move in the lesson (57 of 194 steps).
- 2026-08-04 — Thrash metric is calibrated at climb >= 3, not >= 2. Climb 2 is a lateral
  move between two sub-rooms of the same parent (driverlayer -> netstack inside the
  kernel) and is normal. At >= 2 every chapter looked broken; at >= 3 none do.
- 2026-08-04 — Two rooms deliberately exceed the <= 9 boxes guideline: `journey` (11
  stations) and `netstack` (12). Both are rooms whose breadth IS the lesson — L0 shows the
  whole trip once, and ch8 walks the entire network stack. Splitting them would trade one
  honest wide room for constant climbing.
- 2026-08-04 — PALETTE: the neon-on-black theme read as a monitoring dashboard, not
  something you learn from. Repointed to "paper": light ground, soft pastel mode FILLS
  with saturated INK, dark text. The legacy token names (--text-1, --surface, --mode-*)
  are aliased to the new palette in tokens.css so all 3,700 lines of v1 markup render
  correctly without being rewritten.
- 2026-08-04 — TWO VIEWS, one journey: `store.view` is 'story' | 'map'. Story is the
  storyboard (node chips chained left-to-right, explanation card under each); map is the
  original architecture canvas. Both read the same timeline and store, so switching never
  loses your place. Story is the default; the GSAP director only mounts for map.
- 2026-08-04 — In story mode RightRail hides ExplainPanel: the explanation is already on
  the card under its node, and printing the same words twice on one screen was half the
  perceived clutter. The rail keeps the packet and machine state, which the card lacks.
- 2026-08-04 — FlowCanvas stations need `shrink-0`. Without it flexbox crushed every
  station to a sliver once the strip was long and the 380px cards overlapped on top of
  each other — the single worst-looking bug of the rebuild.
- 2026-08-04 — One chip per NODE, not per step: a chapter with four beats on `appcode`
  drew "Your Code" four times. Continuation beats render their card under the same chip.
- 2026-08-04 — The control bar must NOT be a scroll container. When it was, clicking Next
  (its own child) let the browser scroll the focused button into view and dragged the
  wordmark off the left edge. Low-priority items hide at narrow widths instead.
- 2026-08-05 — THEMING: two committed themes (warm paper light, deep ink dark) sharing one
  fill+ink semantic system. A pre-hydration script in layout.tsx stamps data-theme on
  <html> from localStorage else the OS preference, so there is no flash and no duplicated
  @media block — CSS only ever reads the attribute. suppressHydrationWarning on <html>
  because that attribute is intentionally client-stamped.
- 2026-08-05 — ThemeToggle uses useSyncExternalStore over a MutationObserver on
  <html data-theme>: the DOM attribute IS the store. No set-state-in-effect (linted as an
  error here), and devtools edits / the boot script stay in sync automatically.
- 2026-08-05 — Motion vocabulary lives in globals.css as five keyframes (pop-in, card-in,
  fade-in, draw, travel) on one easing family (--ease-out/--ease-inout). Connectors use
  pathLength={1} so a single normalised dash keyframe draws every elbow variant; the
  travel dot runs the line via CSS offset-path — no JS animation in story mode at all.
- 2026-08-05 — StepCard is ONE <article> whose current/mini states differ only by class:
  React keeps the DOM node when `current` flips, so width/opacity/border TRANSITION and
  the card visibly folds to its title instead of swapping. Disclosures animate height via
  the grid-template-rows 0fr→1fr trick — children stay mounted, nothing is measured.
- 2026-08-05 — STORY MODE IS A SLIDE DECK, not a growing strip. The zig-zag storyboard
  (chips at alternating heights, a card under every past step) scattered the eye and
  filled the stage with dead space. Now: a single chain rail across the top — one pill
  per visited node, gliding one notch left per hop via an imperative transform — and the
  current step's card centre stage, sliding in keyed on step.id. The SHELL never moves;
  only the canvas animates. Composition is identical on every step.
- 2026-08-05 — In story mode the rail is machine state first, packet after, one flowing
  column. The pinned-bottom split (packet top, stretchy void, state pinned) read as a
  hole in the UI. Map mode keeps the pinned layout because the explanation lives in the
  rail there and competes for the same column.
- 2026-08-05 — Story mode auto-play is a reading-pace timer (StoryAutoplay, 4.6s/speed),
  not GSAP: it only runs while status === 'playing', so every gate (branch, quiz, end)
  pauses it for free — next() refuses the gate, flips status, the chain stops.
- 2026-08-05 — The shell is overflow-clip + w-full and the rail is clamped to 34vw:
  nothing inside may ever widen the app past the window ("shell screens going beyond").
- 2026-08-05 — The instrument rail speaks beginner first: every section carries one plain
  sentence (what a socket state IS, why RAM has two halves, "everything is a file")
  before showing its value. The bare ring/pool/queue counters only render when nonzero,
  with human labels — "ring 0 · pool 0 · queue 0" was instrument jargon with no reader.
- 2026-08-05 — The map is flat 2D in both themes: zones are washes of their mode FILL,
  nodes are solid paper cards with a mode spine, the packet is the only thing that glows.
  The neon glow filter on the active node died with the dark-only theme.
