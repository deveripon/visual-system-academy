export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NODE_W = 168;
export const NODE_H = 64;
export const NODE_GAP = 28;
/** Room for the zone's label above its first row of nodes. */
export const ZONE_PAD_TOP = 56;
export const ZONE_PAD = 24;

export function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Zone size needed to hold `count` nodes in `cols` columns, exactly. */
export function zoneSize(count: number, cols: number): { w: number; h: number } {
  const rows = Math.ceil(count / cols);
  return {
    w: cols * NODE_W + (cols - 1) * NODE_GAP + ZONE_PAD * 2,
    h: rows * NODE_H + (rows - 1) * NODE_GAP + ZONE_PAD_TOP + ZONE_PAD,
  };
}

/** Grid-pack nodes inside a zone, in journey order, left-to-right then down. */
export function packNodes(zone: Rect, count: number, cols: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push({
      x: zone.x + ZONE_PAD + col * (NODE_W + NODE_GAP),
      y: zone.y + ZONE_PAD_TOP + row * (NODE_H + NODE_GAP),
      w: NODE_W,
      h: NODE_H,
    });
  }
  return out;
}

/**
 * An orthogonal-ish connector between two node rects. Straight when the nodes share a
 * row or column, otherwise a smooth cubic that leaves horizontally and arrives
 * horizontally — reads as a circuit trace rather than a spider web.
 */
export function connectorPath(a: Rect, b: Rect): string {
  const ac = centerOf(a);
  const bc = centerOf(b);
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;

  // Same row: leave from the facing edges, straight line.
  if (Math.abs(dy) < 4) {
    const x1 = dx >= 0 ? a.x + a.w : a.x;
    const x2 = dx >= 0 ? b.x : b.x + b.w;
    return `M ${x1} ${ac.y} L ${x2} ${bc.y}`;
  }

  // Same column: straight vertical between facing edges.
  if (Math.abs(dx) < 4) {
    const y1 = dy >= 0 ? a.y + a.h : a.y;
    const y2 = dy >= 0 ? b.y : b.y + b.h;
    return `M ${ac.x} ${y1} L ${bc.x} ${y2}`;
  }

  // Otherwise: exit the side facing the target, curve, enter the facing side.
  const x1 = dx >= 0 ? a.x + a.w : a.x;
  const x2 = dx >= 0 ? b.x : b.x + b.w;
  const bend = Math.min(Math.abs(x2 - x1) / 2, 120) * (dx >= 0 ? 1 : -1);
  return `M ${x1} ${ac.y} C ${x1 + bend} ${ac.y}, ${x2 - bend} ${bc.y}, ${x2} ${bc.y}`;
}
