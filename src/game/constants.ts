// ============================================================================
// Tunable game constants. Everything the designer might want to tweak lives here.
// ============================================================================

import type { CustomerType, ProductId, Role } from './types';

export const SAVE_VERSION = 7;
export const SAVE_KEY = 'distributor-tycoon-save-v1';

/** How many real seconds one in-game day lasts at 1x speed. Higher = more time
 * to react each day (a week at 1x ≈ 7× this; the 0.5x–4x controls still apply). */
export const SECONDS_PER_DAY_AT_1X = 20;

/** Units that fit on a single palette. */
export const PALETTE_SIZE = 80;

/** A session lasts one in-game year = 12 months × 4 weeks = 48 weeks. */
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_YEAR = WEEKS_PER_MONTH * MONTHS_PER_YEAR; // 48
export const WEEKS_PER_QUARTER = 12; // 3 months per season

/** Fixed monthly warehouse rent, charged together with salaries at month end. */
export const MONTHLY_RENT = 600;

/** Truck arrives Monday at this hour (0-24). Day fraction 0.75 = 18:00. */
export const TRUCK_HOUR = 18;
export const TRUCK_DAY_FRACTION = TRUCK_HOUR / 24;

export const STARTING_CASH = 10000;
export const STARTING_STARS = 3;

/** Truck logistics cost per palette (early game). */
export const TRUCK_COST_PER_PALLET = 20;

/** Supplier lead time for purchase orders, in days. */
export const PO_LEAD_DAYS = 7;

/** Delay between a delivery and the customer paying us, in days. */
export const PAYMENT_DELAY_DAYS = 7;

/** Weekly interest on outstanding bank credit. */
export const CREDIT_INTEREST_RATE = 0.02;

/** A minimum credit line (working-capital buffer) so the early ramp is survivable. */
export const CREDIT_LIMIT_FLOOR = 4000;

/** Deep-insolvency threshold: below this net cash the game is over. */
export const BANKRUPTCY_CASH = -6000;

/** Base preparation time (in game-days) for one full palette at skill 100. */
export const BASE_PREP_DAYS_PER_PALETTE = 0.9;

/** Extra prep time per additional article in the same customer order: a bundle of
 * N articles takes each palette (1 + (N-1) * this) longer to prepare. */
export const PER_ARTICLE_PREP_FACTOR = 0.2;

/** Cost of a single training session. */
export const TRAINING_COST = 250;
export const TRAINING_SKILL_GAIN = 10;

/** Weekly salary per role. */
export const ROLE_SALARY: Record<Role, number> = {
  lager: 400,
  einkaeufer: 800,
  kam: 600,
  admin: 500,
};

export const ROLE_LABEL: Record<Role, string> = {
  lager: 'Lagermitarbeiter',
  einkaeufer: 'Einkäufer',
  kam: 'Key Account Manager',
  admin: 'Admin',
};

export const ROLE_EMOJI: Record<Role, string> = {
  lager: '👷',
  einkaeufer: '🛒',
  kam: '🤝',
  admin: '🗂️',
};

/** Upfront hiring cost is this many weeks of salary. */
export const HIRE_WEEKS_UPFRONT = 4;

/** Customer capacity added per KAM, plus a base the player handles alone. */
export const BASE_CUSTOMER_CAPACITY: Record<CustomerType, number> = {
  small: 8,
  medium: 0,
  large: 0,
};
export const KAM_CAPACITY: Record<CustomerType, number> = {
  small: 6,
  medium: 3,
  large: 1,
};

/**
 * Weekly-revenue thresholds that unlock bigger customers. Tuned down from the
 * spec's aspirational 20k/100k so the medium/large mechanics are actually
 * reachable inside a 52-week MVP session.
 */
export const MEDIUM_UNLOCK_REVENUE = 4000;
export const LARGE_UNLOCK_REVENUE = 20000;

export const CUSTOMER_LEAD_WEEKS: Record<CustomerType, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

export const CUSTOMER_VOLATILITY: Record<CustomerType, number> = {
  small: 0.4,
  medium: 0.2,
  large: 0.1,
};

export const CUSTOMER_VOLUME_RANGE: Record<CustomerType, [number, number]> = {
  small: [30, 40],
  medium: [175, 250],
  large: [800, 1000],
};

/** Discount → demand uplift curve (progressive). Fractions. */
export function demandUpliftFromDiscount(discount: number): number {
  // -2% => +5%, -10% => +18%, -20% => +30% (progressive-ish)
  if (discount <= 0) return 0;
  const d = discount * 100; // 2..20
  return Math.min(0.3, (d / 20) * 0.3 + (d / 20) * (d / 20) * 0.05);
}

export interface ProductDef {
  id: ProductId;
  name: string;
  emoji: string;
  einkaufspreis: number;
  verkaufspreis: number;
  zielmarge: number;
  spoilageDays: number;
  /** Week from which this product can be added to the assortment (0 = from start). */
  unlockWeek: number;
  /** One-time cost to list this product with the supplier and add it to the assortment. */
  listingFee: number;
}

// The full product catalog. Only products with unlockWeek 0 are in the assortment
// at the start; the rest unlock over time (aligned to month starts: fleisch at
// week 4 = month 2, gemuese at week 8 = month 3) and are added by the player.
// Verkaufspreise auf ~40% Zielmarge: verkaufspreis = EK / (1 - 0.40), auf 0,5€ gerundet.
export const PRODUCT_DEFS: ProductDef[] = [
  { id: 'fisch', name: 'Fischfilet', emoji: '🐟', einkaufspreis: 20, verkaufspreis: 33.5, zielmarge: 40, spoilageDays: 21, unlockWeek: 0, listingFee: 0 },
  { id: 'fleisch', name: 'Fleisch', emoji: '🥩', einkaufspreis: 15, verkaufspreis: 25, zielmarge: 40, spoilageDays: 42, unlockWeek: 4, listingFee: 500 },
  { id: 'gemuese', name: 'Gemüse', emoji: '🥦', einkaufspreis: 10, verkaufspreis: 16.5, zielmarge: 40, spoilageDays: 56, unlockWeek: 8, listingFee: 500 },
];

export function getProductDef(id: ProductId): ProductDef {
  return PRODUCT_DEFS.find((d) => d.id === id)!;
}

/** Seasonal demand multipliers per quarter (Q1..Q4) per product. */
export const SEASONAL_TREND: Record<ProductId, [number, number, number, number]> = {
  //          Q1(Winter) Q2(Frühj.) Q3(Sommer) Q4(Herbst)
  fisch: [0.85, 1.05, 1.3, 1.1],
  fleisch: [1.2, 1.1, 0.95, 1.15],
  gemuese: [0.9, 1.05, 1.15, 1.05],
};

export const QUARTER_LABEL = ['Q1 · Winter', 'Q2 · Frühjahr', 'Q3 · Sommer', 'Q4 · Herbst'];

/** Pools of flavour names for procedurally generated inquiries. */
export const CUSTOMER_NAME_POOL: Record<CustomerType, string[]> = {
  small: [
    'Pizzeria Bella',
    'Bistro Eck',
    'Sushi Sakura',
    'Gasthaus Krone',
    'Café Central',
    'Imbiss Meier',
    'Trattoria Nonna',
    'Burger Base',
    'Kebap Haus',
    'Fischstube',
  ],
  medium: [
    'Genuss-Kette GmbH',
    'StadtKüchen AG',
    'Frischwerk Gastro',
    'Mensa Verbund',
    'Hotel Panorama',
    'Kantinen-Service Nord',
  ],
  large: ['REWE Region West', 'EDEKA Großhandel', 'Metro Cash & Carry', 'Kaufland Zentral'],
};

export const CUSTOMER_EMOJI: Record<CustomerType, string> = {
  small: '🍕',
  medium: '🏨',
  large: '🏬',
};

/** New-inquiry chance per week (only checked when there is free capacity). */
export const INQUIRY_CHANCE_PER_WEEK = 0.8;

/** Chance per week that an existing (loyal) customer asks to add another product line. */
export const EXPANSION_INQUIRY_CHANCE_PER_WEEK = 0.35;

/** Minimum loyalty before a customer will consider expanding its assortment. */
export const EXPANSION_MIN_LOYALTY = 50;

/** Chance a new inquiry is for a product you already actively sell (so a new
 * customer's first order isn't automatically late from the supply lead time). */
export const INQUIRY_FAMILIAR_PRODUCT_CHANCE = 0.7;

/** Weeks a potential customer waits for us to respond to their inquiry. */
export const INQUIRY_EXPIRY_WEEKS = 3;

/** Quarterly supplier price increase settings. */
export const SUPPLIER_INCREASE_CHANCE = 0.6;
export const SUPPLIER_INCREASE_RANGE: [number, number] = [0.03, 0.1];
