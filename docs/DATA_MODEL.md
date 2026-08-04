# Data Model

Lessons are **pure data**. The engine knows nothing about TCP or V8; it renders whatever
the lesson declares. Adding a lesson = adding data files, zero engine changes.

## Cast of characters (fixed values used consistently across all content)

- Story: e-commerce SPA calls `await fetch('https://api.shop.dev/products?limit=20')`
- Production-mode story: **Island Tours** — `fetch('https://api.islandtours.io/tours')`,
  Caddy instead of nginx, `await prisma.tour.findMany({ take: 20 })`
- Client: `192.168.1.23` · MAC `3c:07:54:6a:2b:91` · ephemeral port `51324`
- Router: `192.168.1.1` / WAN `203.0.113.77` · MAC `a4:91:b1:0c:44:e2`
- Resolver `1.1.1.1` · `api.shop.dev` → Cloudflare anycast `104.18.32.7`
- Origin `198.51.100.10` · docker0 `172.17.0.1` · container `172.17.0.2` (443→3000)
- PostgreSQL 16 at `10.0.0.12:5432` · client ISN `1128394821` · TTL 64 · MSS 1460
- PIDs: chrome renderer 4821, network service 4903, node (server) 1, PG backend 8842

## Core types (`src/data/types.ts`)

- `NodeId` — literal union of all **87** canvas component ids across 12 zones
  (browser 12, node.js 3, kernel 27, hardware 5, lan 4, isp 4, internet 3, dns 5,
  cloudflare 6, origin 6, app 6, db 6). Compile-time source of truth for layout,
  steps, and dossiers.
- `ScenarioFlags` — `{ runtime: 'browser'|'node', dnscache: 'miss'|'hit',
  medium: 'ethernet'|'wifi', scheme: 'https'|'http', deploy: 'docker'|'baremetal' }`
  (first value = default; defaults let autoplay run without interaction).
- `StepMode` — `'user' | 'kernel' | 'hw' | 'net' | 'remote'`.

### Step

```ts
interface Step {
  id: string;                 // unique kebab-case across the whole lesson
  chapter: number;            // 1–24, event-based timeline grouping
  title: string;
  node: NodeId;               // highlighted component
  from?: NodeId;              // packet origin (default: previous step's node)
  mode: StepMode;
  packet?: { label: string; layers: PacketLayer[];
             fields?: Partial<Record<PacketLayer, Record<string, string>>> };
  state?: {                   // OS-state PATCH — only keys that change
    mode?: StepMode; proc?: string; sock?: TcpState;
    fds?: [fd: string, desc: string][];   // full table replacement
    mem?: 'user' | 'kernel' | 'copy';
  };
  effects?: EffectId[];       // irq ctx ring+ ring- pool+ pool- queue+ queue- flash zoomout
  when?: Partial<ScenarioFlags>;          // step active only if all keys match
  branch?: { key: keyof ScenarioFlags; question: string;
             options: { value: string; label: string; hint?: string }[] };
  quiz?: { q: string; options: string[]; answer: number; explain: string };
  explain: { what; why; component; layer; abstraction; protocol;
             misconception; analogy; command; production };   // all 10 required
  code?: { title: string; lang: 'js'|'c'|'cpp'|'bash'|'sql'; code: string }[];
  prod?: DeepPartial<Step>;   // production-mode shallow-merge overrides
}
```

### ComponentDossier (one per NodeId — 87 entries)

`name, tagline, description, history, purpose, responsibilities[], commands[{cmd,note}],
production, interview[], sources[] (kernel paths / RFCs / man pages), related: NodeId[]`

### ChaosScenario

`{ label, icon, entryAfter: StepId, steps: Step[] }` — spliced into the active timeline
after `entryAfter`, playing to the browser-visible error. Five scenarios: `dnsdown`,
`synfail`, `certfail`, `dbdown`, `portinuse`.

## Timeline semantics

- **Active timeline** = `ALL_STEPS.filter(when matches flags)`, then chaos splice.
- **Branch steps** have no `when`; they pause playback (`awaiting-branch`) and render a
  BranchCard; choosing sets the flag, rebuilds the timeline, and advances past the branch.
- **State folding:** displayed OS state at N = pure fold of `state` patches + effect
  counter deltas over active steps 0..N. Jumps refold — never accumulate through
  animation side effects.
- **Prod mode** is a content overlay (title/explain/code swaps), not a timeline change.

## Chapters (24, event-based)

1 JavaScript Code · 2 V8 Compilation · 3 Runtime ⑂ · 4 fetch() Internals · 5 DNS ⑂ ·
6 System Call · 7 Socket Creation · 8 TCP SYN Egress · 9 NIC & Hardware ⑂ · 10 LAN & NAT ·
11 ISP & Backbone · 12 TCP Handshake · 13 TLS ⑂ · 14 HTTP Request · 15 Cloudflare Edge ·
16 To the Origin · 17 Docker ⑂ · 18 NestJS · 19 Prisma & Pool · 20 PostgreSQL ·
21 Response: DB→Edge · 22 Response: Internet→Home · 23 Kernel RX Path · 24 Back in the Browser
(⑂ = contains a decision branch)

## Authoring & build pipeline

1. Content authored as standalone ES2019 files in `content/src/`:
   `data-components.js`, `data-steps-a.js` (ch 1–8), `data-steps-b.js` (9–16),
   `data-steps-c.js` (17–24), `data-chaos.js` — each a single `window.X = …;` statement.
2. `scripts/convert-content.mjs` (predev/prebuild) → `src/data/generated/*.ts`
   (`const X = …; export default X;` + GENERATED banner). Never hand-edit generated files.
3. `src/data/index.ts` assembles `ALL_STEPS`, `CHAOS`; dossiers load lazily (idle prefetch).
4. `src/data/validate.ts` (dev-only) fails loudly on: duplicate step ids; invalid
   node/from/related refs; chapter out of 1–24 or non-monotonic; missing explain keys;
   quiz answer out of range; unresolvable `entryAfter`; missing dossier for any NodeId;
   unknown effect ids.

## Voice rules

Confident, precise, occasionally witty. Real function names (`tcp_v4_connect`,
`ep_poll_callback`), real files, real RFCs, real sysctls. Misconceptions engineers
actually hold. Analogies concrete and fresh. Every step teaches; no filler.
