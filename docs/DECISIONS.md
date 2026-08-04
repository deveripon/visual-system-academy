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
