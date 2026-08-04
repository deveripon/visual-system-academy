<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Visual Systems Academy — start here

You are working on **Visual Systems Academy**: an interactive simulator that teaches
operating systems, Linux networking, browser internals and internet architecture by
animating a single `fetch()` through every real layer — V8 → syscall → Linux kernel →
NIC → LAN → ISP → DNS → TLS → Cloudflare → reverse proxy → Docker → NestJS → Prisma →
PostgreSQL — and the entire response journey home.

This project is built by **many agents, on many machines, in parallel**. That only works
because everyone follows the same protocol. Do not skip this page.

## 1. Read these, in this order, before writing any code

| # | File | Why |
|---|------|-----|
| 1 | `docs/AGENT_PROTOCOL.md` | **The rules.** File ownership, claiming work, Definition of Done. |
| 2 | `docs/CONTRACTS.md` | **Frozen interfaces.** The reason parallel work composes. Never violate. |
| 3 | `docs/TASKS.md` | The board. Find your task, claim it. |
| 4 | `tasks/<YOUR-TASK>.md` | Your brief: OWNS, spec, acceptance, verify. |
| 5 | `docs/PRD.md` | Vision and the numbered functional requirements. |
| 6 | `docs/ARCHITECTURE.md` | How it is put together, and the three load-bearing decisions. |

Then, only if your task touches that area: `docs/DESIGN_SYSTEM.md` (anything visual),
`docs/DATA_MODEL.md` (lesson content), `docs/ANIMATION_SYSTEM.md` (motion),
`docs/DECISIONS.md` (why things are the way they are).

## 2. The five rules that keep parallel work from colliding

1. **Only touch files your task OWNS.** Every brief lists exact paths. Need something
   else changed? Write it in `tasks/_INBOX.md` — never edit another task's files.
2. **Contracts win.** If your brief and `docs/CONTRACTS.md` disagree, follow the
   contract and log the conflict in `tasks/_INBOX.md`.
3. **`NodeId` is the universal join key.** All 87 component ids live in
   `src/data/types.ts`. Scene layout, lesson steps, dossiers and search all key off it.
   Never invent a component id that is not in that union.
4. **The cast of characters is canonical.** IPs, MACs, ports, PIDs, hostnames, ISN, TTL
   (`docs/DATA_MODEL.md`) are fixed. The whole simulation feels real only because every
   chapter agrees on them. Need a new value? `tasks/_INBOX.md`.
5. **No animation state in React.** GSAP owns per-step visuals via
   `src/engine/registry.ts`; React renders the scene once. This is what keeps 60fps with
   87 nodes and it is not negotiable.

## 3. Definition of Done (every task)

```bash
pnpm convert && pnpm validate && pnpm typecheck && pnpm lint && pnpm build
```

All five green, every ACCEPTANCE bullet in your brief demonstrably true, no file touched
outside OWNS, board row updated to `DONE`, and anything the next agent would otherwise
rediscover appended to `docs/DECISIONS.md`.

## 4. Layout

```text
docs/        vision, architecture, design system, data model, protocol, contracts, board
tasks/       one self-contained brief per task + _INBOX.md for cross-task requests
content/src/ lesson content as plain-JS data (window.X = …), authored in parallel
scripts/     convert-content.mjs — content → typed TS
src/data/    types.ts (frozen model), generated/ (never hand-edit), index.ts, validate.ts
src/scene/   layout data: 12 zones, 87 nodes, edges, layer views
src/engine/  registry, step/scenario/camera/effects/packet engines, GSAP timelines
src/state/   zustand store, deterministic OS-state fold, selectors
src/components/  shell · canvas · panels · timeline · overlays · controls · ui
```

## 5. Conventions

TypeScript strict, no `any`. React function components, named exports, `'use client'`
where needed. Tailwind utilities plus the CSS custom properties in `src/styles/tokens.css`
— never a hard-coded hex in a component. Comments explain *why*, not *what*. Branch per
task (`task/T4-scene`), conventional commits, **no attribution trailers**. Never commit
`node_modules`, `.next`, or `src/data/generated`.

## 6. Content authoring (CONTENT-* tasks)

Content is pure data — one file per task, a single `window.<NAME> = …;` statement, plain
ES2019, no imports/exports/functions. Schema: `docs/DATA_MODEL.md` + `src/data/types.ts`.
Voice: confident, precise, occasionally witty; real function names, real RFCs, real
sysctls; misconceptions engineers actually hold; every step teaches something. All ten
`explain` keys on every step, no placeholders. Verify with the node one-liner in
`tasks/CONTENT-template.md` before marking DONE.
