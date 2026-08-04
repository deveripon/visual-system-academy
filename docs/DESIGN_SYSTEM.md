# Design System

**Direction: mission-control instrument.** One committed aesthetic: a dark blueprint
canvas that feels like Linear × Wireshark × a CPU simulator. Precision, glow, glass.
The signature moment is the **packet-comet** crossing the scene, and the **red aurora**
that floods the kernel zone on every ring 3 → ring 0 transition.

## Color tokens (`styles/tokens.css`)

Base field (one dominant dark, never pure black):

```
--bg-0: #06080f      /* page */          --bg-1: #0a0e1a   /* canvas */
--surface: rgba(148,163,184,.06)         /* glass panel fill */
--surface-2: rgba(148,163,184,.10)       /* hover / raised */
--border: rgba(148,163,184,.14)          --border-strong: rgba(148,163,184,.28)
--text-1: #e6edf6    --text-2: #9aa7ba   --text-3: #5c6a80
```

**Mode accents** — the semantic core; CPU privilege / packet location is *always* color-keyed:

```
--mode-user:   #4cc2ff   /* ring 3, user space, browser */
--mode-kernel: #ff4d6d   /* ring 0, kernel space */
--mode-hw:     #b58cff   /* NIC, DMA, physical */
--mode-net:    #3ddc97   /* on the wire, LAN→internet */
--mode-remote: #ffb347   /* remote infrastructure (edge, origin, DB) */
--ok: #3ddc97  --warn: #ffb347  --err: #ff4d6d
```

Path semantics: completed edges `--ok`, active edge animated dash in current mode color,
future edges `--text-3` at 35% opacity.

Zone hues: each of the 12 zones tints its glass frame with its dominant mode color at
4–6% alpha; zone label uses the mode color at 70%.

## Typography

- **UI:** system stack `-apple-system, "SF Pro", Inter, Segoe UI, sans-serif` — quiet, product-grade.
- **Technical voice (labels, values, packet fields, commands):**
  `"SF Mono", "JetBrains Mono", ui-monospace, monospace`. Monospace-forward identity —
  node labels, state values, timeline chips, and header fields are all mono. This is the
  face of the product.
- Scale: 11/12/13px mono for instrument text; 14px UI body; 16–20px panel headings;
  weight 450–600, letter-spacing +0.02em on small mono caps labels.

## Surfaces

Glass recipe (panels, cards, dossier modal):

```
background: var(--surface);
backdrop-filter: blur(14px) saturate(1.3);
border: 1px solid var(--border);
border-radius: 12px;                      /* 8px nested, 16px modal */
box-shadow: 0 8px 32px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);
```

Canvas atmosphere: radial mesh (two ultra-soft mode-color glows at 3% alpha, corners) +
a 48px blueprint grid (`--border` at 30%) + fine noise. Never flat.

## Motion rules (see ANIMATION_SYSTEM.md for engine mechanics)

- Durations: micro 150ms · UI 250ms · step transition 600ms · packet flight 900–1400ms
  (scaled by `speed`).
- Easing: UI `power2.out`; packet flight `sine.inOut`; aura floods `power1.inOut`;
  irq flash `expo.out`.
- Motion must *mean* something: reveal hierarchy (dim-out → flight → light-in), reinforce
  state (aura on mode switch), or stage information (panel content swaps after arrival).
  No decorative hovers beyond 150ms brightness/border shifts.
- `prefers-reduced-motion`: crossfades + teleports; zero travel animation.

## Iconography

Single inline SVG set, 1.6px stroke, round caps, 24px grid (chip, memory, disk, globe,
shield, router, database, bolt, layers). Node glyphs are minimal geometric marks in the
node's mode color — no emoji anywhere in the scene.

## Component states

- Node: `idle` (dim 40%) → `active` (full, glow filter, 1.04 scale pulse) → `visited`
  (65%, ok-tinted border). Only ONE node holds the glow filter at a time (perf + focus).
- Timeline chip: future (text-3) / current (mode color, filled) / done (ok, check tick).
- Buttons: ghost by default; primary = current mode color at 14% fill, 1px mode border.

## Accessibility

Contrast ≥ 4.5:1 for all text on glass (verify against --bg-0, not the blur). Mode is
always shown as text + color (the ModeIndicator pill). Focus rings: 2px `--mode-user`
outset. All overlays trap focus; Esc closes top-most.
