import type { NodeId, Step, StepMode } from '@/data/types';
import { TREE, type ContainerId, type TreeId, type TreeNodeSpec } from '@/scene/componentTree';

/**
 * The simulation engine — the most important module in the project.
 *
 * Pure: no DOM, no React, no store, no time. Everything here is a fold or a lookup, so
 * every result is reproducible from (tree, timeline, index) alone. That is what makes the
 * timeline scrubbable and the whole thing testable (docs/ENGINE_V2.md §7).
 */

/**
 * `cross` is deliberately distinct from `travel`: a sibling hop is one packet flight,
 * whereas leaving a subsystem is "climb out n levels, then descend m". Collapsing both
 * into `travel` hides the most expensive camera move in the lesson.
 */
export type StepAction = 'enter' | 'open' | 'travel' | 'cross' | 'exit' | 'stay';

export interface Tree {
  root: TreeId;
  parent: Record<string, TreeId | null>;
  children: Record<string, TreeId[]>;
  depth: Record<string, number>;
  label: Record<string, string>;
  sub: Record<string, string | undefined>;
  /** Every id in the tree, in depth-first order. */
  all: TreeId[];
}

export function buildTree(spec: TreeNodeSpec = TREE): Tree {
  const tree: Tree = {
    root: spec.id,
    parent: {},
    children: {},
    depth: {},
    label: {},
    sub: {},
    all: [],
  };

  const walk = (node: TreeNodeSpec, parent: TreeId | null, depth: number) => {
    tree.parent[node.id] = parent;
    tree.children[node.id] = (node.children ?? []).map((c) => c.id);
    tree.depth[node.id] = depth;
    tree.label[node.id] = node.label;
    tree.sub[node.id] = node.sub;
    tree.all.push(node.id);
    for (const child of node.children ?? []) walk(child, node.id, depth + 1);
  };

  walk(spec, null, 0);
  return tree;
}

/** Root-to-node path, inclusive of both ends. Empty when the id is unknown. */
export function pathTo(tree: Tree, id: TreeId): TreeId[] {
  if (!(id in tree.parent)) return [];
  const out: TreeId[] = [];
  let cursor: TreeId | null = id;
  while (cursor) {
    out.unshift(cursor);
    cursor = tree.parent[cursor] ?? null;
  }
  return out;
}

export function isContainer(tree: Tree, id: TreeId): boolean {
  return (tree.children[id]?.length ?? 0) > 0;
}

export function isAncestor(tree: Tree, maybeAncestor: TreeId, of: TreeId): boolean {
  let cursor = tree.parent[of] ?? null;
  while (cursor) {
    if (cursor === maybeAncestor) return true;
    cursor = tree.parent[cursor] ?? null;
  }
  return false;
}

/**
 * The migration, in one function: what kind of camera move takes you from `prev` to
 * `next`? Every one of the 239 authored steps gets its `action` from here rather than
 * from an author having to think about it.
 */
export function deriveAction(
  tree: Tree,
  prev: TreeId | null,
  next: TreeId,
  /** From `foldDisclosure` at the previous step — decides `open` vs `stay`. */
  alreadyOpened?: ReadonlySet<TreeId>,
): StepAction {
  if (prev === null) return 'enter';
  if (prev === next) {
    // Second beat on the same box: if it has not been opened yet, this is the moment the
    // black box comes apart. That is Ripon's "Browser appears / Browser opens" pair.
    if (alreadyOpened && !alreadyOpened.has(next)) return 'open';
    return 'stay';
  }
  if (isAncestor(tree, prev, next)) return 'enter';
  if (isAncestor(tree, next, prev)) return 'exit';
  if (tree.parent[prev] === tree.parent[next]) return 'travel';
  return 'cross';
}

/** How far the camera has to climb before it can descend again. 0 for a sibling hop. */
export function climbDistance(tree: Tree, from: TreeId, to: TreeId): number {
  const a = pathTo(tree, from);
  const b = pathTo(tree, to);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return a.length - shared;
}

export interface Disclosure {
  /** Introduced by name — the label has been on screen. */
  seen: Set<TreeId>;
  /** Opened to reveal internals. */
  opened: Set<TreeId>;
  /** Rooms the camera has actually been inside. */
  entered: Set<TreeId>;
}

/**
 * What the learner has been shown by step N. A pure fold, exactly like `foldOsState`, so
 * jumping to N reveals precisely what walking to N would have.
 */
export function foldDisclosure(tree: Tree, timeline: Step[], upTo: number): Disclosure {
  const seen = new Set<TreeId>();
  const opened = new Set<TreeId>();
  const entered = new Set<TreeId>();
  const last = Math.min(upTo, timeline.length - 1);

  for (let i = 0; i <= last; i++) {
    const focus = timeline[i]?.node as TreeId | undefined;
    if (!focus) continue;

    const path = pathTo(tree, focus);
    for (const id of path) {
      seen.add(id);
      // Every ANCESTOR of the focus is a room we are standing inside, so it is open.
      // The focus itself is deliberately NOT opened here: arriving at a box introduces
      // it while it is still shut, and the next beat on it is what opens it. That pair
      // is the whole "black box until you reach it" mechanic.
      if (id !== focus) {
        entered.add(id);
        opened.add(id);
      }
    }
    // Siblings share the room, so they have been introduced by name.
    const parent = tree.parent[focus];
    if (parent) for (const sib of tree.children[parent] ?? []) seen.add(sib);
  }

  return { seen, opened, entered };
}

export interface Scene {
  step: Step;
  index: number;
  focus: TreeId;
  /** Root → focus. The breadcrumb and the call-stack widget render the same array. */
  path: TreeId[];
  /** The open container the learner is standing in. */
  room: TreeId;
  /** The room's children — the only boxes on screen. */
  visible: TreeId[];
  /** Boxes in `visible` that are open (the focus, plus anything already entered). */
  expanded: TreeId[];
  /** Boxes in `visible` that are not the focus — rendered dimmed. */
  siblings: TreeId[];
  /** Advisory gating: shown dimmed with a hint, never disabled. */
  unmet: TreeId[];
  action: StepAction;
  climb: number;
  mode: StepMode;
  camera: { fit: TreeId; scale: number };
}

/**
 * Resolve the complete on-screen state for one index. This is the function the renderer,
 * the breadcrumb, the inspector and the timeline all read from — there is exactly one
 * source of truth for "what is the learner looking at".
 */
export function resolveScene(tree: Tree, timeline: Step[], index: number): Scene | null {
  const step = timeline[index];
  if (!step) return null;

  const focus = step.node as TreeId;
  const path = pathTo(tree, focus);
  // A focused container is its own room (we are inside it); a leaf's room is its parent.
  const room = isContainer(tree, focus) ? focus : (tree.parent[focus] ?? tree.root);
  const visible = tree.children[room] ?? [];

  const prevFocus = index > 0 ? ((timeline[index - 1]?.node as TreeId) ?? null) : null;
  // Disclosure BEFORE this step decides whether the focus is opening for the first time.
  const priorOpened = index > 0 ? foldDisclosure(tree, timeline, index - 1).opened : new Set<TreeId>();
  const action = deriveAction(tree, prevFocus, focus, priorOpened);
  const climb = prevFocus ? climbDistance(tree, prevFocus, focus) : 0;

  const disclosure = foldDisclosure(tree, timeline, index);
  const expanded = visible.filter((id) => id === focus || disclosure.entered.has(id));
  const siblings = visible.filter((id) => id !== focus);
  // Advisory only: a box whose parent room the learner has never entered.
  const unmet = visible.filter((id) => !disclosure.seen.has(id));

  return {
    step,
    index,
    focus,
    path,
    room,
    visible,
    expanded,
    siblings,
    unmet,
    action,
    climb,
    mode: step.mode,
    camera: { fit: isContainer(tree, focus) ? focus : room, scale: 1 },
  };
}

/** Dev-only invariant: the tree must place all 87 NodeIds exactly once. */
export function assertTreeCovers(tree: Tree, nodeIds: readonly NodeId[]): string[] {
  const problems: string[] = [];
  const inTree = new Set(tree.all);
  const containers = new Set<ContainerId>();

  for (const id of nodeIds) {
    if (!inTree.has(id)) problems.push(`NodeId '${id}' is missing from the tree`);
  }
  const counts = new Map<TreeId, number>();
  for (const id of tree.all) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > 1) problems.push(`'${id}' appears ${n} times in the tree`);
  }
  for (const id of tree.all) {
    if (!(nodeIds as readonly string[]).includes(id as string)) {
      containers.add(id as ContainerId);
      if (!isContainer(tree, id)) problems.push(`container '${id}' has no children`);
    }
  }
  return problems;
}
