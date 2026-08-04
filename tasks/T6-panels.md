# T6 — Panels: explanation, OS state, packet inspector

**Goal:** the right rail — the part that actually teaches. Everything a learner reads.

## OWNS

- `src/components/panels/RightRail.tsx`, `ExplainPanel.tsx`, `CodePane.tsx`,
  `OsStatePanel.tsx`, `CpuRingIndicator.tsx`, `FdTable.tsx`, `TcpStateMachine.tsx`,
  `MemoryMapWidget.tsx`, `PacketInspector.tsx`

## MUST READ

`docs/AGENT_PROTOCOL.md` → `docs/CONTRACTS.md` C1, C4, C7 → `docs/DESIGN_SYSTEM.md` →
`docs/DATA_MODEL.md` (Step schema).

## Spec

**ExplainPanel** — renders the current step's ten `explain` fields. Not ten identical
rows: give them hierarchy. Suggested treatment — `what` as body prose at the top under the
step title; `why` as a lead-in quote; then a compact metadata strip (component / layer /
abstraction / protocol) in mono; then distinct cards for `misconception` (warn accent),
`analogy` (quiet), `command` (mono, copyable), `production` (remote accent). Mode badge
+ chapter name in the header. Content must swap cleanly on step change (a short fade is
fine — it is React-rendered, not GSAP-driven).

**CodePane** — collapsible, one per `step.code[]` entry, collapsed by default, title in
mono with a disclosure caret. Syntax highlight with `prism-react-renderer`; verify the
`c`, `bash`, `sql` and `jsx` grammars actually render — fall back to plain text rather
than crashing. Only mount the highlighted body when expanded.

**OsStatePanel** — always visible, always live, folded state from `useOsState()`:

- `CpuRingIndicator` — ring 3 / ring 0 dial, colored `--mode-user` / `--mode-kernel`,
  with the literal text `USER MODE` / `KERNEL MODE` (color is never the only signal).
- process line: current process + PID.
- `FdTable` — fd → description rows, mono, newly-added rows highlight briefly.
- `TcpStateMachine` — the real state graph (CLOSED → SYN_SENT → ESTABLISHED → FIN_WAIT_1
  → … ), current state lit, prior path dimmed. Small, legible, not a full RFC diagram.
- `MemoryMapWidget` — stacked user space (JS heap, stack) over kernel space (socket
  buffers, TCP buffers); highlights per `mem: 'user' | 'kernel' | 'copy'`; `'copy'`
  shows the crossing.

**PacketInspector** — Wireshark-style. Layer stack from `step.packet.layers` (outermost
first), each layer a collapsible row; expanding shows `packet.fields[layer]` as
name/value mono pairs. Header shows `packet.label`. When a step has no packet, show a
quiet empty state rather than disappearing (no layout jump).

**RightRail** — hosts the above; desktop = fixed column (~380–420px) with the explanation
scrolling and the OS-state panel pinned; under `lg` it becomes a bottom sheet with
peek/full states and tabs (Explain / State / Packet).

## ACCEPTANCE

- Every one of the ten explain fields is visible for every step (no field silently
  dropped when empty — but content guarantees all ten exist).
- Code panes expand/collapse, highlight correctly for js/c/bash/sql, and copy works.
- OS-state widgets update on every step and are correct after an arbitrary timeline jump
  (they read the fold, never accumulate).
- Packet inspector expands to real header values (MACs, IPs, TTL, ports, seq, flags).
- Keyboard accessible; the panel never traps scroll; `aria-live` announces step changes.
- Under 1024px the rail becomes a usable bottom sheet.

## VERIFY

```bash
pnpm typecheck && pnpm lint
```

Then `pnpm dev`: step through chapters 6→8 (mode switches, fd table, socket states) and
23 (the full RX path) and confirm every widget tracks. Jump backwards and confirm state
is still correct. Screenshot desktop + narrow viewport.
