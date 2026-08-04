import type { NodeId, ZoneId } from '@/data/types';
import { EDGES } from '@/scene/layout';

export type EdgeId = string;

export function edgeId(from: NodeId, to: NodeId): EdgeId {
  return `${from}__${to}`;
}

const nodes = new Map<NodeId, SVGGElement>();
const edges = new Map<EdgeId, SVGPathElement>();
const zones = new Map<ZoneId, SVGGElement>();
let packetEl: SVGGElement | null = null;

/** Adjacency built once from the static edge list; used for multi-hop packet routing. */
let adjacency: Map<NodeId, { to: NodeId; edge: EdgeId }[]> | null = null;

function getAdjacency() {
  if (!adjacency) {
    adjacency = new Map();
    for (const e of EDGES) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency.get(e.from)!.push({ to: e.to, edge: e.id });
      adjacency.get(e.to)!.push({ to: e.from, edge: e.id });
    }
  }
  return adjacency;
}

/**
 * The single bridge between React-rendered DOM and the GSAP engine. Scene components
 * register elements from ref callbacks; engine code only ever reads.
 * (docs/CONTRACTS.md C2)
 */
export const registry = {
  setNode(id: NodeId, el: SVGGElement | null) {
    if (el) nodes.set(id, el);
    else nodes.delete(id);
  },
  setEdge(id: EdgeId, el: SVGPathElement | null) {
    if (el) edges.set(id, el);
    else edges.delete(id);
  },
  setZone(id: ZoneId, el: SVGGElement | null) {
    if (el) zones.set(id, el);
    else zones.delete(id);
  },
  setPacket(el: SVGGElement | null) {
    packetEl = el;
  },

  node(id: NodeId) {
    return nodes.get(id) ?? null;
  },
  edge(id: EdgeId) {
    return edges.get(id) ?? null;
  },
  zone(id: ZoneId) {
    return zones.get(id) ?? null;
  },
  packet() {
    return packetEl;
  },
  allNodes() {
    return nodes;
  },
  allEdges() {
    return edges;
  },
  allZones() {
    return zones;
  },

  /** Shortest edge path between two nodes; [] when unreachable (engine then teleports). */
  route(from: NodeId, to: NodeId): EdgeId[] {
    if (from === to) return [];
    const adj = getAdjacency();
    const queue: NodeId[] = [from];
    const prev = new Map<NodeId, { node: NodeId; edge: EdgeId }>();
    const seen = new Set<NodeId>([from]);

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next.to)) continue;
        seen.add(next.to);
        prev.set(next.to, { node: cur, edge: next.edge });
        queue.push(next.to);
      }
    }

    if (!prev.has(to)) return [];
    const path: EdgeId[] = [];
    let cursor: NodeId = to;
    while (cursor !== from) {
      const hop = prev.get(cursor);
      if (!hop) return [];
      path.unshift(hop.edge);
      cursor = hop.node;
    }
    return path;
  },

  clear() {
    nodes.clear();
    edges.clear();
    zones.clear();
    packetEl = null;
  },
};
