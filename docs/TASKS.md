# Task Board

Claim a task by setting its status to `WIP` with your machine/agent name. Read
`docs/AGENT_PROTOCOL.md` first. Full brief for each task lives in `tasks/<ID>.md`.

**Legend:** `TODO` available · `WIP` claimed · `REVIEW` done, awaiting integration · `DONE`

| ID | Task | Owns (exclusive) | Depends on | Status | Claimed by |
|----|------|------------------|-----------|--------|-----------|
| T1 | Scaffold + deps | *(shared config)* | — | DONE | session |
| T2 | Docs suite | `docs/**` | — | DONE | session |
| T3 | Design tokens + app shell | `src/styles/**`, `src/app/**`, `src/components/shell/**`, `src/components/ui/**` | T2 | WIP | session |
| T4 | Scene: layout data + SVG canvas | `src/scene/**`, `src/components/canvas/**` *(except AnimationDirector)*, `src/engine/registry.ts` | C1–C3 | TODO | |
| T5 | Store + engines | `src/state/**`, `src/engine/**` *(except registry)*, `src/components/canvas/AnimationDirector.tsx`, `src/lib/keyboard.ts` | C1–C6, T4 | TODO | |
| T6 | Panels (explain / OS state / packet) | `src/components/panels/**` | C1, C4, T3 | TODO | |
| T7 | Timeline + overlays | `src/components/timeline/**`, `src/components/overlays/**` | C1, C4, T3 | TODO | |
| T8 | Content pipeline + integration | `scripts/**`, `src/data/index.ts`, `src/data/validate.ts`, `src/data/generated/**` | C1, C8, C10, all CONTENT-* | TODO | |
| T9 | QA + static export | *(nothing — reports only)* | T3–T8 | TODO | |

## Content tasks

Content is pure data; these are fully parallel and machine-independent. Schema:
`docs/DATA_MODEL.md` + `src/data/types.ts`. Rules: `docs/AGENT_PROTOCOL.md` §5.

| ID | Scope | Owns | Status | Notes |
|----|-------|------|--------|-------|
| CONTENT-01 | Dossiers: browser, node, kernel(part) | `content/src/data-components.js` | DONE | 43 keys |
| CONTENT-02 | Dossiers: kernel(rest), hw, lan, isp, internet | `content/src/data-components-b.js` | WIP | 32 keys |
| CONTENT-03 | Dossiers: dns, cloudflare, origin, app, db | `content/src/data-components-c.js` | WIP | 29 keys |
| CONTENT-04 | Steps ch 1–8 | `content/src/data-steps-a.js` | DONE | 60 steps |
| CONTENT-05 | Steps ch 9–12 | `content/src/data-steps-b1.js` | WIP | |
| CONTENT-06 | Steps ch 13–16 | `content/src/data-steps-b2.js` | WIP | |
| CONTENT-07 | Steps ch 17–18 | `content/src/data-steps-c.js` | DONE | 17 steps |
| CONTENT-08 | Steps ch 19–24 | `content/src/data-steps-c2.js` | WIP | |
| CONTENT-09 | Chaos scenarios ×5 | `content/src/data-chaos.js` | WIP | |

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
