#!/usr/bin/env node
/**
 * Standalone content validator. Runs against content/src/ so it works before (and
 * independently of) a Next build — content agents on any machine can run it.
 *
 * Usage: node scripts/validate-content.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChaosEntry } from './chaos-entry-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content', 'src');

const EXPLAIN_KEYS = [
  'what', 'why', 'component', 'layer', 'abstraction', 'protocol',
  'misconception', 'analogy', 'command', 'production',
];
const MODES = new Set(['user', 'kernel', 'hw', 'net', 'remote']);
const LAYERS = new Set(['eth', 'wifi', 'ip', 'udp', 'tcp', 'tls', 'http', 'dns', 'payload']);
const EFFECTS = new Set(['irq', 'ctx', 'ring+', 'ring-', 'pool+', 'pool-', 'queue+', 'queue-', 'flash', 'zoomout']);
const FLAG_VALUES = {
  runtime: ['browser', 'node'],
  dnscache: ['miss', 'hit'],
  medium: ['ethernet', 'wifi'],
  scheme: ['https', 'http'],
  deploy: ['docker', 'baremetal'],
};

function loadNodeIds() {
  const types = readFileSync(join(ROOT, 'src', 'data', 'types.ts'), 'utf8');
  const block = types.split('export const NODE_IDS = [')[1].split('] as const;')[0];
  return new Set([...block.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]));
}

function loadAll() {
  const win = {};
  for (const file of readdirSync(SRC).filter((f) => f.endsWith('.js')).sort()) {
    const code = readFileSync(join(SRC, file), 'utf8');
    new Function('window', code)(win);
  }
  return win;
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

if (!existsSync(SRC)) {
  console.log('validate-content: no content/src — nothing to check');
  process.exit(0);
}

const NODE_IDS = loadNodeIds();
const win = loadAll();

const STEP_GLOBALS = ['STEPS_A', 'STEPS_B', 'STEPS_B1', 'STEPS_B2', 'STEPS_C', 'STEPS_C2'];
const steps = STEP_GLOBALS.flatMap((g) => (Array.isArray(win[g]) ? win[g] : []));
const components = Object.assign({}, win.COMPONENTS, win.COMPONENTS_B, win.COMPONENTS_C);
const chaos = win.CHAOS ?? {};

// ── steps ────────────────────────────────────────────────────────────────────
const seen = new Map();
let prevChapter = 0;

function checkStep(s, where) {
  const id = s?.id ?? '(no id)';
  if (!s.id) err(`${where}: step without an id`);
  if (!s.title) err(`${id}: missing title`);
  if (!NODE_IDS.has(s.node)) err(`${id}: node '${s.node}' is not a NodeId`);
  if (s.from && !NODE_IDS.has(s.from)) err(`${id}: from '${s.from}' is not a NodeId`);
  if (!MODES.has(s.mode)) err(`${id}: mode '${s.mode}' invalid`);
  if (!s.explain) err(`${id}: no explain block`);
  else {
    for (const k of EXPLAIN_KEYS) {
      if (!s.explain[k] || typeof s.explain[k] !== 'string') err(`${id}: explain.${k} missing`);
    }
  }
  for (const e of s.effects ?? []) if (!EFFECTS.has(e)) err(`${id}: unknown effect '${e}'`);
  for (const l of s.packet?.layers ?? []) if (!LAYERS.has(l)) err(`${id}: unknown packet layer '${l}'`);
  for (const [k, v] of Object.entries(s.when ?? {})) {
    if (!FLAG_VALUES[k]) err(`${id}: when.${k} is not a scenario flag`);
    else if (!FLAG_VALUES[k].includes(v)) err(`${id}: when.${k}='${v}' invalid`);
  }
  if (s.branch) {
    if (s.when) err(`${id}: branch steps must not carry a 'when' filter`);
    if (!FLAG_VALUES[s.branch.key]) err(`${id}: branch.key '${s.branch.key}' is not a flag`);
    if (!Array.isArray(s.branch.options) || s.branch.options.length < 2) err(`${id}: branch needs >=2 options`);
  }
  if (s.quiz) {
    const n = s.quiz.options?.length ?? 0;
    if (n < 2) err(`${id}: quiz needs >=2 options`);
    if (!(s.quiz.answer >= 0 && s.quiz.answer < n)) err(`${id}: quiz.answer out of range`);
    if (!s.quiz.explain) err(`${id}: quiz has no explanation`);
  }
}

for (const s of steps) {
  if (seen.has(s.id)) err(`duplicate step id '${s.id}'`);
  seen.set(s.id, true);
  if (typeof s.chapter !== 'number' || s.chapter < 1 || s.chapter > 24) err(`${s.id}: chapter ${s.chapter} out of range`);
  else if (s.chapter < prevChapter) err(`${s.id}: chapter ${s.chapter} decreases after ${prevChapter}`);
  else prevChapter = s.chapter;
  checkStep(s, 'steps');
}

// Every chapter 1..24 must have at least one step under default flags.
const chapters = new Set(steps.map((s) => s.chapter));
for (let c = 1; c <= 24; c++) if (!chapters.has(c)) err(`chapter ${c} has no steps`);

// ── chaos ────────────────────────────────────────────────────────────────────
for (const [id, sc] of Object.entries(chaos)) {
  if (!sc.label) err(`chaos.${id}: missing label`);
  if (!Array.isArray(sc.steps) || sc.steps.length < 4) err(`chaos.${id}: needs >=4 steps`);
  // entryAfter is normalised at conversion time, so only an unresolvable one is an error.
  const resolved = resolveChaosEntry(id, sc.entryAfter, seen);
  if (resolved === null) err(`chaos.${id}: entryAfter '${sc.entryAfter}' cannot be resolved to any step id`);
  else if (resolved !== (sc.entryAfter ?? '')) warn(`chaos.${id}: entryAfter '${sc.entryAfter}' → '${resolved}' at build time`);
  for (const s of sc.steps ?? []) {
    if (seen.has(s.id)) err(`chaos.${id}: step id '${s.id}' collides with the main timeline`);
    checkStep(s, `chaos.${id}`);
  }
}

// ── components ───────────────────────────────────────────────────────────────
const REQUIRED = ['name', 'tagline', 'description', 'history', 'purpose', 'production'];
const ARRAYS = ['responsibilities', 'commands', 'interview', 'sources', 'related'];
for (const nodeId of NODE_IDS) {
  const c = components[nodeId];
  if (!c) { warn(`no dossier for '${nodeId}'`); continue; }
  for (const k of REQUIRED) if (!c[k]) err(`dossier ${nodeId}: missing ${k}`);
  for (const k of ARRAYS) if (!Array.isArray(c[k]) || !c[k].length) err(`dossier ${nodeId}: ${k} empty`);
  for (const r of c.related ?? []) if (!NODE_IDS.has(r)) err(`dossier ${nodeId}: related '${r}' is not a NodeId`);
}
for (const k of Object.keys(components)) if (!NODE_IDS.has(k)) warn(`dossier '${k}' is not a NodeId (will be dropped)`);

// Every node used by a step should have a dossier (that is the click target).
const usedNodes = new Set(steps.map((s) => s.node));
for (const n of usedNodes) if (!components[n]) warn(`step node '${n}' has no dossier`);

// ── report ───────────────────────────────────────────────────────────────────
console.log(`validate-content: ${steps.length} steps · ${Object.keys(components).length} dossiers · ${Object.keys(chaos).length} chaos scenarios`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('  ✓ all checks passed');
