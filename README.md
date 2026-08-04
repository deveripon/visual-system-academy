# Visual Systems Academy

An interactive simulator for how computers actually talk to each other.

The flagship lesson — **Packet Odyssey** — animates a single `await fetch()` through every
real layer it touches: V8's compiler pipeline, the system-call boundary, the Linux kernel
network stack, ring buffers and the NIC, your LAN and ISP, the DNS hierarchy, TLS,
Cloudflare's edge, a reverse proxy, Docker networking, NestJS, Prisma, PostgreSQL — and
the entire response journey home.

Not a diagram. A simulator: 194 steps across 24 chapters, 87 clickable components,
branching scenarios, live OS state, quizzes, and failure injection.

## What it does

- **Steps through everything.** Play/pause/next/prev/replay, speed control, autoplay.
  Each step lights one component, moves the packet, and explains what/why/which layer/
  which protocol — plus the common misconception, an analogy, a real Linux command, and
  what this looks like in production.
- **Shows live OS state.** CPU privilege ring, current process and PID, the file
  descriptor table, the TCP state machine, and a user/kernel memory map that lights up
  when a syscall crosses the boundary.
- **Opens the packet.** Wireshark-style encapsulation with real header values — MACs
  rewritten at every L2 hop, TTL decrementing, the NAT rewrite shown before and after.
- **Branches.** Browser or Node? Ethernet or Wi-Fi? DNS cache hit or miss? HTTPS or HTTP?
  Docker or bare metal? Each choice rebuilds the timeline.
- **Breaks on purpose.** "What if?" mode injects real failures — DNS down, SYN blackholed
  by a `DROP` rule, invalid certificate, PostgreSQL refusing connections, `EADDRINUSE` —
  each playing out to the exact browser error you would actually see.
- **Goes deep on any component.** Click anything for its dossier: history, purpose,
  responsibilities, real commands, production notes, interview questions, and links to
  the kernel source paths and RFCs.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 with CSS-variable
tokens · GSAP for animation · panzoom for the canvas · zustand for state ·
prism-react-renderer for code. Fully client-side, static-exportable, no backend.

## Getting started

```bash
pnpm install
pnpm dev          # converts lesson content, then starts the dev server
```

Other scripts:

```bash
pnpm convert       # content/src/*.js  →  src/data/generated/*.ts
pnpm validate      # check every step, dossier and chaos scenario
pnpm typecheck     # tsc --noEmit
pnpm build         # production build (static export capable)
```

## Working on it

This project is built by many agents on many machines in parallel. **Read
[`AGENTS.md`](./AGENTS.md) first** — it is the entry point, and it points at the protocol,
the frozen contracts, and the task board.

| Doc | What it covers |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Start here. The five rules that keep parallel work safe. |
| [`docs/AGENT_PROTOCOL.md`](./docs/AGENT_PROTOCOL.md) | File ownership, claiming work, Definition of Done. |
| [`docs/CONTRACTS.md`](./docs/CONTRACTS.md) | Frozen interfaces. Never violate. |
| [`docs/TASKS.md`](./docs/TASKS.md) | The board — claim a task here. |
| [`docs/PRD.md`](./docs/PRD.md) | Vision, personas, functional requirements. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | How it is put together. |
| [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) | The visual language. |
| [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) | Lesson schema and the canonical cast of characters. |
| [`docs/ANIMATION_SYSTEM.md`](./docs/ANIMATION_SYSTEM.md) | How motion works. |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Where this is going. |

Lessons are **pure data**: adding one means adding content files, not engine code.
