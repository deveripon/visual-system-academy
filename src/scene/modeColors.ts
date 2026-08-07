import type { StepMode } from '@/data/types';

/**
 * Mode is semantic — it encodes CPU privilege and packet location — so it is always a
 * pair: a soft fill for the node body and a saturated ink for its text and border.
 * Colour is never the only signal; `MODE_LABEL` ships alongside it.
 */
export interface ModePalette {
  fill: string;
  ink: string;
}

export const MODE_PALETTE: Record<StepMode, ModePalette> = {
  user: { fill: 'var(--user-fill)', ink: 'var(--user-ink)' },
  kernel: { fill: 'var(--kernel-fill)', ink: 'var(--kernel-ink)' },
  hw: { fill: 'var(--hw-fill)', ink: 'var(--hw-ink)' },
  net: { fill: 'var(--net-fill)', ink: 'var(--net-ink)' },
  remote: { fill: 'var(--remote-fill)', ink: 'var(--remote-ink)' },
};

export function modeFill(mode: StepMode): string {
  return MODE_PALETTE[mode].fill;
}

export function modeColor(mode: StepMode): string {
  return MODE_PALETTE[mode].ink;
}

export const MODE_LABEL: Record<StepMode, string> = {
  user: 'user space',
  kernel: 'kernel · ring 0',
  hw: 'hardware',
  net: 'on the wire',
  remote: 'remote machine',
};

/**
 * @deprecated Compatibility shim for the retired world-map canvas (SceneCanvas,
 * engine/timelines). Those modules are unreachable from the shell now and will be
 * deleted; nothing new should use this.
 */
export const MODE_VAR: Record<StepMode, string> = {
  user: '--user-ink',
  kernel: '--kernel-ink',
  hw: '--hw-ink',
  net: '--net-ink',
  remote: '--remote-ink',
};

export const MODE_HINT: Record<StepMode, string> = {
  user: 'CPU ring 3 — unprivileged. Your code runs here.',
  kernel: 'CPU ring 0 — privileged. The kernel owns the machine here.',
  hw: 'Below software: NIC, DMA, PHY, signal.',
  net: 'In flight between machines.',
  remote: 'Someone else’s computer: edge, origin, database.',
};
