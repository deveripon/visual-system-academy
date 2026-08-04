# T9 — QA + static export

**Goal:** prove the whole thing actually works, in a real browser, end to end.

## OWNS

Nothing. You do not fix code — you find, reproduce, and file. Write findings to
`tasks/_INBOX.md` (one entry per issue, with the owning task id) and update
`docs/TASKS.md` statuses.

## MUST READ

`docs/PRD.md` (the FR list is your test plan) → `docs/AGENT_PROTOCOL.md`.

## Test plan

**Build gates**

```bash
pnpm convert && pnpm validate && pnpm typecheck && pnpm lint && pnpm build
```

**Functional walk** (drive a real browser; capture console the whole time)

1. Load `/` → simulator mounts, no hydration warnings, no console errors.
2. Press `→` through **all 24 chapters** to the finale. Watch for: a step whose node does
   not light, a packet that teleports when it should fly, an OS-state widget that goes
   stale, an explain field rendering `undefined`.
3. Each branch, one at a time: browser↔node, ethernet↔wifi, dns hit↔miss, https↔http,
   docker↔baremetal. After each choice, confirm the timeline length changed and the
   chapter list still reads sensibly.
4. Each chaos scenario end-to-end; confirm each ends in the correct browser-level error
   and that exiting restores the normal timeline.
5. Quiz: answer wrong then right; confirm gating and that `jumpTo` bypasses it.
6. Jump correctness: from step 150, click step 12 — OS state, node coloring and packet
   must all match what stepping there produces. Spot-check three pairs.
7. Dossiers: open ≥ 10 across different zones; follow `related` chips; Esc returns focus.
8. Search: find a step by title, a component by name; both jump correctly.
9. All 7 layer views; production mode on/off (content visibly changes, timeline does not).
10. Speed 0.5×/3×; autoplay on for 3 chapters unattended.

**Non-functional**

- Keyboard-only pass: every control reachable, `?` help accurate.
- `prefers-reduced-motion: reduce` (emulate in DevTools) — no travel animation, app still
  fully usable.
- Responsive: 1440, 1024, 768, 390 widths. Rail becomes a sheet; timeline scrolls; canvas
  never clips into the panels.
- Performance: profile one chapter walk — no React re-renders during animation; frame rate
  stays near 60.
- Static export: `pnpm build` with `output: 'export'` produces `out/` that opens correctly
  from a static server.

## Deliverable

A findings list in `tasks/_INBOX.md` (severity, repro steps, owning task) plus screenshots
of: the kernel-mode aura moment, the NAT rewrite packet fields, chapter 23 mid-flight,
a dossier, a chaos ending, and the narrow-viewport layout.
