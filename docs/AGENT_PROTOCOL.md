# Agent Protocol — how to work on this project

This project is built by **many agents, on many machines, in parallel**. This document is
the contract that keeps that from turning into chaos. Read it before touching anything.

> **The rule that matters most:** you may only create or edit files your task **owns**.
> If you believe you need to change a file another task owns, stop and write the request
> into `tasks/_INBOX.md` instead. Never edit it yourself.

## 1. Read order (every agent, every session, no exceptions)

1. `docs/PRD.md` — what we are building and why (vision).
2. `docs/ARCHITECTURE.md` — how the system is put together.
3. `docs/CONTRACTS.md` — **frozen interfaces**. This is the source of truth that lets
   parallel work compose. Never violate it; never silently change it.
4. `docs/DESIGN_SYSTEM.md` — if your task renders anything.
5. `docs/DATA_MODEL.md` — if your task touches lesson content or data.
6. `docs/ANIMATION_SYSTEM.md` — if your task touches motion.
7. Your task brief: `tasks/<TASK-ID>.md`.

If the task brief and the contracts disagree, **the contracts win** — and you log the
conflict in `tasks/_INBOX.md`.

## 2. Claiming work

- The board is `docs/TASKS.md`. Each row has a status: `TODO` / `WIP` / `REVIEW` / `DONE`.
- Claim by setting the row to `WIP` with your machine + agent name and the date, in one
  small commit: `chore(board): claim T4 (macbook/agent-a)`.
- One agent per task. Tasks are sized so this is never a bottleneck.
- If a task is blocked, set it back to `TODO`, and write why in `tasks/_INBOX.md`.

## 3. File ownership

Every task brief has an **OWNS** section listing exact paths. Ownership is exclusive.
Generated files (`src/data/generated/**`) are owned by the content pipeline task; nobody
hand-edits them, ever.

Shared files that **no task owns** and that only the integrator may change:
`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `docs/CONTRACTS.md`.
Need a dependency? Request it in `tasks/_INBOX.md`.

## 4. Definition of Done (all tasks)

A task is `DONE` only when all of these hold:

1. `pnpm typecheck` passes (zero TS errors, strict mode).
2. `pnpm lint` passes.
3. `pnpm build` still succeeds.
4. The brief's **ACCEPTANCE** bullets are all demonstrably true.
5. The brief's **VERIFY** command runs clean, and you paste its output in the commit body.
6. You changed **no file outside OWNS**.
7. You updated your row on the board to `DONE`.

## 5. Content authoring rules (CONTENT-* tasks)

- Content is **pure data**, authored in `content/src/*.js` as a single
  `window.<NAME> = …;` statement, plain ES2019 — no imports, no exports, no functions,
  no comments beyond a one-line header.
- The schema is `docs/DATA_MODEL.md` + `src/data/types.ts`. Both are frozen contracts.
- The **cast of characters** (IP addresses, MACs, ports, PIDs, hostnames) in
  `docs/DATA_MODEL.md` is canonical. Never invent a different IP for the same machine —
  cross-file consistency is what makes the simulation feel real.
- Voice: confident, precise, occasionally witty. Real function names, real RFCs, real
  sysctls. Misconceptions must be ones engineers actually hold. No filler steps.
- Every step needs all ten `explain` keys. No exceptions, no placeholders.
- Verify with the exact node one-liner in your brief before marking DONE.

## 6. Code conventions

- TypeScript strict. No `any` (use `unknown` + narrowing). No non-null `!` without a
  comment explaining the invariant.
- React function components, named exports. Client components carry `'use client'`.
- **No animation values in React state** — ever. See `docs/ARCHITECTURE.md` §2.
- Styling: Tailwind utilities + the CSS custom properties in `src/styles/tokens.css`.
  Never hard-code a hex color in a component; if you need a new color, it goes in tokens
  (request via `_INBOX.md`).
- Comments explain *why* (constraints, invariants), never *what*.
- File naming: components `PascalCase.tsx`, everything else `camelCase.ts`.

## 7. Git conventions

- Branch per task: `task/T4-scene`, `task/CONTENT-05-dns`.
- Conventional commits: `feat(scene): …`, `fix(store): …`, `content(ch12): …`,
  `docs(contracts): …`, `chore(board): …`.
- Small commits. Never commit `node_modules`, `.next`, or `src/data/generated`.
- **No attribution trailers** in commit messages.
- Rebase onto `main` before opening a PR; PR title = task id + one line.

## 8. When you finish

1. Run the full gate (§4).
2. Update `docs/TASKS.md`.
3. If you learned something the next agent needs (a gotcha, a decision, a new invariant),
   append it to `docs/DECISIONS.md` as a dated one-liner. That file is append-only and
   safe for concurrent edits.
