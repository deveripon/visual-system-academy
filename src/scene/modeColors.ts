import type { StepMode } from '@/data/types';

/** Mode → CSS custom property. Colour is semantic here: it encodes CPU privilege and
 *  packet location, so it must never be chosen for decoration. */
export const MODE_VAR: Record<StepMode, string> = {
  user: '--mode-user',
  kernel: '--mode-kernel',
  hw: '--mode-hw',
  net: '--mode-net',
  remote: '--mode-remote',
};

export function modeColor(mode: StepMode): string {
  return `var(${MODE_VAR[mode]})`;
}

/** Text shown alongside the colour — colour is never the only signal (a11y). */
export const MODE_LABEL: Record<StepMode, string> = {
  user: 'USER MODE',
  kernel: 'KERNEL MODE',
  hw: 'HARDWARE',
  net: 'ON THE WIRE',
  remote: 'REMOTE INFRA',
};

export const MODE_HINT: Record<StepMode, string> = {
  user: 'CPU ring 3 — unprivileged. Your code runs here.',
  kernel: 'CPU ring 0 — privileged. The kernel owns the machine here.',
  hw: 'Below software: NIC, DMA, PHY, signal.',
  net: 'In flight between machines.',
  remote: 'Someone else’s computer: edge, origin, database.',
};
