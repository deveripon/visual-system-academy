import type { ChaosMap, ComponentMap, Step } from './types';
import { RAW_CHAOS, RAW_COMPONENTS, RAW_STEPS } from './generated';

/** The full lesson, in chapter order. Filtering by scenario happens in scenarioEngine. */
export const ALL_STEPS: Step[] = RAW_STEPS;

export const CHAOS: ChaosMap = RAW_CHAOS;

/**
 * Dossiers are the largest content chunk and only needed when a learner opens one, so
 * they load lazily. Cached after the first call; prefetched on idle by the shell.
 */
let componentsPromise: Promise<ComponentMap> | null = null;

export function getComponents(): Promise<ComponentMap> {
  if (!componentsPromise) {
    componentsPromise = Promise.resolve(RAW_COMPONENTS);
  }
  return componentsPromise;
}

/** Synchronous access for code paths that already awaited `getComponents()`. */
export const COMPONENTS: ComponentMap = RAW_COMPONENTS;

export * from './types';
