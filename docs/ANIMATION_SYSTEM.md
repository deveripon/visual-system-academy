# Animation System

GSAP is the sole animator. React never animates; the store never holds animation values.

## The director

`components/canvas/AnimationDirector.tsx` renders `null`. It:

1. Uses `useGSAP({ scope })` so a context reverts everything on unmount (StrictMode-safe).
2. Subscribes transiently: `store.subscribe(s => [s.stepIndex, s.timelineVersion, s.status, s.speed], handler)`
   — animation never triggers a React render.
3. Owns exactly **one live timeline** in a ref. Every transition: `tl.kill()` first.
   A monotonically increasing transition token discards stale `onComplete`s from rapid input.

## Step transition anatomy (±1 step)

```text
label 'out'     dim previous node (active → visited), fade its glow      150ms
label 'flight'  packet flies from → node along edge route                900–1400ms
                (label swap, mode-colored trail; edge gets animated dash)
label 'arrive'  light-in current node (glow filter moves here, 1.04 pulse) 250ms
label 'effects' step effects fire (irq flash, ring fill, ctx switch…)    150–400ms
label 'aura'    mode aura floods/recedes if step.mode changed            600ms
```

`tl.timeScale(store.speed)`; a store subscription retimes the live timeline when speed
changes. Autoplay: `onComplete → status === 'playing' && store.next()` — the store drives
GSAP; GSAP only pings the store on completion, never both directions in one tick.

**Jumps** (timeline click, search, chapter pill, restart, branch/chaos rebuild) skip
motion entirely: `applyStepStatics(step, foldedState)` — instant `gsap.set` of node
states (visited/active/future), edge colors, aura, packet position/visibility, and
widget counters derived from the fold.

## Packet motion (`engine/packetMotion.ts`)

- Route = `registry.edgeRoute(from, to)` — BFS over the edge graph for multi-hop flights.
- Per hop: tween a progress value 0→1; `onUpdate` sets the packet group's transform from
  `path.getPointAtLength(progress * totalLength)`. Total lengths cached once per edge
  (the scene is static). No MotionPathPlugin needed.
- Edges are never `display:none` (breaks getPointAtLength) — hide via `opacity: 0`.
- The packet carries its protocol label (`SYN`, `DNS query`, `ClientHello`, `200 OK`);
  label swaps at flight start. Trail = 3 trailing circles at decreasing opacity, same tween
  with `delay: i * 0.04`.

## Effects registry (`engine/effectsEngine.ts`)

| id | visual |
|----|--------|
| `irq` | lightning bolt flash NIC→CPU line, `expo.out`, screen-corner tick |
| `ctx` | scheduler node: two process chips swap positions |
| `ring+ / ring-` | ring-buffer slot rects fill/drain (from folded counter) |
| `pool+ / pool-` | connection-pool slot lights (from folded counter) |
| `queue+ / queue-` | accept-queue bar grows/shrinks |
| `flash` | one-shot white-out pulse on the step's node (mode switches) |
| `zoomout` | camera pulls back to frame the whole journey for recap beats |

Effects are *idempotent decorations*: their persistent end-state (counters) always comes
from the fold, so replay/jump can't drift.

## Mode aura

`modeAura(tl, mode)`: the kernel zone (and CPU ring widget) tints with `--mode-kernel`
red on user→kernel; recedes on kernel→user. Same pattern tints hardware violet and the
wire path green. The ModeIndicator pill crossfades text + color simultaneously — color is
never the only signal.

## Camera (`engine/cameraEngine.ts`)

- Follows `step.node` by default (`focusNode`: center + comfortable scale, 700ms
  `power2.inOut`), unless the user pinned a layer view or panned manually
  (`layerView: 'free'`).
- panzoom is the single transform writer: GSAP tweens a `{x,y,scale}` proxy and applies
  via `pz.zoomAbs()/moveTo()` under a `programmatic` flag; unflagged panzoom events =
  user gesture → `camera.cancel()`.
- Fit math from `scene/layout.ts` rects (never `getBBox`): works pre-paint, deterministic.
- Layer views (`scene/layerViews.ts`): camera rect + zone emphasis (non-relevant zones
  dim to 25%).

## Reduced motion

`engine/reducedMotion.ts` wraps `gsap.matchMedia()`. When
`prefers-reduced-motion: reduce`: step transitions become `applyStepStatics` + 150ms
opacity crossfade; the packet fades in at the destination; camera moves are instant.
