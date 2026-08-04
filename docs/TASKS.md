# Task Board

Claim a task by setting its status to `WIP` with your machine/agent name. Read
`docs/AGENT_PROTOCOL.md` first. Full brief for each task lives in `tasks/<ID>.md`.

**Legend:** `TODO` available · `WIP` claimed · `REVIEW` done, awaiting integration · `DONE`

| ID | Task | Owns (exclusive) | Depends on | Status | Claimed by |
|----|------|------------------|-----------|--------|-----------|
| T1 | Scaffold + deps | *(shared config)* | — | DONE | session |
| T2 | Docs suite | `docs/**` | — | DONE | session |
| T3 | Design tokens + app shell | `src/styles/**`, `src/app/**`, `src/components/shell/**`, `src/components/ui/**`, `src/components/controls/ControlBar.tsx` | T2 | DONE | session |
| T4 | Scene: layout data + SVG canvas | `src/scene/layout.ts`, `src/scene/geometry.ts`, `src/components/canvas/**` *(except AnimationDirector)* | C1–C3 | DONE | session |
| T5 | Store + engines | `src/state/**`, `src/engine/**` *(except registry)*, `src/components/canvas/AnimationDirector.tsx`, `src/lib/keyboard.ts` | C1–C6 | DONE | session |
| T6 | Panels (explain / OS state / packet) | `src/components/panels/**` | C1, C4, T3 | DONE | agent |
| T7 | Timeline + overlays | `src/components/timeline/**`, `src/components/overlays/**`, `src/components/controls/SearchPalette.tsx` | C1, C4, T3 | DONE | agent |
| T8 | Content pipeline + integration | `scripts/**`, `src/data/index.ts`, `src/data/generated/**` | C1, C8, C10, all CONTENT-* | DONE | session |
| T9 | QA + static export | *(nothing — reports only)* | T3–T8 | DONE | session |

**Note:** `src/scene/modeColors.ts`, `src/scene/layerViews.ts` and `src/engine/registry.ts`
were written by the integrator (T5) because other modules needed them as contracts —
T4 consumes them and must not edit them.

## Content tasks

Content is pure data; these are fully parallel and machine-independent. Schema:
`docs/DATA_MODEL.md` + `src/data/types.ts`. Rules: `docs/AGENT_PROTOCOL.md` §5.

| ID | Scope | Owns | Status | Notes |
|----|-------|------|--------|-------|
| CONTENT-01 | Dossiers: all 87 components | `content/src/data-components.js` | DONE | 87 keys, verified complete |
| CONTENT-02 | Dossiers: net/hw supplement | `content/src/data-components-b.js` | DONE | 21 keys (merged over 01) |
| CONTENT-03 | Dossiers: dns/cf/app/db supplement | `content/src/data-components-c.js` | DONE | 29 keys (merged over 01) |
| CONTENT-04 | Steps ch 1–8 | `content/src/data-steps-a.js` | DONE | 60 steps |
| CONTENT-05 | Steps ch 9–16 | `content/src/data-steps-b.js` | DONE | 62 steps |
| CONTENT-06 | Steps ch 17–24 | `content/src/data-steps-c.js` | DONE | 72 steps |
| CONTENT-07 | Chaos scenarios ×5 | `content/src/data-chaos.js` | DONE | 5 scenarios, 45 steps |

**Lesson totals:** 194 main steps + 45 chaos steps · 24/24 chapters · 87 dossiers · `pnpm validate` clean.

## Dependency graph

```text
C1 types ──┬─→ T4 scene ──┐
           │              ├─→ T5 store+engines ──┐
           ├─→ T3 shell ──┼─→ T6 panels ─────────┼─→ T9 QA
           │              └─→ T7 timeline/overlays┤
           └─→ CONTENT-* ──→ T8 pipeline ─────────┘
```

T4, T6, T7 and every CONTENT task can run **fully in parallel** once T3 lands the tokens.
T5 needs T4's registry + layout. T8 needs the content files. T9 is last.
