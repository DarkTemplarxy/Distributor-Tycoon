// ============================================================================
// Tunable game constants. Everything the designer might want to tweak lives here.
// ============================================================================

import type { ArticleId, CustomerType, EquipmentId, GameState, ProductId, Role, SiteId, StrategyId, VehicleId } from './types';

export const SAVE_VERSION = 19;
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

/** Tearing a structure down refunds this fraction of its build price. */
export const DEMOLISH_REFUND = 0.5;

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

/**
 * Physical carry limit: to prepare an order the worker fetches goods from the
 * shelf in loads. A worker carries at most CARRY_CAPACITY units per trip on foot,
 * doubled to CARRY_CAPACITY_CART with a Kommissionierwagen. A bigger order needs
 * more trips (ceil(qty / capacity)), each adding CARRY_TRIP_DAYS of walking — so
 * the cart both speeds packing AND halves the trips for large orders.
 */
export const CARRY_CAPACITY = 80;
export const CARRY_CAPACITY_CART = 160;
/** Game-days added per EXTRA carry trip (beyond the first): an order within one
 * carry costs nothing extra; only orders that exceed the capacity pay for the
 * additional shelf runs. Keeps normal small orders at baseline speed. */
export const CARRY_TRIP_DAYS = 0.07;

/** Cost of a single training session. */
export const TRAINING_COST = 250;
export const TRAINING_SKILL_GAIN = 10;

/** Weekly salary per role. */
export const ROLE_SALARY: Record<Role, number> = {
  lager: 400,
  einkaeufer: 800,
  kam: 600,
  sales: 550,
  admin: 500,
  standortleiter: 1000,
  marketing: 750,
  regionalkam: 900,
  logistik: 850,
};

export const ROLE_LABEL: Record<Role, string> = {
  lager: 'Lagermitarbeiter',
  einkaeufer: 'Einkäufer',
  kam: 'Key Account Manager',
  sales: 'Vertriebsmitarbeiter',
  admin: 'Admin',
  standortleiter: 'Standortleiter',
  marketing: 'Marketing-Manager',
  regionalkam: 'Regional-KAM',
  logistik: 'Logistikleiter',
};

export const ROLE_EMOJI: Record<Role, string> = {
  lager: '👷',
  einkaeufer: '🛒',
  kam: '🤝',
  sales: '📞',
  admin: '🗂️',
  standortleiter: '🧑‍✈️',
  marketing: '📣',
  regionalkam: '🏬',
  logistik: '🚚',
};

/**
 * Standortleiter (Konzern-Delegation): ein Standortleiter FÜHRT einen Standort
 * automatisch (headless, im Sim-Tick) — er stellt Lagerkräfte nach Volumen ein,
 * baut Packtische/Regale/Kühlzone/Rampe voraus und trainiert die Crew. So skaliert
 * das Spiel vom Hands-on-Lager zum Konzern: du gibst einen Standort ab und führst
 * ihn nur noch übers Cockpit. Beschaffung bleibt zentral (Einkäufer). Der
 * Auto-Betrieb hält eine Kassen-Reserve, damit ein delegierter Standort die Firma
 * nie leer räumt.
 */
/**
 * Regionalbüro gründen (nach dem 2. Standort): der Übergang vom einzelnen Betrieb zur
 * Unternehmensgruppe. Erst kaufst du den zweiten Standort (BRANCH_PRICE), DANN gründest
 * du dafür ein REGIONALBÜRO — ein bewusster, bezahlter zweiter Schritt. Es etabliert die
 * zweistufige Struktur: je Land ein Regionalbüro mit eigenen Führungskräften (siehe
 * REGIONAL_OFFICE_ROLES), darüber später (ab dem 2. Land) die KONZERNZENTRALE (C-Level).
 * Die Führungscrew des Büros schaltet danach gestaffelt über eigene Hürden frei.
 */
export const REGIONAL_OFFICE_FOUND_COST = 50_000;

/**
 * Monthly-revenue thresholds that unlock bigger customers (Entscheidungen R2/R3).
 * "Monatsumsatz" is the ROLLING sum of the last 4 completed weeks, re-checked
 * every week — unlocking can happen any week, not just at month end. (Hier oben
 * definiert, weil die Regionalbüro-Hürden unten darauf verweisen.)
 */
export const MEDIUM_UNLOCK_MONTHLY = 120_000;
export const LARGE_UNLOCK_MONTHLY = 600_000;

/** Rolling monthly revenue: sum of the last 4 completed weekly reports. */
export function monthlyRevenue(state: GameState): number {
  return state.reports.slice(-4).reduce((s, r) => s + r.revenue, 0);
}

export interface OfficeRole { emoji: string; title: string; blurb: string }

/**
 * Freischalt-Hürden der Regionalbüro-Rollen. Das Regionalbüro entsteht AUTOMATISCH
 * mit dem 2. Standort, seine Mitarbeiter schalten aber gestaffelt frei — jede Rolle
 * genau dann, wenn man den Engpass, den sie löst, gerade spürt. So wird der neue
 * Standort schrittweise „wieder aufgebaut": man wächst in die Führungscrew hinein,
 * statt sie auf einen Schlag zu bekommen.
 */
export const REGIONAL_UNLOCK = {
  /** Kundenbetreuer: ab so vielen aktiven Kunden am neuen Standort (Süd). */
  KUNDENBETREUER_CUSTOMERS: 5,
  /** Einkaufsleiter: ab so vielen gelisteten Produktgruppen (breite Beschaffung). */
  EINKAUFSLEITER_PRODUCTS: 6,
  /** Personalleiter: ab so vielen Mitarbeitern insgesamt (Organisation braucht HR). */
  PERSONALLEITER_HEADCOUNT: 12,
} as const;

/**
 * Regionalbüro (je Land): HIER sitzt die operative Führung eines Landes — die
 * Marketing-, Kunden-, Einkaufs- und Logistik-Leitung und der Regional-KAM für die
 * landesweit belieferten Großkunden. Jede Rolle nennt ihre Hürde; `role` markiert die
 * bereits mit Mechanik hinterlegten (einstellbaren) Rollen, der Rest ist Vorschau.
 */
export interface RegionalRoleDef extends OfficeRole {
  /** Gesetzt = einstellbar (Mechanik aktiv). Fehlt = Vorschau (Mechanik folgt). */
  role?: Role;
  /** Kurztext der Freischalt-Hürde (immer sichtbar – die „Design-Vorschau"). */
  hurdle: string;
  /** Ist die Hürde erfüllt (Rolle bereit bzw. einstellbar)? */
  unlocked: (state: GameState) => boolean;
  /** Optionaler Live-Fortschritt zur Hürde („3/5 Kunden"). */
  progress?: (state: GameState) => string;
}

const suedCustomers = (s: GameState) => s.customers.filter((c) => c.active && (c.region ?? 'hq') === 'sued').length;

export const REGIONAL_OFFICE_ROLES: RegionalRoleDef[] = [
  {
    emoji: '🧑‍💼', title: 'Regionaldirektor', blurb: 'Führt alle Standorte des Landes.',
    hurdle: 'Kommt mit der Gründung des Regionalbüros.',
    unlocked: (s) => !!s.konzern,
  },
  {
    emoji: '📣', title: 'Marketing-Manager', role: 'marketing',
    blurb: 'Beschleunigt den Ruf – neue Kunden werden schneller aufmerksam, vor allem am jungen Standort.',
    hurdle: 'Sofort nach der Gründung verfügbar – der Bootstrap fürs Mid-Game.',
    unlocked: (s) => !!s.konzern,
  },
  {
    emoji: '🤝', title: 'Kundenbetreuer', blurb: 'Betreut kleine & mittlere Kunden der Region automatisch.',
    hurdle: `Ab ${REGIONAL_UNLOCK.KUNDENBETREUER_CUSTOMERS} Kunden am neuen Standort.`,
    unlocked: (s) => suedCustomers(s) >= REGIONAL_UNLOCK.KUNDENBETREUER_CUSTOMERS,
    progress: (s) => `${Math.min(suedCustomers(s), REGIONAL_UNLOCK.KUNDENBETREUER_CUSTOMERS)}/${REGIONAL_UNLOCK.KUNDENBETREUER_CUSTOMERS} Kunden Süd`,
  },
  {
    emoji: '🛒', title: 'Einkaufsleiter', blurb: 'Bündelt die Beschaffung des ganzen Landes.',
    hurdle: `Ab ${REGIONAL_UNLOCK.EINKAUFSLEITER_PRODUCTS} gelisteten Produktgruppen.`,
    unlocked: (s) => s.products.length >= REGIONAL_UNLOCK.EINKAUFSLEITER_PRODUCTS,
    progress: (s) => `${Math.min(s.products.length, REGIONAL_UNLOCK.EINKAUFSLEITER_PRODUCTS)}/${REGIONAL_UNLOCK.EINKAUFSLEITER_PRODUCTS} Gruppen`,
  },
  {
    emoji: '🚚', title: 'Logistikleiter', role: 'logistik',
    blurb: 'Disponiert automatisch Waren-Transfers übers Verteilzentrum – Regionalprodukte & Großkunden lagerübergreifend, ganz ohne manuelles Verschieben.',
    hurdle: 'Baue erst das Verteilzentrum (auf der Konzern-Karte).',
    unlocked: (s) => !!s.hub,
  },
  {
    emoji: '🏬', title: 'Regional-KAM', role: 'regionalkam',
    blurb: `Betreut die landesweiten Großkunden – bis zu ${3} je Kopf, standortübergreifend beliefert.`,
    hurdle: `Ab ${Math.round(LARGE_UNLOCK_MONTHLY / 1000)}k € Monatsumsatz (Großkunden werden relevant).`,
    unlocked: (s) => monthlyRevenue(s) >= LARGE_UNLOCK_MONTHLY,
    progress: (s) => `${Math.round(monthlyRevenue(s) / 1000)}k / ${Math.round(LARGE_UNLOCK_MONTHLY / 1000)}k €`,
  },
  {
    emoji: '👥', title: 'Personalleiter', blurb: 'Rekrutierung & Training landesweit.',
    hurdle: `Ab ${REGIONAL_UNLOCK.PERSONALLEITER_HEADCOUNT} Mitarbeitern.`,
    unlocked: (s) => s.employees.length >= REGIONAL_UNLOCK.PERSONALLEITER_HEADCOUNT,
    progress: (s) => `${Math.min(s.employees.length, REGIONAL_UNLOCK.PERSONALLEITER_HEADCOUNT)}/${REGIONAL_UNLOCK.PERSONALLEITER_HEADCOUNT} MA`,
  },
];

/** Ein Regional-KAM betreut bis zu so viele Großkunden (Landeskunden). */
export const REGIONAL_KAM_LARGE_SLOTS = 3;

/**
 * Verteilzentrum (Hub): einmalig gebautes Konzern-Bauwerk. Danach kann ein
 * Logistikleiter eingestellt werden, der automatisch Waren-Transfers zwischen den
 * Standorten disponiert — Regionalprodukte (z. B. Fisch nur Nord, Wein/Oliven nur Süd)
 * und Großkunden-Bedarf fließen so lagerübergreifend, ganz ohne manuelles Verschieben.
 */
export const VERTEILZENTRUM_COST = 60_000;

/** Logistikleiter-Auto-Dispatch: Regeln, damit die Automatik flüssig bleibt. */
export const LOGISTIK_AUTO = {
  /** Kassen-Reserve wie beim Standortleiter (Boden + Anteil vom Monatsumsatz). */
  RESERVE_FLOOR: 12_000,
  RESERVE_PER_MONTHLY: 0.25,
  /** Ziel-Vorrat am Zielstandort: so viele Wochen Regionalbedarf abdecken. */
  COVER_WEEKS: 2,
  /** Mindestmenge (Einheiten), ab der ein Auto-Transfer überhaupt gefahren wird
   *  (keine Mini-Fahrten). */
  MIN_UNITS: 40,
  /** Am Absender bleibt mindestens dieser Anteil seines eigenen Wochenbedarfs stehen. */
  SOURCE_KEEP_WEEKS: 1,
} as const;

/** Konzernzentrale: die C-Level-Führung ÜBER mehreren Ländern. Wird erst mit dem
 * ZWEITEN Land freigeschaltet – mit nur einem Land wäre sie redundant zum
 * Regionalbüro. (Platzhalter — Mechanik folgt.) */
export const KONZERN_C_LEVEL: OfficeRole[] = [
  { emoji: '👑', title: 'Vorstandsvorsitz (CEO)', blurb: 'Das bist du – setzt die Strategie des Konzerns.' },
  { emoji: '💰', title: 'Finanzvorstand (CFO)', blurb: 'Kredite, Budget & Investitionen konzernweit.' },
  { emoji: '⚙️', title: 'Operativ-Vorstand (COO)', blurb: 'Effizienz & Kennzahlen über alle Länder.' },
  { emoji: '📣', title: 'Marketing-Vorstand (CMO)', blurb: 'Konzernweite Kampagnen vergrößern jeden Markt.' },
  { emoji: '🌍', title: 'Expansions-Vorstand', blurb: 'Erschließt neue Länder für den Konzern.' },
];

export const STANDORTLEITER_AUTO = {
  /** Untergrenze der Kassen-Reserve; darüber skaliert sie mit dem Monatsumsatz. */
  RESERVE_FLOOR: 15_000,
  RESERVE_PER_MONTHLY: 0.3,
  /** Wocheneinheiten je Lagerkraft (Zielbesatzung = Volumen / diesen Wert). */
  UNITS_PER_WORKER: 180,
  MAX_LAGER: 16,
  MAX_TABLES: 20,
  /** Crew je Packtisch (Tische = floor(Crew / diesen Wert)). */
  LAGER_PER_TABLE: 1.5,
  /** Crew bis zu diesem Ø-Skill hochtrainieren (billigster Durchsatz-Hebel). */
  TRAIN_UNTIL_AVG_SKILL: 90,
} as const;

/**
 * Vertrieb (Sales): each rep's skill-weighted power (0.5 + 0.5×Skill/100)
 * ENLARGES every tier's addressable market (see INQUIRY_MARKET) rather than
 * adding a flat chance. Because the same saturation curve then applies, hiring
 * more reps has sharply diminishing marginal value and can never push past the
 * base rate — spamming reps is self-limiting. Early game the extra reach means
 * more small customers (reach 120k faster); once the small market saturates,
 * the reps' value shifts to keeping the rarer medium/large pipeline flowing —
 * the late-game reason to keep a sales team. (Needs a free desk, like every
 * office role.) Tune here + verify in the harness.
 */
export const SALES_MARKET_PER_REP = 10;

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
  kaese: 0.9,
  obst: 1.3,
  tiefkuehl: 1.0,
  delikatess: 0.5,
  wein: 0.7,
  oliven: 1.0,
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
  /** Kühlpflichtig: lagert AUSSCHLIESSLICH in Kühlregalen (Regale auf ❄️
   * Kühlbereich-Kacheln). Ohne ein einziges Kühlregal verdirbt die Ware stark
   * beschleunigt (NO_COOLING_SPOILAGE_MULT). */
  requiresCooling?: boolean;
  /** Regional-exklusiv (L3): der Lieferant liefert dieses Produkt NUR an diesen
   * Standort. Am anderen Standort kommt es ausschließlich per LKW-Transfer an.
   * Undefined = überall lieferbar. */
  exclusiveSite?: SiteId;
}

/** Ohne Kühl-Lagerplatz schrumpft die Haltbarkeit kühlpflichtiger Produkte auf
 * diesen Anteil – der Anreiz, für Käse/Tiefkühl/Feinkost einen Kühlbereich mit
 * Regalen zu bauen. */
export const NO_COOLING_SPOILAGE_MULT = 0.3;

/** Ein Einkäufer betreut maximal so viele Produktgruppen (Auto-Bestellung +
 * Preisverhandlung). Breiteres Sortiment braucht mehr Einkäufer — Wachstum
 * kostet Struktur, nicht nur Geld. */
export const BUYER_PRODUCT_CAPACITY = 3;

/** Kosten, eine Lager-Kachel als ❄️ Kühlbereich zu markieren. */
export const COOL_TILE_PRICE = 500;

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
  // --- Späte Produktgruppen (Late Game): eigene Profile + steigende Listungs-
  // gebühren. Die Freischaltung kommt bewusst FRÜHER, als man sie sich bequem
  // leisten kann — wer sofort zugreift (Gebühr + Kühlbereich + teurer Waren-
  // einsatz), kann sich übernehmen; wer wartet, wächst langsamer. Kühlpflichtige
  // Gruppen lagern ausschließlich in Kühlregalen (❄️ Kühlbereich im Bau-Modus).
  { id: 'kaese', name: 'Käse & Molkerei', emoji: '🧀', einkaufspreis: 22, verkaufspreis: 40, zielmarge: 45, spoilageDays: 30, unlockWeek: 14, listingFee: 3000, requiresCooling: true },
  { id: 'obst', name: 'Obst & Frische', emoji: '🍎', einkaufspreis: 12, verkaufspreis: 20, zielmarge: 40, spoilageDays: 10, unlockWeek: 20, listingFee: 6000 },
  { id: 'tiefkuehl', name: 'Tiefkühlkost', emoji: '🧊', einkaufspreis: 28, verkaufspreis: 52, zielmarge: 46, spoilageDays: 90, unlockWeek: 30, listingFee: 18000, requiresCooling: true },
  { id: 'delikatess', name: 'Feinkost', emoji: '🦞', einkaufspreis: 60, verkaufspreis: 120, zielmarge: 50, spoilageDays: 25, unlockWeek: 42, listingFee: 45000, requiresCooling: true },
  // --- Süd-Regionalprodukte (L3): nur mit eröffnetem Standort Süd listbar, der
  // Lieferant liefert sie NUR dorthin. Nord-Kunden bekommen sie per Transfer.
  { id: 'wein', name: 'Wein & Sekt', emoji: '🍷', einkaufspreis: 35, verkaufspreis: 62, zielmarge: 44, spoilageDays: 180, unlockWeek: 26, listingFee: 12000, exclusiveSite: 'sued' },
  { id: 'oliven', name: 'Antipasti & Oliven', emoji: '🫒', einkaufspreis: 18, verkaufspreis: 33, zielmarge: 45, spoilageDays: 35, unlockWeek: 26, listingFee: 9000, requiresCooling: true, exclusiveSite: 'sued' },
];

// ============================================================================
// Artikel-Ebene (Stufe 3, Late-Game-Verfeinerung ÜBER den Gruppen). Ein Artikel
// ist eine benannte Stadt- oder Landes-SPEZIALITÄT innerhalb einer Produktgruppe.
// Wirtschaft & Lager laufen weiter über die GRUPPE (der Artikel erbt sie) — der
// Übergang von Gruppen zu Artikeln passiert allein über die KUNDEN: vor allem
// Großkunden entwickeln über die Zeit den Wunsch nach immer mehr Spezialitäten.
// „home" = Heimatstadt (nur dort heimisch); 'national' = landesweit verfügbar.
// Ein Artikel ist erst listbar, wenn seine GRUPPE im Sortiment ist.
// ============================================================================
export interface ArticleDef {
  id: string;
  name: string;
  emoji: string;
  /** Produktgruppe (Kategorie), zu der der Artikel gehört. */
  groupId: ProductId;
  /** Heimat: nur in dieser Stadt heimisch, oder 'national' (überall). */
  home: SiteId | 'national';
  /** SKU-Ökonomie: eigener Einkaufs-/Verkaufspreis je Artikel. */
  einkaufspreis: number;
  verkaufspreis: number;
  /** Optional abweichende Zielmarge / Haltbarkeit; sonst von der Gruppe geerbt. */
  zielmarge?: number;
  spoilageDays?: number;
}

// ============================================================================
// ARTICLE_CATALOG (Phase B1) — der volle Artikel-Katalog: jede der 9 Gruppen wird
// in mehrere konkrete Artikel (SKUs) mit EIGENER Ökonomie aufgefächert. Kühlpflicht
// und Regional-Exklusivität erbt der Artikel von seiner Gruppe (ProductDef); Marge
// und Haltbarkeit können je Artikel abweichen, sonst Gruppen-Default.
// Additiv: der laufende (gruppenbasierte) Übergangs-Motor nutzt weiter nur die
// Legacy-Teilmenge ARTICLE_DEFS (eine Spezialität je Gruppe). Phase B2 schaltet
// Lager/Aufträge/Einkauf/Empfehlung auf die Artikel-Ebene um.
// ============================================================================
export const ARTICLE_CATALOG: ArticleDef[] = [
  // 🐟 Fisch (Gruppe EK20 / VK33,5)
  { id: 'lachs', name: 'Lachsfilet', emoji: '🐟', groupId: 'fisch', home: 'national', einkaufspreis: 22, verkaufspreis: 37 },
  { id: 'kabeljau', name: 'Kabeljau', emoji: '🐟', groupId: 'fisch', home: 'national', einkaufspreis: 18, verkaufspreis: 30 },
  { id: 'forelle', name: 'Forelle', emoji: '🐟', groupId: 'fisch', home: 'national', einkaufspreis: 16, verkaufspreis: 27 },
  { id: 'krabben', name: 'Nordsee-Krabben', emoji: '🦐', groupId: 'fisch', home: 'hq', einkaufspreis: 28, verkaufspreis: 48 },
  // 🥩 Fleisch (EK15 / VK25)
  { id: 'rinderhack', name: 'Rinderhack', emoji: '🥩', groupId: 'fleisch', home: 'national', einkaufspreis: 14, verkaufspreis: 23 },
  { id: 'schweinefilet', name: 'Schweinefilet', emoji: '🥓', groupId: 'fleisch', home: 'national', einkaufspreis: 16, verkaufspreis: 27 },
  { id: 'haehnchen', name: 'Hähnchenbrust', emoji: '🍗', groupId: 'fleisch', home: 'national', einkaufspreis: 11, verkaufspreis: 18 },
  { id: 'weiderind', name: 'Holsteiner Weiderind', emoji: '🐄', groupId: 'fleisch', home: 'hq', einkaufspreis: 24, verkaufspreis: 42 },
  // 🥦 Gemüse (EK10 / VK16,5)
  { id: 'kartoffeln', name: 'Kartoffeln', emoji: '🥔', groupId: 'gemuese', home: 'national', einkaufspreis: 7, verkaufspreis: 12 },
  { id: 'brokkoli', name: 'Brokkoli', emoji: '🥦', groupId: 'gemuese', home: 'national', einkaufspreis: 11, verkaufspreis: 18 },
  { id: 'tomaten', name: 'Tomaten', emoji: '🍅', groupId: 'gemuese', home: 'national', einkaufspreis: 12, verkaufspreis: 20 },
  { id: 'zwiebeln', name: 'Zwiebeln', emoji: '🧅', groupId: 'gemuese', home: 'national', einkaufspreis: 6, verkaufspreis: 10 },
  // 🧀 Käse & Molkerei (EK22 / VK40, kühlpflichtig)
  { id: 'gouda', name: 'Gouda', emoji: '🧀', groupId: 'kaese', home: 'national', einkaufspreis: 18, verkaufspreis: 32 },
  { id: 'emmentaler', name: 'Emmentaler', emoji: '🧀', groupId: 'kaese', home: 'national', einkaufspreis: 22, verkaufspreis: 40 },
  { id: 'frischkaese', name: 'Frischkäse', emoji: '🧈', groupId: 'kaese', home: 'national', einkaufspreis: 16, verkaufspreis: 28, spoilageDays: 18 },
  { id: 'bergkaese', name: 'Allgäuer Bergkäse', emoji: '🧀', groupId: 'kaese', home: 'sued', einkaufspreis: 30, verkaufspreis: 55 },
  // 🍎 Obst & Frische (EK12 / VK20)
  { id: 'aepfel', name: 'Äpfel', emoji: '🍎', groupId: 'obst', home: 'national', einkaufspreis: 10, verkaufspreis: 17, spoilageDays: 14 },
  { id: 'bananen', name: 'Bananen', emoji: '🍌', groupId: 'obst', home: 'national', einkaufspreis: 9, verkaufspreis: 15 },
  { id: 'erdbeeren', name: 'Erdbeeren', emoji: '🍓', groupId: 'obst', home: 'national', einkaufspreis: 16, verkaufspreis: 28, spoilageDays: 6 },
  { id: 'bodensee', name: 'Bodensee-Äpfel', emoji: '🍎', groupId: 'obst', home: 'sued', einkaufspreis: 14, verkaufspreis: 24, spoilageDays: 14 },
  // 🧊 Tiefkühlkost (EK28 / VK52, kühlpflichtig)
  { id: 'tk_pizza', name: 'TK-Pizza', emoji: '🍕', groupId: 'tiefkuehl', home: 'national', einkaufspreis: 20, verkaufspreis: 36 },
  { id: 'tk_gemuese', name: 'TK-Gemüse', emoji: '🥦', groupId: 'tiefkuehl', home: 'national', einkaufspreis: 14, verkaufspreis: 25 },
  { id: 'tk_pommes', name: 'TK-Pommes', emoji: '🍟', groupId: 'tiefkuehl', home: 'national', einkaufspreis: 12, verkaufspreis: 22 },
  { id: 'wagyu', name: 'Wagyu-Rücken', emoji: '🥩', groupId: 'tiefkuehl', home: 'national', einkaufspreis: 95, verkaufspreis: 190 },
  // 🦞 Feinkost (EK60 / VK120, kühlpflichtig)
  { id: 'hummer', name: 'Hummer', emoji: '🦞', groupId: 'delikatess', home: 'national', einkaufspreis: 70, verkaufspreis: 140 },
  { id: 'kaviar', name: 'Kaviar', emoji: '🫙', groupId: 'delikatess', home: 'national', einkaufspreis: 120, verkaufspreis: 240 },
  { id: 'gaenseleber', name: 'Gänseleber', emoji: '🦆', groupId: 'delikatess', home: 'national', einkaufspreis: 80, verkaufspreis: 160 },
  { id: 'trueffel', name: 'Périgord-Trüffel', emoji: '🍄', groupId: 'delikatess', home: 'national', einkaufspreis: 140, verkaufspreis: 280 },
  // 🍷 Wein & Sekt (EK35 / VK62, Süd-exklusiv)
  { id: 'rotwein', name: 'Rotwein', emoji: '🍷', groupId: 'wein', home: 'national', einkaufspreis: 30, verkaufspreis: 54 },
  { id: 'weisswein', name: 'Weißwein', emoji: '🥂', groupId: 'wein', home: 'national', einkaufspreis: 28, verkaufspreis: 50 },
  { id: 'sekt', name: 'Sekt', emoji: '🍾', groupId: 'wein', home: 'national', einkaufspreis: 40, verkaufspreis: 72 },
  { id: 'champagner', name: 'Champagner', emoji: '🍾', groupId: 'wein', home: 'national', einkaufspreis: 60, verkaufspreis: 108 },
  // 🫒 Antipasti & Oliven (EK18 / VK33, kühlpflichtig, Süd-exklusiv)
  { id: 'gruene_oliven', name: 'Grüne Oliven', emoji: '🫒', groupId: 'oliven', home: 'national', einkaufspreis: 16, verkaufspreis: 29 },
  { id: 'schwarze_oliven', name: 'Schwarze Oliven', emoji: '🫒', groupId: 'oliven', home: 'national', einkaufspreis: 18, verkaufspreis: 33 },
  { id: 'antipasti', name: 'Antipasti-Mix', emoji: '🥗', groupId: 'oliven', home: 'national', einkaufspreis: 22, verkaufspreis: 40 },
  { id: 'sonnentomaten', name: 'Getrocknete Tomaten', emoji: '🍅', groupId: 'oliven', home: 'national', einkaufspreis: 20, verkaufspreis: 36 },
];

/** Legacy-Spezialitäten (Stufe-3-Übergang): genau eine je Gruppe. Der aktuelle
 * gruppenbasierte Übergangs-Motor (developProductLines) nutzt weiter NUR diese
 * Teilmenge, damit Phase B1 rein additiv ist. Phase B2 ersetzt das durch den
 * vollen Katalog auf Artikel-Ebene. */
const LEGACY_SPECIALTY_IDS = new Set(['krabben', 'weiderind', 'bergkaese', 'bodensee', 'trueffel', 'wagyu']);
export const ARTICLE_DEFS: ArticleDef[] = ARTICLE_CATALOG.filter((a) => LEGACY_SPECIALTY_IDS.has(a.id));

export function getArticleDef(id: string): ArticleDef | undefined {
  return ARTICLE_CATALOG.find((a) => a.id === id);
}

/** Alle Artikel einer Gruppe (Katalog-Reihenfolge). */
export function articlesOfGroup(groupId: ProductId): ArticleDef[] {
  return ARTICLE_CATALOG.filter((a) => a.groupId === groupId);
}

/** Die Gruppe (Kategorie) eines Artikels. */
export function groupOfArticle(id: string): ProductId | undefined {
  return getArticleDef(id)?.groupId;
}

/** Der „Leit-Artikel" einer Gruppe (erster im Katalog) — die Standard-SKU, wenn nur
 * die Gruppe bekannt ist (Tutorial, Starter-Bestand). */
export function defaultArticleOf(groupId: ProductId): ArticleDef {
  return articlesOfGroup(groupId)[0];
}

/** Wählt einen konkreten Artikel einer Gruppe für einen Kunden aus der Region:
 * bevorzugt einen in DIESER Stadt heimischen Artikel, sonst einen landesweiten,
 * sonst den Leit-Artikel. So bekommen Süd-Kunden ihre Regional-Spezialitäten. */
export function pickArticleForRegion(groupId: ProductId, region: SiteId = 'hq'): ArticleDef {
  const arts = articlesOfGroup(groupId);
  const home = arts.filter((a) => a.home === region);
  const national = arts.filter((a) => a.home === 'national');
  const pool = home.length ? home : national.length ? national : arts;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Aufgelöste Artikel-Ökonomie inkl. der von der Gruppe geerbten Felder
 * (Kühlpflicht, Regional-Exklusivität, sowie Marge/Haltbarkeit als Default).
 * Grundlage für Phase B2 (Lager/Aufträge/Einkauf auf Artikel-Ebene). */
export interface ArticleEconomics {
  einkaufspreis: number;
  verkaufspreis: number;
  zielmarge: number;
  spoilageDays: number;
  requiresCooling: boolean;
  exclusiveSite?: SiteId;
  name: string;
  emoji: string;
  groupId: ProductId;
  home: SiteId | 'national';
}
export function articleEconomics(id: string): ArticleEconomics | undefined {
  const a = getArticleDef(id);
  if (!a) return undefined;
  const g = getProductDef(a.groupId);
  return {
    einkaufspreis: a.einkaufspreis,
    verkaufspreis: a.verkaufspreis,
    zielmarge: a.zielmarge ?? g.zielmarge,
    spoilageDays: a.spoilageDays ?? g.spoilageDays,
    requiresCooling: !!g.requiresCooling,
    exclusiveSite: g.exclusiveSite,
    name: a.name,
    emoji: a.emoji,
    groupId: a.groupId,
    home: a.home,
  };
}

/** Wie viele FREMD-Artikel (über die eigene Stadt + landesweite hinaus) ein Kunde je
 * Größe listen kann — die „Reichweite": Großkunden alles, Mittelkunden bis zu 3
 * weitere, Kleinkunden genau einen aus einer anderen Stadt. */
export const ARTICLE_REACH: Record<CustomerType, number> = {
  small: 1,
  medium: 3,
  large: Infinity,
};

/** Ab dieser Woche beginnen Kunden, Spezialitäten-Artikel zu entwickeln — davor ist
 * das Spiel bewusst rein Gruppen-basiert (der Übergang setzt erst im Late-Game ein,
 * wenn der Betrieb steht — Jahr 1 bleibt so ganz beim Gruppen-Spiel). */
export const ARTICLE_DEV_START_WEEK = 24;
/** Ein Kunde entwickelt Spezialitäten erst, wenn er DICH schon so viele Wochen kennt
 * (Geschmack entwickelt sich über die Zeit) — junge, noch wacklige Kunden im Aufbau
 * bleiben beim Gruppen-Geschäft. */
export const ARTICLE_DEV_CUSTOMER_AGE = 24;
/** Wöchentliche Chance je aktivem Kunden, eine neue Artikel-Linie zu entwickeln
 * (nur solange die Reichweite es erlaubt). Großkunden treiben den Übergang. */
export const ARTICLE_DEV_CHANCE: Record<CustomerType, number> = {
  small: 0.02,
  medium: 0.05,
  large: 0.14,
};
/** Spezialitäten sind PREMIUM & NISCHIG: eine NEUE Artikel-Linie hat nur diesen
 * Bruchteil der üblichen Menge (kein Durchsatz-Schock, aber echte Sammel-Tiefe).
 * Wird eine bestehende Gruppen-Linie zur Spezialität veredelt, bleibt ihre Menge. */
export const ARTICLE_VOLUME_FACTOR = 0.4;

/** Umgekehrt ist 🐟 Fisch Küstenware: der Lieferant bringt ihn nur ans
 * HAUPTLAGER (Nord) — der Süden bekommt Fisch ausschließlich per Transfer.
 * (Als Konstante statt im def, damit alte Spielstände/Tests unberührt bleiben,
 * solange kein Standort existiert.) */
export const HQ_EXCLUSIVE_PRODUCTS: ProductId[] = ['fisch'];

/** Liefert der Lieferant diesen Artikel an diesen Standort? (Exklusivität erbt der
 * Artikel von seiner Gruppe.) Akzeptiert Artikel- ODER Gruppen-Id. */
export function supplierDeliversTo(id: ArticleId, siteId: SiteId): boolean {
  const group = (groupOfArticle(id) ?? id) as ProductId;
  const def = getProductDef(group);
  if (def.exclusiveSite) return def.exclusiveSite === siteId;
  if (HQ_EXCLUSIVE_PRODUCTS.includes(group)) return siteId === 'hq';
  return true;
}

// ============================================================================
// Standorte (L3) — Konzern-Gameplay: das Hauptlager (Nord) plus ein eröffenbarer
// Standort Süd mit eigener Halle, eigenem Regionalmarkt und Regionalprodukten.
// Verwaltung (Büro, KAMs, Einkäufer, Vertrieb) bleibt zentral im Hauptlager.
// ============================================================================

/** Städte je Land. `poolFactor` skaliert den Kundenpool (kleine Stadt = wenig, teuer
 * & prestigeträchtig die Hauptstadt). hq (Nord) ist der kalibrierte Heimat-Hub (1.0);
 * KEINE feste Eröffnungs-Reihenfolge — jede Stadt ist über ihre Umsatz-Hürde & ihren
 * Preis frei wählbar. Auf die HAUPTSTADT (capital) arbeitet man als Endgame hin. */
export const SITE_META: Record<SiteId, { name: string; short: string; emoji: string; poolFactor: number; capital?: boolean }> = {
  hq: { name: 'Hauptlager Nord', short: 'Nord', emoji: '🏭', poolFactor: 1.0 },
  suedwest: { name: 'Standort Stuttgart', short: 'Stuttgart', emoji: '🏬', poolFactor: 0.6 },
  west: { name: 'Standort Köln', short: 'Köln', emoji: '🏢', poolFactor: 0.9 },
  mitte: { name: 'Standort Frankfurt', short: 'Frankfurt', emoji: '🏦', poolFactor: 1.1 },
  sued: { name: 'Standort Süd', short: 'Süd', emoji: '🏗️', poolFactor: 1.3 },
  ost: { name: 'Hauptstadt Berlin', short: 'Berlin', emoji: '🏙️', poolFactor: 1.8, capital: true },
};
/** Stabile Iterations-/Anzeige-Reihenfolge der Zweigstellen (NICHT die Eröffnungs-
 * Reihenfolge — die ist frei). hq steht nicht hier. */
export const BRANCH_ORDER: SiteId[] = ['suedwest', 'west', 'mitte', 'sued', 'ost'];
/** Kundenpool-Faktor einer Stadt (1.0 = Heimat-Hub). */
export function cityPoolFactor(site: SiteId): number {
  return SITE_META[site].poolFactor;
}
/** Basis-Werte für die kleinste Zweigstelle; größere Städte skalieren mit poolFactor
 * (mehr Pool → höhere Hürde & höherer Preis, die Hauptstadt ist das Endgame). */
export const BRANCH_UNLOCK_MONTHLY = 180_000;
export const BRANCH_PRICE = 90_000;
/** Umsatz-Hürde einer Stadt: skaliert mit ihrem Pool-Faktor. */
export function branchUnlockMonthly(site: SiteId): number {
  return Math.round(BRANCH_UNLOCK_MONTHLY * cityPoolFactor(site));
}
/** Eröffnungspreis einer Stadt: skaliert mit ihrem Pool-Faktor. */
export function branchPrice(site: SiteId): number {
  return Math.round(BRANCH_PRICE * cityPoolFactor(site));
}
/** Zusätzliche Monatsmiete des Standorts (wächst mit dessen Erweiterungen wie im
 * Hauptlager über RENT_PER_EXPANSION). */
export const BRANCH_RENT = 1_500;
/** Eröffnet der Standort eine neue Region, wächst der erreichbare Markt: Faktor
 * auf die Marktgrößen der Akquise (Anti-Sättigung — der Sinn der Expansion). */
export const BRANCH_MARKET_BONUS = 1.6;
/** Anteil neuer Anfragen aus Region Süd, sobald der Standort offen ist. */
export const BRANCH_INQUIRY_SHARE = 0.45;
/** LKW-Transfer zwischen Standorten: Kosten je Palette (FREMD-Spediteur) + Fahrzeit
 * in Tagen. Mit eigenem Fuhrpark fahren Paletten günstiger — bis zur Fuhrpark-
 * Kapazität, der Rest zum Fremd-Tarif als Überlauf (siehe transferCost). */
export const TRANSFER_COST_PER_PALLET = 90;
export const TRANSFER_DAYS = 1;
/** Transfer-Palettenpreis mit EIGENEM Fuhrpark (statt Fremd-Spediteur). */
export const TRANSFER_COST_OWN_PER_PALLET = 35;

/**
 * Fuhrpark-Fahrzeugklassen: vier Größen mit eigener Palettenkapazität, einmaligem
 * Kaufpreis und laufenden Monatskosten (Instandhaltung + Treibstoff). Größere Fahrzeuge
 * sind pro Palette günstiger (Skaleneffekt) — aber die Monatskosten binden dich, also
 * skalierst du den Fuhrpark auf dein Transfer-Volumen. Die Gesamtkapazität bestimmt,
 * wie viele Paletten je Fahrt zum günstigen Eigen-Tarif reisen (Überlauf: Fremd-Tarif),
 * und senkt zusätzlich die Kunden-Abholkosten.
 */
export interface VehicleDef {
  id: VehicleId;
  name: string;
  emoji: string;
  /** Palettenkapazität je Fahrt (günstiger Eigen-Tarif bis zu dieser Summe). */
  capacity: number;
  /** Einmaliger Kaufpreis. */
  price: number;
  /** Laufende Monatskosten (Instandhaltung + Treibstoff). */
  monthly: number;
}
export const FLEET_VEHICLES: VehicleDef[] = [
  { id: 'transporter', name: 'Transporter', emoji: '🚐', capacity: 5, price: 14_000, monthly: 400 },
  { id: 'lkw', name: 'LKW', emoji: '🚚', capacity: 10, price: 26_000, monthly: 700 },
  { id: 'sattelzug', name: 'Sattelzug', emoji: '🚛', capacity: 20, price: 48_000, monthly: 1_200 },
  { id: 'lastzug', name: 'Lastzug', emoji: '🚛', capacity: 30, price: 68_000, monthly: 1_600 },
];
export function getVehicleDef(id: VehicleId): VehicleDef {
  return FLEET_VEHICLES.find((v) => v.id === id)!;
}
/** Die Fuhrpark-Gesamtkapazität senkt die Abholkosten je Palette Kapazität … */
export const PICKUP_SAVE_PER_CAPACITY = 0.008;
/** … bis zu diesem Multiplikator-Boden (max. 60 % Ersparnis). */
export const PICKUP_SAVE_FLOOR = 0.4;

export function getProductDef(id: ProductId): ProductDef {
  return PRODUCT_DEFS.find((d) => d.id === id)!;
}

/** Seasonal demand multipliers per quarter (Q1..Q4) per product. */
export const SEASONAL_TREND: Record<ProductId, [number, number, number, number]> = {
  //          Q1(Winter) Q2(Frühj.) Q3(Sommer) Q4(Herbst)
  fisch: [0.85, 1.05, 1.3, 1.1],
  fleisch: [1.2, 1.1, 0.95, 1.15],
  gemuese: [0.9, 1.05, 1.15, 1.05],
  kaese: [1.1, 1.0, 0.95, 1.05],
  obst: [0.8, 1.0, 1.4, 1.0], // Frisches Obst boomt im Sommer
  tiefkuehl: [1.0, 0.95, 1.35, 0.95], // Tiefkühl (Eis!) im Sommer
  delikatess: [1.15, 0.9, 0.85, 1.3], // Feinkost zu den Feiertagen (Q4/Winter)
  wein: [1.1, 0.95, 1.0, 1.35], // Wein zu den Festen (Q4)
  oliven: [0.9, 1.05, 1.3, 1.0], // Antipasti im Sommer
};

export const QUARTER_LABEL = ['Q1 · Winter', 'Q2 · Frühjahr', 'Q3 · Sommer', 'Q4 · Herbst'];

/**
 * Renown (Ruf, 0..100) — die Bekanntheit deiner Marke, PRO STANDORT aufgebaut und
 * PRO LAND aggregiert. Guter Service und viele zufriedene Kunden bauen den Ruf eines
 * Standorts über die Zeit auf; hoher Ruf zieht schneller Neukunden an. Der Clou für
 * das Mid-Game: ein neu eröffneter Standort ERBT einen Teil des Landes-Rufs und
 * wächst dadurch schneller als der erste (der bei Null anfing). Der Marketing-Manager
 * (Konzern-Rolle) wird den Aufbau später zusätzlich beschleunigen.
 */
export const RENOWN = {
  MAX: 100,
  /** Ruf nähert sich seinem Zielwert je Woche um diesen Anteil (träge – baut sich auf). */
  EASE: 0.06,
  /** Zielwert-Beitrag je aktivem Kunden am Standort. */
  PER_CUSTOMER: 3.5,
  /** Zielwert-Bonus je Stern Service über 3★. */
  SERVICE_BONUS: 14,
  /** Ein neuer Standort startet mit diesem Anteil des aktuellen Landes-Rufs. */
  NEW_SITE_INHERIT: 0.7,
  /** Landes-Ruf hebt die GESAMT-Neukunden-Rate nur sanft (ein bekannter Name zieht
   *  etwas mehr an) — der eigentliche „neue Standorte wachsen schneller"-Effekt kommt
   *  aus der ruf-gewichteten Regions-Verteilung (bilanzneutral), nicht aus mehr
   *  Gesamtwachstum, das sonst nur die Durchsatzwand früher auslöst. */
  ACQUISITION_BOOST: 0.18,
  /** Basis-Gewicht je Region bei der Anfrage-Verteilung (damit auch ein Standort
   *  mit 0 Ruf noch Anfragen bekommt); der Ruf kommt additiv oben drauf. */
  REGION_BASE: 12,
  /** Marketing-Manager: jede Einheit Marketing-Kraft (skill-gewichtet, wie Vertrieb)
   *  beschleunigt die wöchentliche Ruf-Annäherung um diesen Faktor. Da der Ruf sich
   *  seinem Ziel nur um EASE nähert, wirkt ein höheres Tempo absolut am stärksten,
   *  wenn der Abstand groß ist — also am jungen Standort, „vor allem initial". */
  MARKETING_SPEED: 0.7,
  /** Deckel für das beschleunigte Tempo (sonst würde der Ruf schlagartig springen). */
  MAX_EASE: 0.22,
};

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
 * New-customer acquisition is a PER-TIER saturation curve: each customer size
 * has its OWN market that saturates against how many customers of THAT size you
 * already have. Weekly chance for a tier = BASE × market/(market + Kunden dieser
 * Größe), rolled only when the tier is unlocked AND has free KAM capacity.
 * Vertrieb enlarges the market (SALES_MARKET_PER_REP).
 *
 * Why per-tier: a big pile of small customers no longer suppresses the rare,
 * valuable medium/large inquiries. Small saturates around ~14 (keeps the list
 * manageable in multi-year runs); medium is a handful; large are endgame
 * trophies. Early game ≈ 0.79/Woche small (wie gehabt); at 17 small ≈ 0.41, at
 * 40 small ≈ 0.23 — growth then shifts to developing existing customers and, in
 * the late game, to landing the bigger tiers.
 */
export const INQUIRY_MARKET: Record<CustomerType, number> = {
  small: 14,
  medium: 5,
  large: 2,
};
// Basis-Wochenchance je Größe. Nach dem Wechsel aufs Marktanteil-Modell nachkalibriert
// (die Sättigung läuft jetzt gegen Basis-Markt + Konkurrenz statt nur gegen deine Zahl),
// sodass die Neukunden-RATE praktisch wie zuvor bleibt.
export const INQUIRY_BASE_CHANCE: Record<CustomerType, number> = {
  small: 1.1,
  medium: 0.72,
  large: 0.48,
};

/**
 * Marktanteil-Modell (entkoppelt). Der Gesamt-Markt je Stadt ist eine wachsende
 * Marktgröße, die KUNDENMECHANIK läuft SEPARAT darüber (Akquise/Churn/Abwerbung), nichts
 * wird aus einem festen Pool „herausgerechnet". Der Markt = BASE + bereits bediente Kunden
 * (deine + die der Konkurrenz) → er WÄCHST mit dem Markt, kein harter Deckel; der Marktanteil
 * = deine Kunden ÷ (deine + Konkurrenz). Die Akquise-RATE saturiert am BASIS-Markt (je mehr du
 * schon hast, desto seltener Neue) + Service- & Ruf-Faktor + Vertrieb (Vertrieb & Ruf heben die
 * RATE, nicht den Pool). Große Kunden: kleiner FIXER Pool je LAND (kein Wachstum) — sie werden
 * dafür mit der Zeit „groß" (listen alle Produkte). */
export const MARKET = {
  /** Basis-Markt je Stadt (klein/mittel wachsen mit dem bedienten Markt); large = FIX PRO LAND. */
  BASE: { small: 30, medium: 8, large: 5 } as Record<CustomerType, number>,
  /** Anteil des BASIS-Markts, den die Konkurrenz hält (Stage 1 fix; Stage 2 dynamisch je
   *  Aggressivität & deinem Service). */
  COMPETITOR_SHARE: 0.6,
  /** Service-Faktor auf die Akquise-Rate (neutral bei 3★): 1 + 0.1×(Sterne−3), Boden … 1.2. */
  SERVICE_FLOOR: 0.6,
  /** Vertrieb hebt die Gewinn-RATE (nicht mehr den Pool): +dieser Anteil je Vertriebs-Kraft.
   *  Kalibriert, sodass 2 Vertriebskräfte ~+14 % geben — wie der alte Markt-Vergrößerungs-Effekt;
   *  ein Vertriebs-schweres Team (5 Kräfte) skaliert die Rate stärker (~+38 %) und hält so den
   *  aggressiven Wachstumspfad (Richtung 600k) offen, ohne den ruhigen Basispfad zu beschleunigen. */
  SALES_RATE_BONUS: 0.09,
} as const;

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

// ============================================================================
// Paket 2 — Investitionen & Ausrüstung
// Two kinds of investment relieve bottlenecks so "hire more people" isn't the
// only lever:
//  • PER-WORKER devices (forklift, picking cart) — physical machines bought in
//    COUNT. Each one speeds exactly ONE worker who is actively using it, so you
//    need about as many as you have workers doing that job at once. Auto-assigned
//    by the simulation; visible in the hall.
//  • FACILITY upgrades (cooling, own truck) — building-wide, bought in LEVELS,
//    they help the whole operation (can't be "per user").
// Everything flows into the Betriebs-Cockpit.
// ============================================================================
/** A single device makes its user this much faster (per-worker devices). */
export const FORKLIFT_PUTAWAY_SPEED = 0.35; // a worker WITH a forklift einlagert this much faster
export const PACKSTATION_PREP_SPEED = 0.3; // a worker WITH a picking cart herrichtet this much faster
/** Per-level effect strengths (facility upgrades). */
export const COOLING_SHELFLIFE_BONUS = 0.25; // Haltbarkeit extended per level

/** How many of each per-worker device you may own (soft cap ≈ max sensible crew). */
export const MAX_FORKLIFTS = 8;
export const MAX_CARTS = 8;
export const FORKLIFT_PRICE = 3200; // flat, per unit — buy one per worker
export const CART_PRICE = 2000; // flat, per unit

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  icon: string;
  desc: string;
  /** 'perWorker' = bought in count, each helps one active worker; 'facility' =
   * bought in levels, building-wide. */
  kind: 'perWorker' | 'facility';
  /** Max owned count (perWorker) or max level (facility). */
  max: number;
  /** Price for the NEXT unit/level (n = the count/level you'd own after buying). */
  price: (n: number) => number;
  /** Human-readable effect for a given owned count/level. */
  effectLabel: (n: number) => string;
}

export const EQUIPMENT_DEFS: EquipmentDef[] = [
  {
    id: 'forklift',
    name: 'Gabelstapler',
    icon: '🚜',
    desc: 'Physisches Gerät: beschleunigt das Einlagern für EINEN Mitarbeiter, der ihn gerade fährt. Für alle gleichzeitig einlagernden Kräfte brauchst du entsprechend viele.',
    kind: 'perWorker',
    max: MAX_FORKLIFTS,
    price: () => FORKLIFT_PRICE,
    effectLabel: (n) => (n > 0 ? `${n}× · beschleunigt ${n} gleichzeitige Einlager-Vorgänge um ${Math.round(FORKLIFT_PUTAWAY_SPEED * 100)}%` : 'keiner'),
  },
  {
    id: 'packstation',
    name: 'Kommissionierwagen',
    icon: '🛒',
    desc: 'Physisches Gerät: beschleunigt das Herrichten für EINEN Mitarbeiter, der ihn gerade nutzt. Einer je gleichzeitig herrichtender Kraft für vollen Effekt.',
    kind: 'perWorker',
    max: MAX_CARTS,
    price: () => CART_PRICE,
    effectLabel: (n) => (n > 0 ? `${n}× · beschleunigt ${n} gleichzeitige Herricht-Vorgänge um ${Math.round(PACKSTATION_PREP_SPEED * 100)}%` : 'keiner'),
  },
  {
    id: 'cooling',
    name: 'Kühltechnik',
    icon: '❄️',
    desc: 'Betriebsweite Anlage: bessere Isolierung & Klimatisierung verlängern die Haltbarkeit ALLER Ware. (Kühlpflichtige Ware braucht zusätzlich Kühlregale – ❄️ Kühlbereich im Bau-Modus.)',
    kind: 'facility',
    max: 3,
    price: (l) => 2500 * l,
    effectLabel: (l) => (l > 0 ? `Haltbarkeit +${Math.round(COOLING_SHELFLIFE_BONUS * l * 100)}%` : '—'),
  },
];

export function getEquipmentDef(id: EquipmentId): EquipmentDef {
  return EQUIPMENT_DEFS.find((e) => e.id === id)!;
}

// ============================================================================
// Paket 3 — Einkaufs-Entscheidungen
// Volume discounts make a bigger single-product order cheaper per unit; a supply
// contract fixes the price for a while (a small premium now, protection against
// quarterly hikes later). Both turn the automated order back into a decision.
// ============================================================================
/** Bulk tiers (checked high → low): ordering ≥ min units of ONE product cuts the
 * per-unit price by `discount`. */
export const VOLUME_DISCOUNT_TIERS: { min: number; discount: number }[] = [
  { min: 600, discount: 0.06 },
  { min: 300, discount: 0.04 },
  { min: 150, discount: 0.02 },
];
export function volumeDiscount(qty: number): number {
  for (const t of VOLUME_DISCOUNT_TIERS) if (qty >= t.min) return t.discount;
  return 0;
}

/** A supply contract fixes today's price for this many weeks… */
export const CONTRACT_WEEKS = 12;
/** …at a small premium over the current spot price (the cost of the guarantee).
 * It pays off only if the supplier would otherwise hike by more than this. */
export const CONTRACT_PREMIUM = 0.03;

// ============================================================================
// Paket 4 — Kunden-Fokus & Strategie
// A company stance with genuine trade-offs, so there are several viable ways to
// play instead of one optimum. Switchable, but only every few weeks.
// ============================================================================

export interface StrategyDef {
  id: StrategyId;
  name: string;
  icon: string;
  tagline: string;
  /** Multiplier on the price customers are willing to pay (inquiry targets). */
  priceFactor: number;
  /** Multiplier on ordered volumes (demand). */
  demandFactor: number;
  /** Multiplier on shelf life (spoilage speed). */
  spoilageFactor: number;
  pros: string;
  cons: string;
}

export const STRATEGY_DEFS: StrategyDef[] = [
  {
    id: 'full',
    name: 'Vollsortimenter',
    icon: '🏬',
    tagline: 'Ausgewogen – keine Sonderregeln.',
    priceFactor: 1,
    demandFactor: 1,
    spoilageFactor: 1,
    pros: 'Robust, keine Nachteile.',
    cons: 'Keine Sonderboni.',
  },
  {
    id: 'fresh',
    name: 'Frische-Spezialist',
    icon: '🐟',
    tagline: 'Premium-Qualität zu höheren Preisen.',
    priceFactor: 1.08,
    demandFactor: 0.95,
    spoilageFactor: 0.8,
    pros: '+8 % erzielbarer Preis bei neuen Deals.',
    cons: 'Ware verdirbt schneller (−20 % Haltbarkeit), etwas weniger Menge.',
  },
  {
    id: 'volume',
    name: 'Mengen-Discounter',
    icon: '📦',
    tagline: 'Masse statt Marge.',
    priceFactor: 0.94,
    demandFactor: 1.18,
    spoilageFactor: 1,
    pros: '+18 % Bestellmengen.',
    cons: '−6 % erzielbarer Preis bei neuen Deals.',
  },
];
export function getStrategyDef(id: StrategyId | undefined): StrategyDef {
  return STRATEGY_DEFS.find((s) => s.id === id) ?? STRATEGY_DEFS[0];
}
/** Minimum weeks between strategy switches (no flip-flopping). */
export const STRATEGY_COOLDOWN_WEEKS = 8;

// ============================================================================
// Paket 5 — Nachfrage-Events: Großaufträge
// An occasional one-off bulk order at a premium price with a tight deadline: a
// bet you take only if you can build the stock and prep it in time. Fulfilment
// pays big; missing it hits service like any late order.
// ============================================================================
export const BIGORDER_CHANCE_PER_WEEK = 0.28; // rolled Thursday with inquiries
export const BIGORDER_COOLDOWN_WEEKS = 3;
export const BIGORDER_MIN_CUSTOMERS = 4; // only once the business is running
/** One-off quantity as a multiple of a normal medium single-line volume. */
export const BIGORDER_VOLUME_MULT: [number, number] = [3, 6];
/** Premium over the product's list sales price. */
export const BIGORDER_PRICE_PREMIUM: [number, number] = [0.12, 0.25];
/** Weeks until the offer lapses (decide fast) — delivery is due the week after. */
export const BIGORDER_EXPIRY_WEEKS = 1;

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
// Konkurrenz & Markt (Later Stage L2). KI-Wettbewerber teilen sich mit dir den
// Markt. Sie werben deine schwächsten/überteuersten Kunden ab — das beschleunigt
// die BESTEHENDE Loyalitäts-Abwanderung (kein neuer Todes-Pfad), antwortbar über
// Service, faire Preise und Rabatte.
// ============================================================================

export interface CompetitorDef {
  id: string;
  name: string;
  emoji: string;
  /** Relative Marktstärke (treibt den Marktanteil). */
  baseStrength: number;
  /** 0..1 – wie häufig dieser Wettbewerber Kunden abwirbt. */
  aggressiveness: number;
  /** Kurzbeschreibung fürs Markt-Ranking. */
  blurb: string;
}

export const COMPETITOR_DEFS: CompetitorDef[] = [
  { id: 'kontor', name: 'Hansa Kontor', emoji: '🏛️', baseStrength: 58, aggressiveness: 0.45, blurb: 'Alteingesessener Platzhirsch – träge, aber mit dickem Kundenstamm.' },
  { id: 'frischweg', name: 'FrischWeg Logistik', emoji: '🚚', baseStrength: 46, aggressiveness: 0.75, blurb: 'Aggressiver Aufsteiger – wirbt gezielt unzufriedene Kunden ab.' },
  { id: 'depot', name: 'Discount-Depot', emoji: '🏷️', baseStrength: 40, aggressiveness: 0.4, blurb: 'Preisbrecher – gefährlich für Kunden, denen du zu teuer bist.' },
];

/** Wöchentliche Zufalls-Drift der Wettbewerber-Stärke (Random Walk). */
export const COMPETITOR_STRENGTH_DRIFT = 2.5;
/** Stärke bleibt in ±diesem Band um die Basis. */
export const COMPETITOR_STRENGTH_BAND = 0.4;
/** Basis-Abwerbe-Chance pro Woche (× Aggressivität × (1 − Marktanteil)). */
export const POACH_BASE_CHANCE = 0.5;
/** Loyalitäts-Schlag einer Abwerbung auf den betroffenen Kunden. */
export const POACH_LOYALTY_HIT = 9;
/** So lange gilt ein Kunde nach einer Abwerbung als „umworben" (UI-Pill). */
export const POACH_COURT_WEEKS = 3;
/** Nur Kunden UNTER dieser Loyalität sind überhaupt abwerbbar. Bewusst niedrig:
 * ein pünktlich & fair bedienter Kunde hält sich locker darüber und ist immun –
 * Abwerbung ist die Folge von SCHLECHTEM Service, kein Zufalls-Ärgernis. */
export const POACH_LOYALTY_CEILING = 55;
/** Ab so vielen aktiven Kunden wirkt der volle Abwerbe-Druck (darunter linear
 * schwächer) – Konkurrenz ist eine LATE-GAME-Kraft, kein Newcomer-Ärgernis. */
export const POACH_EXPOSURE_FULL = 25;

// --- Konkurrenz Stufe 2: 3-Stufen-Abwehr + dynamische Konkurrenz-Slots -------
// Eine Abwerbe-Attacke wird nach Loyalität aufgelöst: hohe Loyalität = sicher
// (wird gar nicht erst attackiert), mittlere = du kannst mit einem Gegenangebot
// (Marge einbüßen) gegenhalten, niedrige = der Kunde ist direkt weg.
/** Ab dieser Loyalität ist ein Kunde SICHER – Wettbewerber greifen ihn nicht an. */
export const POACH_SAFE_LOYALTY = 60;
/** Unter dieser Loyalität ist ein angegriffener Kunde DIREKT verloren (kein
 * Gegenangebot mehr möglich) – identisch mit der Kündigungsschwelle. */
export const POACH_DIRECT_LOSS_LOYALTY = LOYALTY_CHURN_THRESHOLD;
/** Gegenangebot: so viel zusätzlichen Rabatt (Marge) konzedierst du, um den
 * umkämpften Kunden zu halten. Kumuliert auf den bestehenden Rabatt (Deckel 20 %). */
export const GEGENANGEBOT_DISCOUNT = 0.08;
/** Ein angenommenes Gegenangebot hebt die Loyalität des Kunden wieder (er fühlt
 * sich umworben & wertgeschätzt) über die Gefahrenzone. */
export const GEGENANGEBOT_LOYALTY_RESTORE = 24;
/** So viele Wochen hast du Zeit, auf ein Gegenangebot zu reagieren – verstreicht
 * die Frist ungenutzt, zieht der Kunde weiter. */
export const POACH_DECISION_WEEKS = 2;
/** Im 3. Monat (Woche 12) läuft die ERSTE Abwerbe-Attacke garantiert – sie
 * erklärt die Mechanik (mittlere Loyalität → Gegenangebot). */
export const FIRST_ATTACK_WEEK = 12;

// Dynamische Konkurrenz-Slots: die von Wettbewerbern gehaltene Kundenzahl je
// Größe ist nicht mehr fix, sondern nähert sich einem Gleichgewicht, das von
// DEINEM Service (guter Service drängt sie zurück) und ihrer Aggressivität
// abhängt. Am Service-Anker (4★) bleibt sie exakt beim Stufe-1-Wert.
/** Service-Sterne, bei denen die Konkurrenz genau ihren Basis-Anteil hält. */
export const COMP_SERVICE_NEUTRAL = 4.0;
/** Je Stern unter dem Anker wächst der Konkurrenz-Anteil um diesen Faktor
 * (über dem Anker schrumpft er entsprechend). */
export const COMP_SERVICE_SLOPE = 0.12;
/** Aggressivität über 0,5 hebt das Gleichgewicht zusätzlich (× diesem Faktor). */
export const COMP_AGGR_SLOPE = 0.35;
/** Konkurrenz-Anteil bleibt in diesem Band um den Basis-Anteil (COMPETITOR_SHARE). */
export const COMP_SHARE_MIN_MULT = 0.55;
export const COMP_SHARE_MAX_MULT = 1.6;
/** Wöchentliche Annäherung der Slots ans Gleichgewicht (träge). */
export const COMP_SLOT_EASE = 0.1;

// --- Gezielte Abwerbe-Aktion (Stufe 3, offensiv) -----------------------------
// Du gehst in die Offensive: gegen eine Gebühr wirbt dein Vertrieb einen Kunden
// eines Wettbewerbers ab → er schickt dir eine Wechsel-Anfrage (Warm-Lead), die du
// wie üblich abschließt. Wie preisbereit der Lead ist, hängt von deinem Ruf ab
// (guter Ruf = leichter zu profitablem Preis). Nur alle paar Wochen möglich.
/** Kosten einer gezielten Abwerbe-Aktion (Vertriebs-/Marketing-Vorstoß). */
export const ABWERBE_COST = 6_000;
/** Frequenz-Sperre: erst nach so vielen Wochen wieder möglich. */
export const ABWERBE_COOLDOWN_WEEKS = 6;
/** Grund-Preisabschlag, den ein abgeworbener Lead erwartet (er wechselt für einen
 * besseren Deal). Hoher Ruf senkt diesen Abschlag (bis auf 0). */
export const ABWERBE_TARGET_DISCOUNT = 0.12;

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
