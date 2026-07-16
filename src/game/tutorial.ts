// ============================================================================
// Tutorial constants & pure helpers. Deliberately free of any simulation import
// so both the sim (advanceTutorial) and the UI can use it without an import
// cycle. The tutorial state itself lives on GameState.tutorial as plain data.
// ============================================================================

import type { GameState } from './types';

export type TutorialState = GameState['tutorial'];

/**
 * Ordered onboarding beats. The number is what gets stored in
 * GameState.tutorial.step, so the machine can only ever move forward.
 *  0 INTRO      – uncle intro overlay (paused)
 *  1 HERRICHTEN – press Herrichten on the pre-placed starter order
 *  2 REWARD     – waiting for the truck to pick up & pay cash
 *  3 CELEBRATE  – confetti + cash-in dialog
 *  4 GROWTH     – accept the first new customer inquiry
 *  5 ORDER      – place the recommended weekly order
 *  6 CAPACITY   – buy a table / hire when prep backs up
 *  7 MONTH      – first monthly statement, then the tutorial ends
 */
export const STEP = {
  INTRO: 0,
  HERRICHTEN: 1,
  REWARD: 2,
  CELEBRATE: 3,
  GROWTH: 4,
  ORDER: 5,
  CAPACITY: 6,
  MONTH: 7,
} as const;

/** Fixed id of the pre-placed starter order that drives the first beats. */
export const TUTORIAL_ORDER_ID = 'order_tut';

/** Near-instant first Herrichtung (in game-days) so the first reward comes fast
 * — the palette visibly appears instead of the player waiting on a bar. */
export const TUTORIAL_FIRST_PREP_DAYS = 0.12;

/** Feature buttons that can be gated while the tutorial runs. */
export type Feature =
  | 'inventory'
  | 'sortiment'
  | 'procurement'
  | 'pricing'
  | 'customers'
  | 'inquiries'
  | 'employees'
  | 'finance'
  | 'reports'
  | 'log'
  | 'build';

/**
 * Step from which each feature unlocks. Anything not listed here stays locked
 * for the whole tutorial and only opens when it ends (tutorial === null) — this
 * keeps the surface to the core loop and reveals one system per beat.
 */
const UNLOCK_STEP: Partial<Record<Feature, number>> = {
  inquiries: STEP.GROWTH,
  procurement: STEP.ORDER,
  build: STEP.CAPACITY,
  employees: STEP.CAPACITY,
  finance: STEP.MONTH,
  reports: STEP.MONTH,
};

/** Whether a feature button is usable given the current tutorial state. */
export function isFeatureUnlocked(tutorial: TutorialState, feature: Feature): boolean {
  if (!tutorial || !tutorial.active) return true; // no/finished tutorial ⇒ all free
  const from = UNLOCK_STEP[feature];
  if (from === undefined) return false; // opens only when the tutorial ends
  return tutorial.step >= from;
}
