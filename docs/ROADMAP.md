# Roadmap

## M0 — Playable core (now)

Docs suite · scaffold · design system · SVG scene (12 zones / 87 nodes) · engines
(step/scenario/camera/effects/packet) · all v1 surfaces (explain, OS-state, packet
inspector, chapter timeline, branches, quiz, chaos, dossiers, search, layer views,
production mode) · Packet Odyssey lesson fully integrated · browser QA + static export.

## M1 — Hardening & polish

- Unit tests: `foldOsState` (jump ≡ walk property), `buildTimeline` × all flag combos +
  chaos splices, `nearestStepIndex`.
- Playwright smoke: full chapter walk, each branch, one chaos run.
- Perf budget CI (bundle analyzer), Lighthouse pass, cross-browser (Safari backdrop-filter).
- Mobile UX polish (bottom sheet gestures, touch timeline).
- Content review pass: technical accuracy audit of all ~170 steps + 87 dossiers.

## M2 — Platform foundations (the SaaS turn)

- Lesson registry: multiple lessons as data packages; lesson picker home page.
- Progress persistence (localStorage first; then accounts — Auth.js + Postgres/Prisma,
  fittingly).
- Shareable deep links (`/sim?step=tcp-syn-build&flags=…`).
- Bengali localization (i18n framework; content translation pipeline).

## M3 — Content expansion packs

- **Kubernetes**: kube-proxy, CNI, Service/Ingress packet paths.
- **Redis**: cache-aside flow spliced into the Prisma chapter.
- **Kafka / queues**: async fan-out journey.
- **Linux ↔ macOS differences** lens; IPv6-first variant; QUIC/HTTP-3 branch.
- Chaos library growth: PMTU blackhole, conntrack table full, TIME_WAIT exhaustion,
  BGP route leak.

## M4 — The academy

- AI lesson generation: schema-constrained authoring assistant (the Step/Dossier types
  are already the contract).
- Instructor mode: presenter view, classroom sync (multiplayer stepping).
- Course marketplace; premium packs; certificates.

## Guiding constraint

Everything stays **lessons-as-data**. If a feature requires the engine to know about a
specific protocol, the design is wrong.
