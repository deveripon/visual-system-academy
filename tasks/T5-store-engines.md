# T5 — Store + animation engines

**Goal:** the brain. Deterministic state, scenario branching, chaos splicing, and the GSAP
director that turns a step change into motion.

## OWNS

- `src/state/store.ts`, `selectors.ts`, `foldOsState.ts`
- `src/engine/stepEngine.ts`, `scenarioEngine.ts`, `timelines.ts`, `effectsEngine.ts`,
  `packetMotion.ts`, `cameraEngine.ts`, `reducedMotion.ts`
- `src/components/canvas/AnimationDirector.tsx`
- `src/lib/keyboard.ts`

## MUST READ

`docs/AGENT_PROTOCOL.md` → `docs/CONTRACTS.md` C1, C2, C4, C5, C6 →
`docs/ARCHITECTURE.md` (all three "load-bearing decisions") → `docs/ANIMATION_SYSTEM.md`.

## Spec

Implement exactly the APIs in contracts C4 and C5 — other tasks are coding against them.

**Non-negotiable invariants:**

1. `foldOsState` is pure. `jumpTo(n)` then read state === stepping to `n` then read state.
   Effect counters (`ring`, `pool`, `queue`) live in the fold, not in animation callbacks.
2. Timeline rebuilds (`resolveBranch`, `setFlag`, `enterChaos`, `exitChaos`) set
   `stepIndex` and `timelineVersion` in the **same** `set()` call.
3. `AnimationDirector` renders `null`, subscribes via `useSimStore.subscribe` (never a
   hook that re-renders), and holds exactly one live GSAP timeline in a ref, killed before
   every rebuild. A transition token discards stale `onComplete`s.
4. ±1 step → animated transition. Any other index delta → `applyStepStatics` (instant).
5. Autoplay: `onComplete → status === 'playing' && next()`. Never a `setInterval`.
6. Camera goes through panzoom only, under the `programmatic` guard; user gesture cancels
   in-flight camera tweens and sets `layerView: 'free'`.
7. `prefers-reduced-motion` → statics + 150ms crossfade, no travel.

**Keyboard** (`lib/keyboard.ts`, one window listener, no-op when focus is in an input or a
modal has focus trapped): `→`/`←` step, `Space` play/pause, `/` search, `r` replay,
`Shift+R` restart, `f` fit, `Esc` close top overlay, `?` help.

**Quiz gating:** an unanswered quiz on a sequentially-reached step sets
`status: 'awaiting-quiz'` and blocks `next()` only. `jumpTo` is always allowed and records
skipped quizzes as `{ choice: -1, correct: false }`.

## ACCEPTANCE

- Stepping forward through the whole lesson animates; every step lights its node, moves
  the packet, and dims the rest.
- Clicking any timeline step jumps instantly with correct OS state and correct
  visited/active/future coloring across the whole scene.
- Branch steps pause; choosing an option rebuilds the timeline and continues sanely.
- Chaos entry replaces the tail of the timeline; exiting restores it.
- Speed changes retime the currently-running animation.
- No React re-render occurs during an animation (verify with React DevTools profiler or a
  render counter on a panel).
- Rapid `→` spam never leaves orphaned tweens or a desynced scene.

## VERIFY

```bash
pnpm typecheck && pnpm lint
# property check — write this as a temp script or a vitest test:
#   for n in 0..len-1: assert deepEqual(foldOsState(tl, n), walkTo(n))
#   for each of the 32 flag combos: buildTimeline() is non-empty and chapter-monotonic
```
