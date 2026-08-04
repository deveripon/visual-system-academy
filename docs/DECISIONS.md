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
