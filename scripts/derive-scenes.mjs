#!/usr/bin/env node
/**
 * M1 verification: run every authored step through the component tree and report what
 * the engine derives. This is the artifact that decides whether the tree fits the
 * content — read the report BEFORE any renderer work starts (docs/ENGINE_V2.md §12).
 *
 * Usage: node scripts/derive-scenes.mjs [--chapter N] [--thrash]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── load the tree straight out of the TS source (no build step needed) ──────────
function loadTree() {
  const src = readFileSync(join(ROOT, 'src', 'scene', 'componentTree.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const TREE'));
  const spec = body.slice(body.indexOf('{'), body.lastIndexOf('};') + 1);
  // The literal is pure data: quote the bare keys, drop the trailing semicolon.
  const json = spec
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/([{,]\s*)(id|label|sub|children)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/;\s*$/, '');
  return JSON.parse(json);
}

function flatten(spec) {
  const tree = { parent: {}, children: {}, depth: {}, label: {}, all: [] };
  const walk = (n, parent, depth) => {
    tree.parent[n.id] = parent;
    tree.children[n.id] = (n.children ?? []).map((c) => c.id);
    tree.depth[n.id] = depth;
    tree.label[n.id] = n.label;
    tree.all.push(n.id);
    for (const c of n.children ?? []) walk(c, n.id, depth + 1);
  };
  walk(spec, null, 0);
  return tree;
}

const pathTo = (t, id) => {
  const out = [];
  let c = id;
  while (c) {
    out.unshift(c);
    c = t.parent[c] ?? null;
  }
  return out;
};
const isAncestor = (t, a, of) => {
  let c = t.parent[of] ?? null;
  while (c) {
    if (c === a) return true;
    c = t.parent[c] ?? null;
  }
  return false;
};
const climb = (t, from, to) => {
  const a = pathTo(t, from);
  const b = pathTo(t, to);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  return a.length - s;
};
function deriveAction(t, prev, next, opened) {
  if (prev === null) return 'enter';
  if (prev === next) return opened && !opened.has(next) ? 'open' : 'stay';
  if (isAncestor(t, prev, next)) return 'enter';
  if (isAncestor(t, next, prev)) return 'exit';
  if (t.parent[prev] === t.parent[next]) return 'travel';
  return 'cross';
}

// ── load content ────────────────────────────────────────────────────────────────
const win = {};
for (const f of readdirSync(join(ROOT, 'content', 'src')).filter((f) => f.endsWith('.js')).sort()) {
  new Function('window', readFileSync(join(ROOT, 'content', 'src', f), 'utf8'))(win);
}
const STEPS = [...(win.STEPS_A ?? []), ...(win.STEPS_B ?? []), ...(win.STEPS_C ?? [])];

const NODE_IDS = (() => {
  const t = readFileSync(join(ROOT, 'src', 'data', 'types.ts'), 'utf8');
  const b = t.split('export const NODE_IDS = [')[1].split('] as const;')[0];
  return [...b.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
})();

const spec = loadTree();
const tree = flatten(spec);

// ── 1. coverage ─────────────────────────────────────────────────────────────────
const inTree = new Set(tree.all);
const missing = NODE_IDS.filter((id) => !inTree.has(id));
const containers = tree.all.filter((id) => !NODE_IDS.includes(id));
const emptyContainers = containers.filter((id) => (tree.children[id] ?? []).length === 0);
const dupes = tree.all.filter((id, i) => tree.all.indexOf(id) !== i);

console.log('── coverage ─────────────────────────────────────────────');
console.log(`  tree ids            ${tree.all.length}  (${NODE_IDS.length} components + ${containers.length} containers)`);
console.log(`  missing NodeIds     ${missing.length ? missing.join(', ') : 'NONE'}`);
console.log(`  duplicated ids      ${dupes.length ? dupes.join(', ') : 'NONE'}`);
console.log(`  empty containers    ${emptyContainers.length ? emptyContainers.join(', ') : 'NONE'}`);
console.log(`  max depth           ${Math.max(...Object.values(tree.depth))}`);
const roomSizes = containers.map((c) => (tree.children[c] ?? []).length);
console.log(`  room size           min ${Math.min(...roomSizes)} · max ${Math.max(...roomSizes)} · target ≤ 9`);
const bigRooms = containers.filter((c) => (tree.children[c] ?? []).length > 9);
if (bigRooms.length) {
  console.log(`  ⚠ rooms over 9      ${bigRooms.map((c) => `${c}(${tree.children[c].length})`).join(', ')}`);
}

// ── 2. derive actions across the whole lesson ───────────────────────────────────
const hist = { enter: 0, open: 0, travel: 0, cross: 0, exit: 0, stay: 0 };
const perChapter = {};
let prev = null;
const opened = new Set();
const derived = STEPS.map((s) => {
  const action = deriveAction(tree, prev, s.node, opened);
  const c = climb(tree, prev ?? s.node, s.node);
  hist[action]++;
  // Ancestors only — arriving at a box does not open it; the next beat on it does.
  for (const id of pathTo(tree, s.node).slice(0, -1)) opened.add(id);
  (perChapter[s.chapter] ??= []).push({ id: s.id, node: s.node, action, climb: c });
  prev = s.node;
  return { ...s, action, climb: c, path: pathTo(tree, s.node) };
});

console.log('\n── derived actions ──────────────────────────────────────');
console.log(`  ${Object.entries(hist).map(([k, v]) => `${k} ${v}`).join(' · ')}   (${STEPS.length} steps)`);
const unresolved = derived.filter((d) => d.path.length === 0);
console.log(`  steps whose focus is not in the tree: ${unresolved.length ? unresolved.map((d) => d.id).join(', ') : 'NONE'}`);
const depths = derived.map((d) => d.path.length - 1);
console.log(`  focus depth         min ${Math.min(...depths)} · max ${Math.max(...depths)} · avg ${(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1)}`);

// ── 3. thrash detection ─────────────────────────────────────────────────────────
/*
 * Calibration: climb 1 is a sibling hop, climb 2 is a lateral move between two sub-rooms
 * of the same parent (driverlayer → netstack inside the kernel) — both are normal. Only
 * climb ≥ 3 means the camera left the subsystem entirely, and only a run of those reads
 * as yo-yoing. Some crossing is inherent: the RX path genuinely climbs the stack.
 */
console.log('\n── per-chapter (far = camera left the subsystem, climb ≥ 3) ──');
const thrashy = [];
for (const ch of Object.keys(perChapter).sort((a, b) => a - b)) {
  const rows = perChapter[ch];
  const far = rows.filter((r) => r.climb >= 3).length;
  const rooms = new Set(rows.map((r) => pathTo(tree, r.node).slice(-2)[0])).size;
  const flag = far > 2 ? '  ⚠ review' : '';
  console.log(
    `  ch${String(ch).padStart(2)}  ${String(rows.length).padStart(2)} steps · ${rooms} room(s) · ${far} far move(s)${flag}`,
  );
  if (far > 2) thrashy.push(ch);
}

console.log('\n── verdict ──────────────────────────────────────────────');
const ok = !missing.length && !dupes.length && !emptyContainers.length && !unresolved.length;
console.log(`  tree covers content   ${ok ? 'YES' : 'NO'}`);
console.log(`  chapters needing hand-review (M2): ${thrashy.length ? thrashy.join(', ') : 'none'}`);
process.exit(ok ? 0 : 1);
