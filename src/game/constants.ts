// ============================================================================
// Tunable game constants. Everything the designer might want to tweak lives here.
// ============================================================================

import type { CustomerType, GameState, ProductId, Role } from './types';

export const SAVE_VERSION = 17;
export const SAVE_KEY = 'distributor-tycoon-save-v1';

/** How many real seconds one in-game day lasts at 1x speed. Higher = more time
 * to react each day (a week at 1x ≈ 7× this; the 0.5x–4x controls still apply). */
export const SECONDS_PER_DAY_AT_1X = 20;

/** Units that fit on a single palette. */
export const PALETTE_SIZE = 40;

/** Pallet slots per shelf → a shelf holds SHELF_SLOTS × PALETTE_SIZE units. */
export const SHELF_SLOTS = 4;

/** Fixed, non-scaling build prices. */
export const SHELF_PRICE = 2000;
export const TABLE_PRICE = 800;
export const INBOUND_SLOT_PRICE = 500;
/** An office desk (Arbeitsplatz) — seats one office employee. */
export const DESK_PRICE = 600;

/** Hall expansion is the only scaling cost: base price for one 2×2 (4-tile)
 * block, rising one step for every 10 expansions bought. */
export const HALL_EXPANSION_BASE = 2500;
export function hallExpansionPrice(expansions: number): number {
  return HALL_EXPANSION_BASE * (1 + Math.floor(expansions / 10));
}

/** Office-area (Bürogebiet) expansion — a 2×2 block of office tiles, same rising
 * cost model as the hall. */
export const OFFICE_EXPANSION_BASE = 2000;
export function officeExpansionPrice(officeExpansions: number): number {
  return OFFICE_EXPANSION_BASE * (1 + Math.floor(officeExpansions / 10));
}


/** A session lasts one in-game year = 12 months × 4 weeks = 48 weeks. */
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_YEAR = WEEKS_PER_MONTH * MONTHS_PER_YEAR; // 48
export const WEEKS_PER_QUARTER = 12; // 3 months per season

/** Fixed monthly warehouse rent, charged together with salaries at month end. */
export const MONTHLY_RENT = 800;
/** Additional monthly rent per built 2×2 expansion block (hall AND office) —
 * growth carries running costs, on top of the base rent (Entscheidungen R2). */
export const RENT_PER_EXPANSION = 50;

/** Truck arrives Monday at this hour (0-24). Day fraction 0.75 = 18:00. */
export const TRUCK_HOUR = 18;
export const TRUCK_DAY_FRACTION = TRUCK_HOUR / 24;

/** Working day: warehouse staff only make progress on tasks (Herrichten/Einlagern)
 * between these hours. Outside the window (nights) work rests. The 18:00 truck
 * sits inside the window, so pickups are unaffected. */
export const WORK_START_HOUR = 6;
export const WORK_END_HOUR = 20;

/** During the night (WORK_END_HOUR → WORK_START_HOUR) the clock automatically
 * fast-forwards at this fixed factor — nothing happens while everyone sleeps, so
 * the player never has to sit through it. Replaces (not multiplies) the chosen
 * speed for the night portion of each tick. */
export const NIGHT_SPEED = 16;

export const STARTING_CASH = 10000;
export const STARTING_STARS = 3;

/** Truck logistics cost per palette (early game). */
export const TRUCK_COST_PER_PALLET = 20;

/** Supplier lead time for purchase orders, in days. Orders are placed on Monday
 * and always arrive the following Monday. */
export const PO_LEAD_DAYS = 7;

/** Emergency "Fehlmenge nachbestellen": an off-cycle express order to cover a
 * specific order's shortfall. It ships fast (in this many days) but the purchase
 * price carries a surcharge — the price of not planning it into the weekly run. */
export const EXPRESS_PO_LEAD_DAYS = 2;
export const EXPRESS_RESTOCK_SURCHARGE = 0.2;

/** Day-of-week (0=Mon .. 6=Sun) helpers for the weekly rhythm:
 *  - new customer inquiries arrive on Thursday, and
 *  - the weekly order window is Saturday — by then the whole week's customer
 *    orders are in, so the player plans with full knowledge of demand.
 * The order (placed Saturday) still arrives the following Monday, ready for the
 * new week. */
export const INQUIRY_DAY_OF_WEEK = 3; // Donnerstag
export const ORDER_DAY_OF_WEEK = 5; // Saturday

/**
 * Delay between a delivery and the customer paying us, in days, by customer type.
 * Small customers pay CASH ON PICKUP (0 = credited immediately when the truck
 * loads their palette) — this removes the early-game wait and gives instant money.
 * Medium/large pay on terms (1 / 2 weeks), so scaling up to them is a real
 * liquidity decision (more revenue, but paid in advance).
 */
export const PAYMENT_DELAY_DAYS_BY_TYPE: Record<CustomerType, number> = {
  small: 0,
  medium: 7,
  large: 14,
};

/** Weekly interest on outstanding bank credit. */
export const CREDIT_INTEREST_RATE = 0.02;

/** A minimum credit line (working-capital buffer) so the early ramp is survivable. */
export const CREDIT_LIMIT_FLOOR = 4000;

/** Deep-insolvency threshold: below this net cash the game is over. */
export const BANKRUPTCY_CASH = -6000;

/**
 * Handling times, quantity-linear, measured at the SKILL_SPEED_BASELINE skill:
 *  - preparing an order for pickup: 0.3 h per unit (40 units = 12 h, 20 = 6 h),
 *  - putting delivered goods away onto a shelf: 0.15 h per unit (40 = 6 h, 20 = 3 h).
 * Skill scales this: every point above the baseline is 1 % faster (5 pts = 5 %).
 */
export const PREP_HOURS_PER_UNIT = 0.3;
export const PUTAWAY_HOURS_PER_UNIT = 0.15;
export const SKILL_SPEED_BASELINE = 50;
export const SKILL_SPEED_PER_POINT = 0.01;

/** Extra prep time per additional article in the same customer order: a bundle of
 * N articles takes (1 + (N-1) * this) longer to prepare. */
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
/**
 * KAM slot system (Entscheidungen R2): customer capacity is counted in slots
 * PER MANAGER — the player ("Chef") and every KAM each have MANAGER_SLOTS. A
 * customer occupies SLOT_COST[type] slots at exactly ONE manager, and a new
 * customer needs that many free slots at a SINGLE manager (no pooling across
 * managers) — fragmentation is a deliberate part of the game: a large customer
 * needs one manager with 6 completely free slots.
 */
export const MANAGER_SLOTS = 6;
export const SLOT_COST: Record<CustomerType, number> = {
  small: 1,
  medium: 2,
  large: 6,
};
/** Sentinel manager id for the player themself. */
export const CHEF_MANAGER_ID = 'chef';

/**
 * Monthly-revenue thresholds that unlock bigger customers (Entscheidungen R2/R3).
 * "Monatsumsatz" is the ROLLING sum of the last 4 completed weeks, re-checked
 * every week — unlocking can happen any week, not just at month end.
 */
export const MEDIUM_UNLOCK_MONTHLY = 120_000;
export const LARGE_UNLOCK_MONTHLY = 600_000;

/** Rolling monthly revenue: sum of the last 4 completed weekly reports. */
export function monthlyRevenue(state: GameState): number {
  return state.reports.slice(-4).reduce((s, r) => s + r.revenue, 0);
}

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

/**
 * Menge statt Preis: cheap products are bought in bigger weekly quantities, so
 * the revenue per LINE converges across the ladder (Ø kleine Linie: Fisch
 * ~1.000 €, Fleisch ~975 €, Gemüse ~890 €) without touching prices or the
 * 40 %-margin fairness. Keeps Ergänzungsprodukte worth their shelf space and
 * makes the 120k unlock reachable through depth, not only through headcount.
 */
export const PRODUCT_VOLUME_FACTOR: Record<ProductId, number> = {
  fisch: 1,
  fleisch: 1.3,
  gemuese: 1.8,
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
  // Fleisch unlocks in the 3rd game week (index 2) — inside the tutorial, whose
  // meat beat guides listing it, winning the first meat customer and restocking.
  { id: 'fleisch', name: 'Fleisch', emoji: '🥩', einkaufspreis: 15, verkaufspreis: 25, zielmarge: 40, spoilageDays: 42, unlockWeek: 2, listingFee: 500 },
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

/**
 * New-customer inquiries TAPER as the base grows: the weekly chance is
 * base × SAT/(SAT + aktive Kunden). Early game ≈ 0.77/Woche (wie gehabt), bei
 * 17 Kunden ≈ 0,37, bei 40 ≈ 0,21 — Wachstum verlagert sich mit der Zeit von
 * Akquise auf die Weiterentwicklung der Bestandskunden, damit der Kundenstamm
 * über mehrere Jahre überschaubar bleibt.
 */
export const INQUIRY_BASE_CHANCE = 0.9;
export const INQUIRY_SATURATION_CUSTOMERS = 12;

/**
 * Light expansion inquiries (🔁 Bestandskunde möchte eine weitere Produktlinie)
 * SCALE with the customer base: each eligible customer rolls this chance every
 * Thursday, capped per week. No deadlines, no escalation — declining is free.
 * The rare Wunsch→Ultimatum engine stays separate on top (its Frequenz-Cap is
 * mandatory per Wachstumsmotor). Bei ~17 Kunden ≈ 1/Woche, bei 40+ oft 2-3.
 */
export const EXPANSION_CHANCE_PER_CUSTOMER = 0.07;
export const EXPANSION_MAX_PER_WEEK = 3;
export const EXPANSION_MIN_LOYALTY = 50;

// ---------------------------------------------------------------------------
// Wachstumsmotor (Paket B): established customers DEMAND a new product group —
// Wunsch (Stufe 1) → Ultimatum (Stufe 2) → complete churn. Growth pressure by
// loss aversion, strictly dosed: at most ONE active process company-wide, with
// a cooldown after each one ends (no Dauerfeuer).
// ---------------------------------------------------------------------------

/** Weeks that must pass after one demand process ENDS before the next may start. */
export const DEMAND_COOLDOWN_WEEKS = 5;
/** Chance per week (after the cooldown) that an eligible customer voices a wish. */
export const DEMAND_CHANCE_PER_WEEK = 0.5;
/** Only loyal customers threaten to leave — you must "own" them first. */
export const DEMAND_MIN_LOYALTY = 60;
/** …and only established ones (weeks since they became a customer). */
export const DEMAND_MIN_CUSTOMER_WEEKS = 6;
/** Customers already buying this many product groups are content — they never
 * demand more (coupling with the breadth rule: 2 suffice, see Paket C). */
export const DEMAND_MAX_LINES = 2;
/** Stufe 1 (friendly wish): deadline in weeks, drawn from this range. */
export const DEMAND_STAGE1_DEADLINE: [number, number] = [1, 4];
/** Weeks after a rejected/expired wish until the same customer returns with the
 * ultimatum (Stufe 2). */
export const DEMAND_ESCALATION_DELAY: [number, number] = [3, 6];
/** Stufe 2 (ultimatum): deadline in weeks, drawn from this range. */
export const DEMAND_STAGE2_DEADLINE: [number, number] = [2, 3];
/** Loyalty gains: accepting the wish is appreciated; holding the ultimatum is a
 * relief moment — the relationship recovers noticeably, no grudge. */
export const DEMAND_STAGE1_LOYALTY_GAIN = 5;
export const DEMAND_STAGE2_LOYALTY_GAIN = 15;

/** Chance a new inquiry is for a product you already actively sell (so a new
 * customer's first order isn't automatically late from the supply lead time). */
export const INQUIRY_FAMILIAR_PRODUCT_CHANCE = 0.7;

/** Chance a new inquiry targets a LISTABLE but not yet listed product (past its
 * unlockWeek — never before). Accepting then requires listing it (fee) in the
 * same flow, so product breadth becomes demand-driven instead of a pure money
 * decision (Wachstumsmotor Paket A). */
export const INQUIRY_UNLISTED_PRODUCT_CHANCE = 0.3;

/**
 * Wish-price spread for new inquiries, as a fraction of the product's list sales
 * price. Growth is braked by QUALITY, not frequency: not every inquiry is a good
 * deal, so the player earns growth through selection. Entry margins sit BELOW
 * the 40 % target on purpose (≈ 33-38 % for good deals): full target margin and
 * beyond (40-45 %) is EARNED later through service — in-contract raises run
 * through the reprice negotiation, whose ceiling scales with the service stars.
 * Weights should sum to 1; the last tier catches any rounding remainder.
 */
export const INQUIRY_PRICE_TIERS: { weight: number; range: [number, number] }[] = [
  { weight: 0.4, range: [0.93, 1.0] }, // gut: bis Listen-VK (Marge ~35-40 %)
  { weight: 0.4, range: [0.85, 0.92] }, // mittel: 8-15 % unter Listen-VK
  { weight: 0.2, range: [0.72, 0.82] }, // Lowball: 18-28 % unter Listen-VK
];

/** Weeks a potential customer waits for us to respond to their inquiry. */
export const INQUIRY_EXPIRY_WEEKS = 3;

/** Quarterly supplier price increase settings. */
export const SUPPLIER_INCREASE_CHANCE = 0.6;
export const SUPPLIER_INCREASE_RANGE: [number, number] = [0.03, 0.1];

/**
 * How sharply a counter-offer's acceptance chance falls as the asked price rises
 * above the customer's wish. Higher = steeper (premium asks fail more often),
 * which makes growth naturally irregular. With slope 4: +10 % over wish ≈ 60 %,
 * +20 % ≈ 20 %. At or below the wish it's always accepted.
 */
export const COUNTER_ACCEPT_SLOPE = 4;

// ---------------------------------------------------------------------------
// In-contract repricing (symmetrische Preisverhandlung). Raising an agreed line
// price is a NEGOTIATION with rejection risk — the mirror image of the counter
// offer — so "accept the wish price, then crank it up" is no longer a free
// bypass of the negotiation mechanic. Decreases are always accepted.
// ---------------------------------------------------------------------------

/** Raises up to this fraction above the AGREED price pass silently (rounding
 * headroom). The reference is the last mutually agreed price, so many small
 * steps accumulate against it instead of resetting it (no salami tactics). */
export const REPRICE_TOLERANCE = 0.02;
/** Weeks a line is locked after any negotiation attempt (win or lose). */
export const REPRICE_COOLDOWN_WEEKS = 6;
/** Acceptance slope for in-contract raises — steeper than new-deal counters
 * (an existing contract is harder to move than an open inquiry). */
export const REPRICE_ACCEPT_SLOPE = 5;
/** Stars scale the resistance: each star above 3 softens the slope by 25 %
 * (5★ → half resistance), each below tightens it (clamped ×0.5 … ×1.5). */
export function repriceStarDamp(serviceRating: number): number {
  return Math.min(1.5, Math.max(0.5, 1 - (serviceRating - 3) * 0.25));
}
/** Service ceiling: above listVK × (1 + (stars − 3) × bonus) the acceptance
 * chance collapses to the floor — 40-45 % margin is reachable ONLY with great
 * service (5★ ≈ +8 % over list ≈ 45 % margin at target-40 pricing). */
export const REPRICE_STAR_CEILING_BONUS = 0.04;
export const REPRICE_ACCEPT_FLOOR = 0.05;
/** Loyalty cost of a raise the customer accepts / refuses. */
export const REPRICE_SUCCESS_LOYALTY_COST = 3;
export const REPRICE_FAIL_LOYALTY_COST = 8;

// ---------------------------------------------------------------------------
// Loyalty with teeth: deeply unhappy customers eventually leave. Fairness rule
// (Wachstumsmotor): never without warning — crossing the threshold raises a
// clear notification, and the weekly quit roll only starts the FOLLOWING week.
// ---------------------------------------------------------------------------

export const LOYALTY_CHURN_THRESHOLD = 30;
/** Max weekly quit chance, reached as loyalty approaches 0 (scales linearly
 * with how far below the threshold the customer sits). */
export const LOYALTY_CHURN_CHANCE_MAX = 0.15;

// ============================================================================
// Milestones — "Onkels Notizbuch". Definitions (title, description, condition,
// uncle comment) live here as constants, matched to the per-save progress by id
// (GameState.milestones), so the texts can be tweaked without breaking saves.
// Ascending order — always 1-2 within reach. Conditions are cheap reads on data
// the game already tracks (stats/reports/customers/products/employees/warehouse)
// — no new tracking. Checks run only once the tutorial has ended.
// ============================================================================

export interface MilestoneDef {
  id: string;
  emoji: string;
  title: string;
  /** Short "how to get it" line for the notebook list. */
  description: string;
  /** The uncle's note shown on the celebration when it's achieved. */
  uncleComment: string;
  /** True once the goal is met — a pure read on existing state. */
  check: (state: GameState) => boolean;
}

const activeCustomers = (s: GameState) => s.customers.filter((c) => c.active).length;

export const MILESTONE_DEFS: MilestoneDef[] = [
  {
    id: 'first_delivery',
    emoji: '📦',
    title: 'Erste eigene Lieferung',
    description: 'Liefere deinen ersten Auftrag aus.',
    uncleComment: 'Die erste Lieferung ist raus – genau so hab ich damals auch angefangen. Fühlt sich gut an, oder?',
    check: (s) => s.stats.deliveredOrders >= 1,
  },
  {
    id: 'three_customers',
    emoji: '🤝',
    title: '3 Kunden gleichzeitig',
    description: 'Habe 3 aktive Kunden gleichzeitig.',
    uncleComment: 'Drei Kunden! Da hast du schon einen mehr, als ich in meinem ersten Jahr hatte.',
    check: (s) => activeCustomers(s) >= 3,
  },
  {
    id: 'first_profit_week',
    emoji: '📈',
    title: 'Erste Woche mit Gewinn',
    description: 'Schließe eine Woche mit Gewinn ab.',
    uncleComment: 'Schwarze Zahlen. Merk dir dieses Gefühl – dafür machst du das alles.',
    check: (s) => s.reports.some((r) => r.profit > 0),
  },
  {
    id: 'five_customers',
    emoji: '🤝',
    title: '5 Kunden gleichzeitig',
    description: 'Habe 5 aktive Kunden gleichzeitig.',
    uncleComment: 'Fünf Kunden gleichzeitig. Das Telefon steht nicht mehr still, was?',
    check: (s) => activeCustomers(s) >= 5,
  },
  {
    id: 'second_product',
    emoji: '🧺',
    title: 'Zweites Produkt gelistet',
    description: 'Nimm ein zweites Produkt ins Sortiment auf.',
    uncleComment: 'Ein zweites Produkt im Regal. So wächst ein Sortiment – Schritt für Schritt.',
    check: (s) => s.products.length >= 2,
  },
  {
    id: 'revenue_5k',
    emoji: '💶',
    title: '€5.000 Umsatz in einer Woche',
    description: 'Erreiche 5.000 € Umsatz in einer Woche.',
    uncleComment: '5.000 € in einer Woche. Damit hätte ich früher einen ganzen Monat lang die Miete bezahlt.',
    check: (s) => s.reports.some((r) => r.revenue >= 5000),
  },
  {
    id: 'first_hire',
    emoji: '🧑‍💼',
    title: 'Erster zusätzlicher Mitarbeiter',
    description: 'Stelle deinen ersten zusätzlichen Mitarbeiter ein.',
    uncleComment: 'Dein erster eigener Mitarbeiter. Jetzt trägst du Verantwortung für jemanden – das ehrt dich.',
    check: (s) => s.employees.length >= 3,
  },
  {
    id: 'first_hall_expansion',
    emoji: '🏗️',
    title: 'Erste Hallen-Erweiterung',
    description: 'Baue deine erste Hallen-Erweiterung.',
    uncleComment: 'Die Halle wird größer. Ich weiß noch, wie eng es bei mir immer war.',
    check: (s) => s.warehouse.expansions >= 1,
  },
  {
    id: 'monthly_40k',
    emoji: '🧾',
    title: '€40.000 Monatsumsatz',
    description: 'Erreiche 40.000 € Umsatz in einem Monat (rollierende 4 Wochen).',
    uncleComment: '40.000 € in einem Monat! Das war früher mein bestes Jahresergebnis.',
    check: (s) => monthlyRevenue(s) >= 40000,
  },
  {
    id: 'all_products',
    emoji: '🧺',
    title: 'Alle drei Produkte',
    description: 'Habe alle drei Produkte im Sortiment.',
    uncleComment: 'Alle drei Produktgruppen. Ein richtiger Vollsortimenter – das hab ich nie geschafft.',
    check: (s) => s.products.length >= 3,
  },
  {
    id: 'ultimatum_held',
    emoji: '🛡️',
    title: 'Ultimatum gehalten',
    description: 'Halte einen Kunden, der mit dem Wechsel zum Konkurrenten droht.',
    uncleComment: 'Einen Kunden zu halten ist schwerer als einen zu gewinnen – gut gemacht.',
    check: (s) => s.stats.ultimatumsHeld >= 1,
  },
  {
    id: 'monthly_120k',
    emoji: '📊',
    title: '€120.000 Monatsumsatz',
    description: 'Erreiche 120.000 € Monatsumsatz – schaltet mittlere Kunden frei.',
    uncleComment: 'Bei den Zahlen klopfen jetzt Hotels und Kantinen an. Mittlere Kunden – trau dich!',
    check: (s) => monthlyRevenue(s) >= MEDIUM_UNLOCK_MONTHLY,
  },
  {
    id: 'first_medium',
    emoji: '🏨',
    title: 'Erster mittlerer Kunde',
    description: 'Gewinne deinen ersten mittleren Kunden.',
    uncleComment: 'Ein mittlerer Kunde! Über die Kleinen bin ich nie hinausgekommen. Du schon.',
    check: (s) => s.customers.some((c) => c.active && c.type === 'medium'),
  },
  {
    id: 'monthly_250k',
    emoji: '💰',
    title: '€250.000 Monatsumsatz',
    description: 'Erreiche 250.000 € Monatsumsatz.',
    uncleComment: 'Eine Viertelmillion im Monat. Ich muss mich erst mal setzen.',
    check: (s) => monthlyRevenue(s) >= 250000,
  },
  {
    id: 'monthly_600k',
    emoji: '🎯',
    title: '€600.000 Monatsumsatz',
    description: 'Erreiche 600.000 € Monatsumsatz – schaltet große Kunden frei.',
    uncleComment: '600.000 €?! Junge, jetzt reden die Supermarkt-Ketten über dich.',
    check: (s) => monthlyRevenue(s) >= LARGE_UNLOCK_MONTHLY,
  },
  {
    id: 'first_large',
    emoji: '🏬',
    title: 'Erster großer Kunde',
    description: 'Gewinne deinen ersten großen Kunden (Supermarkt).',
    uncleComment: 'Ein Supermarkt. Junge, das hätte ich nie für möglich gehalten. Ich bin so stolz auf dich.',
    check: (s) => s.customers.some((c) => c.active && c.type === 'large'),
  },
];

export function getMilestoneDef(id: string): MilestoneDef | undefined {
  return MILESTONE_DEFS.find((m) => m.id === id);
}
