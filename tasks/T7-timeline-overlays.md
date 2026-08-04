# T7 — Timeline + overlays

**Goal:** navigation and every interactive surface layered over the canvas.

## OWNS

- `src/components/timeline/ChapterTimeline.tsx`, `ChapterPill.tsx`, `StepList.tsx`
- `src/components/overlays/BranchCard.tsx`, `QuizCard.tsx`, `ChaosMenu.tsx`,
  `DossierModal.tsx`, `LayerViewSwitcher.tsx`, `ShortcutsHelp.tsx`, `ModeIndicator.tsx`
- `src/components/controls/SearchPalette.tsx`

## MUST READ

`docs/AGENT_PROTOCOL.md` → `docs/CONTRACTS.md` C1, C4, C6, C7 → `docs/DESIGN_SYSTEM.md`
→ `docs/PRD.md` FR5, FR8–FR13.

## Spec

**ChapterTimeline** (bottom dock) — 24 chapter pills, horizontally scrollable with
scroll-snap, active pill auto-scrolled into view. Pills show chapter number + title and a
branch glyph (⑂) where `CHAPTERS[n].branch` is set. States: done (`--ok` + tick), current
(mode-colored, filled, subtle glow), future (`--text-3`). The current chapter expands
in place into `StepList` — its steps as small clickable chips; clicking any chip jumps.
Chapter click jumps to that chapter's first step. Progress bar across the whole dock.

**BranchCard** — appears when `status === 'awaiting-branch'`. Shows `branch.question` and
2 options as large choice cards with `label` + `hint`. Selecting calls
`resolveBranch(key, value)`. Make it feel like a decision point, not a modal nag — anchor
it near the canvas center, dim the canvas behind it.

**QuizCard** — appears when `status === 'awaiting-quiz'`. Radio group (`fieldset` +
`legend`), submit on click. Correct → green confirmation + `quiz.explain` + auto-continue
affordance. Wrong → red shake, show `quiz.explain`, allow retry. Never block `jumpTo`.

**ChaosMenu** — "What if?" launcher listing the 5 scenarios with icon + label + a one-line
consequence. Selecting calls `enterChaos(id)`; while chaos is active show a persistent
badge with an exit affordance. Make the danger visible (err accent).

**DossierModal** — opens on node click (`dossierNodeId`). Renders the full
`ComponentDossier`: name + tagline header, description, purpose, history, responsibilities
list, commands (mono, copyable, with notes), production notes, interview questions
(collapsible), sources (kernel paths / RFCs / man pages), and `related` components as
chips that navigate to that dossier. Focus-trapped, Esc closes. Lazy-load the dossier
chunk (`getComponents()`).

**SearchPalette** — `/` or click. Searches step titles + chapter names + component names
and taglines. Grouped results, arrow-key navigation, Enter jumps (step → `jumpTo`,
component → `openDossier` + camera focus). Substring + simple fuzzy is enough for this
scale; no dependency.

**LayerViewSwitcher** — the 7 views from contract C6 as a segmented control; selecting
calls `setLayerView`, which the camera engine reacts to. Show `free` state when the user
has panned manually.

**ModeIndicator** — floating pill over the canvas showing the current CPU/location mode
as color **and text**, crossfading on change.

## ACCEPTANCE

- Every chapter and every step is reachable by click; the active chip is always visible.
- Branch cards appear exactly at branch steps and the choice visibly changes the timeline.
- Quiz gates forward playback but never blocks jumping.
- Chaos runs to a browser-visible error and can be exited back to the normal timeline.
- Dossier opens for all 87 components, `related` chips navigate, Esc closes, focus returns.
- Search finds both steps and components and jumps correctly.
- All overlays are keyboard operable and focus-trapped; Esc closes the top one only.

## VERIFY

```bash
pnpm typecheck && pnpm lint
```

Then `pnpm dev`: exercise each branch, one full chaos scenario, a quiz (right and wrong),
three dossiers incl. `related` navigation, two searches, and every layer view. Confirm no
console errors.
