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
 *  4 GROWTH     – handle the uncle's two inquiries (accept + counter-offer)
 *  5 ORDER      – place the weekly order (cover the fixed demand)
 *  6 CAPACITY   – free play until Fleisch unlocks (building is optional)
 *  7 MEAT       – Fleisch unlocked: list it, win the meat customer, restock
 *  8 MONTH      – first monthly statement, then the tutorial ends
 */
export const STEP = {
  INTRO: 0,
  HERRICHTEN: 1,
  REWARD: 2,
  CELEBRATE: 3,
  GROWTH: 4,
  ORDER: 5,
  CAPACITY: 6,
  MEAT: 7,
  MONTH: 8,
} as const;

/** Fixed id of the pre-placed starter order that drives the first beats. */
export const TUTORIAL_ORDER_ID = 'order_tut';

/** Fixed ids of the two inquiries "the uncle left behind" for the growth beat:
 * the first teaches ✓ Annehmen, the second teaches ⚖ Gegenangebot. The beat
 * advances once neither is open any more. */
export const TUTORIAL_INQUIRY_IDS = ['inq_tut_1', 'inq_tut_2'];

/** Fixed id of the guaranteed Fleisch inquiry of the meat beat — created the
 * moment Fleisch is listed in the assortment. */
export const TUTORIAL_MEAT_INQUIRY_ID = 'inq_tut_meat';

/** Ids of the two customers the uncle hands over (created in init.ts from this
 * list). The growth beat detects "a NEW customer was won" as any customer whose
 * id is not in here — robust against cancellations and future scenario changes. */
export const STARTING_CUSTOMER_IDS: string[] = ['cust_giuseppe', 'cust_urban'];

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
  | 'company'
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
  sortiment: STEP.MEAT,
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

/** True when the tutorial is active and currently on the given beat. Used by UI
 * components to glow the button that triggers the next step. */
export function tutorialOnStep(tutorial: TutorialState, step: number): boolean {
  return !!tutorial && tutorial.active && tutorial.step === step;
}

/**
 * Steps whose overlay REQUIRES the game to stay paused. While one of these is
 * showing, user-facing pause/speed controls must not restart the clock — the
 * simulation running behind a story overlay can rack up late deliveries the
 * player never saw (and, before the first delivery, even kill the starter order).
 */
export function tutorialPausesGame(tutorial: TutorialState): boolean {
  if (!tutorial || !tutorial.active) return false;
  return (
    tutorial.step === STEP.INTRO ||
    tutorial.step === STEP.CELEBRATE ||
    tutorial.step === STEP.MONTH
  );
}
