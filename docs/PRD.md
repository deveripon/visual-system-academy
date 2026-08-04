# Visual Systems Academy — Product Requirements

**Status:** v0 — Milestone 0 in progress · **Owner:** Ripon · **Last updated:** 2026-08-04

## 1. Vision

The world's most advanced interactive visualization platform for how computers actually
talk to each other. Not a diagram, not a video — a **simulator**: an OS simulator, a
network simulator, and a code-execution visualizer fused into one instrument.

The flagship lesson, **Packet Odyssey**, animates a single `await fetch()` through every
real layer: V8's compiler pipeline → the runtime → the system-call boundary → the Linux
kernel network stack → the NIC → LAN → ISP → the DNS hierarchy → TLS → Cloudflare → a
reverse proxy → Docker networking → NestJS → Prisma → PostgreSQL — and the entire
response journey home. Nothing skipped, nothing hand-waved.

## 2. Goals

1. Teach OS internals, Linux networking, browser internals, and internet architecture
   **visually**, with senior-engineer accuracy (real function names, real RFCs, real sysctls).
2. Make the invisible visible: CPU privilege rings, FD tables, sk_buffs, ring buffers,
   IRQ→softirq→NAPI, NAT rewrites, TTL decrements, TLS flights, connection pools.
3. Let learners **explore counterfactuals**: branch decisions (browser vs Node, Ethernet
   vs Wi-Fi, cache hit vs miss, HTTPS vs HTTP, Docker vs bare metal) and failure
   injection ("What if DNS is down?").
4. Be a foundation for a future product: lessons as data, zero code changes to add one.

## 3. Personas

- **The self-taught backend dev** — ships NestJS APIs daily, has never seen what happens
  under `fetch()`. Wants the "aha" of connecting their code to the kernel.
- **The interview candidate** — preparing for infra/SRE/backend interviews; needs the
  classic questions ("what happens when you type a URL?") grounded in real mechanism.
- **The CS student** — has the theory (OSI layers, TCP state machine) but has never
  watched it move.
- **The educator** — wants a projectable, steppable teaching instrument for OS/networking
  courses.

## 4. Functional Requirements

FR1 **Step engine** — play/pause, next/prev, replay step, restart, speed (0.5–3×),
    autoplay with per-step pause (educational mode default: manual stepping).
FR2 **Architecture canvas** — pan/zoomable SVG scene: 12 zones, 87 components, journey
    edges; animated glowing packet; current component lit, others dimmed; completed path
    green, future gray.
FR3 **Explanation panel** — per step: what / why / component / OS layer / abstraction /
    protocol / misconception / analogy / Linux command / production example.
FR4 **Collapsible code panes** — per step: the JS being run, the syscalls involved, the
    kernel call path — syntax highlighted.
FR5 **Event-based timeline** — 24 chapters (JavaScript → … → Response); chapter click
    jumps; current chapter expands into its clickable steps; progress coloring.
FR6 **Live OS-state panel** — CPU mode (ring 3/0), current process + PID, FD table,
    TCP socket state machine, user/kernel memory map with crossing animation.
FR7 **Packet inspector** — Wireshark-style encapsulation stack; expandable per-layer
    header fields with live values (MACs, IPs, TTL, ports, seq, flags).
FR8 **Decision branches** — at branch steps the simulation pauses and the learner picks
    a path (browser/node, ethernet/wifi, dnscache hit/miss, https/http, docker/baremetal);
    the timeline rebuilds accordingly; defaults allow uninterrupted autoplay.
FR9 **Quiz mode** — optional gating questions at pivotal moments; correct answer advances;
    explanation shown either way.
FR10 **Chaos mode ("What if?")** — inject failures: DNS down, SYN blackhole, invalid
     certificate, PostgreSQL down, EADDRINUSE; each plays a real failure sequence ending
     in the browser-visible error (ERR_NAME_NOT_RESOLVED, ERR_CONNECTION_TIMED_OUT, …).
FR11 **Component dossiers** — click any component: description, history, purpose,
     responsibilities, Linux commands, production notes, interview questions, kernel
     source paths / RFCs / man pages, related components.
FR12 **Search** — palette over components + steps; result click jumps camera/timeline.
FR13 **Layer views** — Application / OS / Kernel / Network / Hardware / Internet /
     Production presets: camera framing + zone emphasis.
FR14 **Production mode** — toggle that reskins the story to a real deployment
     (Island Tours: Cloudflare → Caddy → Docker → NestJS → Prisma → PostgreSQL) with
     real code (`await prisma.tour.findMany(...)`).
FR15 **Keyboard-first** — ←/→ step, Space play/pause, `/` search, `r` replay, `f` fit,
     `Esc` close, `?` help.

## 5. Non-Functional Requirements

- **Accuracy** — content reviewed at senior-kernel-engineer level; misconceptions
  addressed are ones engineers actually hold.
- **Performance** — 60fps animation; no React re-render on any animation frame; first
  route load small (simulator is a lazy client-only chunk); static-exportable.
- **Accessibility** — full keyboard operation, aria-live step narration, focus traps,
  reduced-motion support, color never the sole signal.
- **Responsive** — desktop-first three-pane layout; < lg the right rail becomes a bottom
  sheet; timeline scrolls horizontally.
- **Extensibility** — lessons are pure data; adding a lesson requires zero engine changes.

## 6. Success (Milestone 0)

- All 24 chapters playable end-to-end with zero console errors.
- Every FR above demonstrable in the running app.
- `pnpm build` static export clean.

## 7. Out of Scope (see ROADMAP.md)

Accounts/auth, progress persistence, AI lesson generation, marketplace, Kubernetes/Redis
lesson packs, Bengali localization, audio narration, multiplayer/classroom mode.
