// ============================================================================
// Simulation engine. `advance(state, realDeltaMs)` mutates the state in place,
// moving game time forward and firing every discrete event that fell inside the
// elapsed interval (day starts, weekly rollovers, Monday truck pickups, PO
// deliveries, customer payments, spoilage, employee work progress).
//
// Everything here is deterministic given the state + RNG; the React layer only
// calls advance() on a fixed loop and reads the result.
// ============================================================================

import {
  BANKRUPTCY_CASH,
  CHEF_MANAGER_ID,
  MANAGER_SLOTS,
  SLOT_COST,
  PREP_HOURS_PER_UNIT,
  PUTAWAY_HOURS_PER_UNIT,
  SKILL_SPEED_BASELINE,
  SKILL_SPEED_PER_POINT,
  COUNTER_ACCEPT_SLOPE,
  CREDIT_INTEREST_RATE,
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_EMOJI,
  CUSTOMER_LEAD_WEEKS,
  CUSTOMER_NAME_POOL,
  CUSTOMER_VOLATILITY,
  CUSTOMER_VOLUME_RANGE,
  DAYS_PER_WEEK,
  DEMAND_CHANCE_PER_WEEK,
  DEMAND_COOLDOWN_WEEKS,
  DEMAND_ESCALATION_DELAY,
  DEMAND_MAX_LINES,
  DEMAND_MIN_CUSTOMER_WEEKS,
  DEMAND_MIN_LOYALTY,
  DEMAND_STAGE1_DEADLINE,
  DEMAND_STAGE1_LOYALTY_GAIN,
  DEMAND_STAGE2_DEADLINE,
  DEMAND_STAGE2_LOYALTY_GAIN,
  EXPANSION_CHANCE_PER_CUSTOMER,
  EXPANSION_MAX_PER_WEEK,
  EXPANSION_MIN_LOYALTY,
  INQUIRY_BASE_CHANCE,
  INQUIRY_MARKET,
  INQUIRY_DAY_OF_WEEK,
  SALES_MARKET_PER_REP,
  ORDER_DAY_OF_WEEK,
  INQUIRY_EXPIRY_WEEKS,
  INQUIRY_FAMILIAR_PRODUCT_CHANCE,
  INQUIRY_UNLISTED_PRODUCT_CHANCE,
  INQUIRY_PRICE_TIERS,
  LARGE_UNLOCK_MONTHLY,
  LOYALTY_CHURN_CHANCE_MAX,
  LOYALTY_CHURN_THRESHOLD,
  MEDIUM_UNLOCK_MONTHLY,
  MILESTONE_DEFS,
  REPRICE_ACCEPT_FLOOR,
  REPRICE_ACCEPT_SLOPE,
  REPRICE_STAR_CEILING_BONUS,
  REPRICE_TOLERANCE,
  repriceStarDamp,
  monthlyRevenue,
  MONTHLY_RENT,
  RENT_PER_EXPANSION,
  NIGHT_SPEED,
  PALETTE_SIZE,
  PAYMENT_DELAY_DAYS_BY_TYPE,
  PRODUCT_VOLUME_FACTOR,
  PER_ARTICLE_PREP_FACTOR,
  PRODUCT_DEFS,
  SHELF_SLOTS,
  SEASONAL_TREND,
  SECONDS_PER_DAY_AT_1X,
  SUPPLIER_INCREASE_CHANCE,
  SUPPLIER_INCREASE_RANGE,
  TRUCK_DAY_FRACTION,
  WEEKS_PER_MONTH,
  WEEKS_PER_QUARTER,
  WEEKS_PER_YEAR,
  WORK_END_HOUR,
  WORK_START_HOUR,
  demandUpliftFromDiscount,
  getProductDef,
  type ProductDef,
} from './constants';
import type {
  Customer,
  CustomerLine,
  CustomerType,
  GameState,
  Inquiry,
  NotificationType,
  Order,
  Palette,
  Product,
  ProductId,
  PurchaseOrder,
  YearStats,
} from './types';
import {
  clamp,
  dayOfWeek,
  pick,
  quarterOf,
  randInt,
  randRange,
  uid,
  weekOf,
  yearOf,
} from './util';
import {
  STEP,
  TUTORIAL_FIRST_PREP_DAYS,
  TUTORIAL_INQUIRY_IDS,
  TUTORIAL_MEAT_INQUIRY_ID,
  TUTORIAL_ORDER_ID,
} from './tutorial';

// --- Notifications ----------------------------------------------------------

export interface NotifyOpts {
  /** 'log' keeps routine events out of the toast stream (log stays complete). */
  channel?: 'toast' | 'log';
  /** Aggregate same-day events of this kind into ONE entry — the second event
   * of a day turns the entry into "3 Paletten fertiggestellt…" instead of
   * stacking single toasts (Notification-Diät, Entscheidungen R2). */
  agg?: { key: 'palette' | 'payment' | 'order'; amount?: number };
}

function aggMessage(key: 'palette' | 'payment' | 'order', count: number, amount: number): string {
  switch (key) {
    case 'palette':
      return `📦 ${count} Paletten fertiggestellt – der LKW holt sie um 18:00 ab.`;
    case 'payment':
      return `💰 ${count} Zahlungen erhalten: +${Math.round(amount)}€.`;
    case 'order':
      return `🧾 ${count} neue Bestellungen eingegangen (siehe Aufträge).`;
  }
}

export function notify(
  state: GameState,
  message: string,
  type: NotificationType = 'info',
  opts?: NotifyOpts,
): void {
  const day = Math.floor(state.totalDays);
  if (opts?.agg) {
    const existing = state.notifications.find((n) => n.aggKey === opts.agg!.key && n.day === day);
    if (existing) {
      existing.count = (existing.count ?? 1) + 1;
      existing.amount = (existing.amount ?? 0) + (opts.agg.amount ?? 0);
      existing.message = aggMessage(opts.agg.key, existing.count, existing.amount ?? 0);
      existing.week = weekOf(state.totalDays);
      // Re-surface the merged entry (the toast layer re-shows it once).
      state.notifications.splice(state.notifications.indexOf(existing), 1);
      state.notifications.push(existing);
      return;
    }
  }
  state.notifications.push({
    id: uid('note'),
    day,
    week: weekOf(state.totalDays),
    message,
    type,
    channel: opts?.channel,
    aggKey: opts?.agg?.key,
    count: opts?.agg ? 1 : undefined,
    amount: opts?.agg?.amount,
  });
  // Keep the log bounded.
  if (state.notifications.length > 60) {
    state.notifications.splice(0, state.notifications.length - 60);
  }
}

// --- Inventory helpers ------------------------------------------------------

/** All units of a product, shelved + waiting in the inbound zone. Used for
 * ordering/recommendation; only shelf stock (below) can actually fill orders. */
export function inventoryTotal(product: Product): number {
  return product.batches.reduce((sum, b) => sum + b.quantity, 0);
}

/** Units on shelves — the only stock available to prepare orders. */
export function shelfStock(product: Product): number {
  return product.batches.reduce((s, b) => s + (b.location === 'shelf' ? b.quantity : 0), 0);
}

/** Units sitting in the inbound zone, waiting to be put away onto shelves. */
export function inboundStock(product: Product): number {
  return product.batches.reduce((s, b) => s + (b.location === 'inbound' ? b.quantity : 0), 0);
}

/** Total shelf capacity in units: shelves × slots × palette size. */
export function shelfCapacity(state: GameState): number {
  return state.warehouse.shelves.length * SHELF_SLOTS * PALETTE_SIZE;
}
export function shelfUsed(state: GameState): number {
  return state.products.reduce((s, p) => s + shelfStock(p), 0);
}
export function shelfFree(state: GameState): number {
  return Math.max(0, shelfCapacity(state) - shelfUsed(state));
}

/** Total inbound (Wareneingang) capacity and how much is free right now. */
export function inboundCapacity(state: GameState): number {
  return state.warehouse.inboundSlots * PALETTE_SIZE;
}
export function inboundUsed(state: GameState): number {
  return state.products.reduce((s, p) => s + inboundStock(p), 0);
}
export function inboundFree(state: GameState): number {
  return Math.max(0, inboundCapacity(state) - inboundUsed(state));
}

export function getProduct(state: GameState, id: ProductId): Product {
  return state.products.find((p) => p.id === id)!;
}

export function incomingPO(state: GameState, id: ProductId): number {
  let sum = 0;
  for (const po of state.purchaseOrders) {
    if (po.status !== 'pending') continue;
    for (const item of po.items) if (item.productId === id) sum += item.quantity;
  }
  return sum;
}

export function isInAssortment(state: GameState, id: ProductId): boolean {
  return state.products.some((p) => p.id === id);
}

/** Current actual margin of a product in percent: (VK − EK) / VK. Falls as the
 * supplier raises the purchase price against a fixed sales price. */
export function currentMargin(product: Product): number {
  return product.verkaufspreis > 0
    ? ((product.verkaufspreis - product.einkaufspreis) / product.verkaufspreis) * 100
    : 0;
}

/** True when any product in the assortment has slipped below its target margin —
 * drives the "adjust prices" cue on the pricing button. */
export function hasMarginPressure(state: GameState): boolean {
  return state.products.some((p) => currentMargin(p) < p.zielmarge);
}

export type CatalogEntryStatus = 'active' | 'addable' | 'locked';

export interface CatalogEntry {
  def: ProductDef;
  status: CatalogEntryStatus;
  /** Human "ab Woche N" reason when locked. */
  reason?: string;
}

/** Status of every product in the catalog: already in the assortment, unlocked
 * and ready to add, or still locked (with the week it unlocks). */
export function catalogStatus(state: GameState): CatalogEntry[] {
  const week = weekOf(state.totalDays);
  return PRODUCT_DEFS.map((def) => {
    if (isInAssortment(state, def.id)) return { def, status: 'active' };
    if (week >= def.unlockWeek) return { def, status: 'addable' };
    return { def, status: 'locked', reason: `ab Woche ${def.unlockWeek + 1}` };
  });
}

/** Remove `qty` units of SHELF stock from a product, FIFO (soonest expiry
 * first). Inbound stock is never used to fill orders. */
function deductInventory(product: Product, qty: number): void {
  let remaining = qty;
  product.batches.sort((a, b) => a.expiryDay - b.expiryDay);
  for (const batch of product.batches) {
    if (remaining <= 0) break;
    if (batch.location !== 'shelf') continue;
    const take = Math.min(batch.quantity, remaining);
    batch.quantity -= take;
    remaining -= take;
  }
  product.batches = product.batches.filter((b) => b.quantity > 0);
}

// --- Build frontier ---------------------------------------------------------

export type ExpansionBlock = { gx: number; gy: number }[];

const cellKey = (gx: number, gy: number) => `${gx},${gy}`;
/** Canonical identity of a 2×2 block (its top-left anchor). */
export function blockAnchor(block: ExpansionBlock): { gx: number; gy: number } {
  return { gx: Math.min(...block.map((c) => c.gx)), gy: Math.min(...block.map((c) => c.gy)) };
}

/**
 * Dynamically computed 2×2 expansion blocks for a zone. A block is offered when
 * (a) it sits on the zone's alignment grid (the parity of the original layout —
 * expansions always step by 2), (b) all four of its tiles are empty, (c) it
 * touches at least one existing tile of the zone orthogonally, and (d) it lies
 * within the allowed growth directions. Because this is recomputed from the
 * CURRENT shape, blocks that only became adjacent through earlier expansions are
 * offered too — L-shapes and notches can always be filled back into a contiguous
 * area (no dead pockets, by construction on the aligned grid).
 *
 * Growth directions: the hall grows right (+gx) and back (−gy); its front edge
 * (ramp/dock) and the office side (gx < 0) stay fixed. The office grows left
 * (−gx) and back (−gy) — away from the hall.
 */
function expansionFrontier(state: GameState, zone: 'hall' | 'office'): ExpansionBlock[] {
  const zoneTiles = state.warehouse.tiles.filter((t) =>
    zone === 'office' ? t.zone === 'office' : t.zone !== 'office',
  );
  if (zoneTiles.length === 0) return [];
  const occupied = new Set(state.warehouse.tiles.map((t) => cellKey(t.gx, t.gy)));
  const inZone = new Set(zoneTiles.map((t) => cellKey(t.gx, t.gy)));
  const gxs = zoneTiles.map((t) => t.gx);
  const gys = zoneTiles.map((t) => t.gy);
  const minGx = Math.min(...gxs);
  const maxGx = Math.max(...gxs);
  const minGy = Math.min(...gys);
  const maxGy = Math.max(...gys);

  // Alignment parity from the original layouts: hall origin (0,0) → even/even;
  // office origin (−3,0) → odd gx, even gy.
  const ax = zone === 'hall' ? 0 : 1;
  const mod2 = (v: number) => ((v % 2) + 2) % 2;
  // Hall: front row fixed (blocks end at the current front edge), left edge at
  // gx 0 (office corridor). Office: nothing toward the hall (right), the front
  // may extend one row past the current edge (its 3-row layout tiles that way —
  // matches the original expansion offers).
  const allowed = (bx: number, by: number) =>
    zone === 'hall' ? bx >= 0 && by + 1 <= maxGy : bx + 1 <= maxGx && by <= maxGy;

  const blocks: ExpansionBlock[] = [];
  for (let by = minGy - 2; by <= maxGy + 2; by += 1) {
    if (mod2(by) !== 0) continue;
    for (let bx = minGx - 2; bx <= maxGx + 2; bx += 1) {
      if (mod2(bx - ax) !== 0) continue;
      if (!allowed(bx, by)) continue;
      const cells: ExpansionBlock = [
        { gx: bx, gy: by },
        { gx: bx + 1, gy: by },
        { gx: bx, gy: by + 1 },
        { gx: bx + 1, gy: by + 1 },
      ];
      if (cells.some((c) => occupied.has(cellKey(c.gx, c.gy)))) continue;
      const touchesZone = cells.some((c) =>
        [
          cellKey(c.gx - 1, c.gy),
          cellKey(c.gx + 1, c.gy),
          cellKey(c.gx, c.gy - 1),
          cellKey(c.gx, c.gy + 1),
        ].some((k) => inZone.has(k)),
      );
      if (touchesZone) blocks.push(cells);
    }
  }
  return blocks;
}

// --- Walkability (Begehbarkeits-Regel, Entscheidungen R2) --------------------

/** Whether a placed object (shelf, table or desk) occupies the cell. */
function objectAt(state: GameState, gx: number, gy: number): boolean {
  return (
    state.warehouse.shelves.some((s) => s.gx === gx && s.gy === gy) ||
    state.warehouse.tables.some((t) => t.gx === gx && t.gy === gy) ||
    state.warehouse.desks.some((d) => d.gx === gx && d.gy === gy)
  );
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Free orthogonal neighbors of a cell: tiles that exist (no wall/edge) and
 * hold no object. `blocked` treats one extra cell as occupied — the candidate
 * placement being validated. */
function freeNeighbors(state: GameState, gx: number, gy: number, blocked?: { gx: number; gy: number }): number {
  let n = 0;
  for (const [dx, dy] of N4) {
    const x = gx + dx;
    const y = gy + dy;
    if (blocked && blocked.gx === x && blocked.gy === y) continue;
    if (!state.warehouse.tiles.some((t) => t.gx === x && t.gy === y)) continue;
    if (objectAt(state, x, y)) continue;
    n += 1;
  }
  return n;
}

/**
 * Walkability validation for a new placement at (gx,gy), in BOTH directions:
 * (1) the new object itself keeps ≥1 free orthogonal neighbor tile, and (2) it
 * doesn't take the LAST free side of any adjacent existing object. Returns the
 * human reason, or null when the placement is fine. Hall/office expansions only
 * add free area and can never violate the rule. Existing saves enjoy
 * Bestandsschutz — only NEW placements are validated.
 */
export function placementBlocksAccess(state: GameState, gx: number, gy: number): string | null {
  if (freeNeighbors(state, gx, gy) === 0) {
    return 'Objekt wäre nicht erreichbar – mindestens eine Nachbarkachel muss frei bleiben.';
  }
  for (const [dx, dy] of N4) {
    const x = gx + dx;
    const y = gy + dy;
    if (!objectAt(state, x, y)) continue;
    if (freeNeighbors(state, x, y, { gx, gy }) === 0) {
      return 'Würde ein Nachbar-Objekt einmauern – dessen letzte freie Seite bleibt frei.';
    }
  }
  return null;
}

/** Current monthly rent: base + RENT_PER_EXPANSION per built 2×2 block (hall
 * and office alike) — expansion carries running costs. */
export function currentMonthlyRent(state: GameState): number {
  return MONTHLY_RENT + RENT_PER_EXPANSION * (state.warehouse.expansions + state.warehouse.officeExpansions);
}

export function hallExpansionFrontier(state: GameState): ExpansionBlock[] {
  return expansionFrontier(state, 'hall');
}
export function officeExpansionFrontier(state: GameState): ExpansionBlock[] {
  return expansionFrontier(state, 'office');
}

/** Whether `block` is one of the currently offered frontier blocks. Shared by
 * the build actions so overlay, click handling and the mutation agree. */
export function isFrontierBlock(state: GameState, zone: 'hall' | 'office', block: ExpansionBlock): boolean {
  if (block.length !== 4) return false;
  const key = block
    .map((c) => cellKey(c.gx, c.gy))
    .sort()
    .join('|');
  return expansionFrontier(state, zone).some(
    (b) =>
      b
        .map((c) => cellKey(c.gx, c.gy))
        .sort()
        .join('|') === key,
  );
}

// --- Money helpers ----------------------------------------------------------

export function availableCredit(state: GameState): number {
  return Math.max(0, state.creditLimit - state.bankCredit);
}

/** Deduct cash, automatically drawing on the credit line to avoid overdraft. */
export function spend(state: GameState, amount: number): void {
  state.cash -= amount;
  if (state.cash < 0) {
    const draw = Math.min(-state.cash, availableCredit(state));
    if (draw > 0) {
      state.bankCredit += draw;
      state.cash += draw;
      // Make the silent overdraft visible — especially while the finance screen
      // is still locked during the tutorial, interest must not accrue unseen.
      notify(
        state,
        `🏦 Kredit automatisch gezogen: ${Math.round(draw)}€ (Zins ${(CREDIT_INTEREST_RATE * 100).toFixed(0)}%/Woche).`,
        'warn',
      );
    }
  }
}

// --- Capacity helpers -------------------------------------------------------

export function kamCount(state: GameState): number {
  return state.employees.filter((e) => e.role === 'kam').length;
}

/** Office employees (everyone who isn't a warehouse worker) occupy one desk each. */
export function officeStaffCount(state: GameState): number {
  return state.employees.filter((e) => e.role !== 'lager').length;
}
export function deskCount(state: GameState): number {
  return state.warehouse.desks.length;
}
/** Desks not currently occupied by an office employee — gate on hiring office staff. */
export function freeDesks(state: GameState): number {
  return Math.max(0, deskCount(state) - officeStaffCount(state));
}

// --- Manager slots (KAM-Slot-System, Entscheidungen R2) ----------------------

export interface ManagerInfo {
  id: string;
  name: string;
  isChef: boolean;
  /** Slots occupied by this manager's active customers. */
  used: number;
  free: number;
  counts: Record<CustomerType, number>;
}

/** All managers (the player "Chef" first, then every KAM) with their live slot
 * occupancy. Capacity is per manager — never pooled. */
export function managers(state: GameState): ManagerInfo[] {
  const base: { id: string; name: string; isChef: boolean }[] = [
    { id: CHEF_MANAGER_ID, name: 'Chef (du)', isChef: true },
    ...state.employees
      .filter((e) => e.role === 'kam')
      .map((e) => ({ id: e.id, name: e.name, isChef: false })),
  ];
  return base.map((m) => {
    const cust = state.customers.filter((c) => c.active && c.managerId === m.id);
    const used = cust.reduce((s, c) => s + SLOT_COST[c.type], 0);
    return {
      ...m,
      used,
      free: Math.max(0, MANAGER_SLOTS - used),
      counts: {
        small: cust.filter((c) => c.type === 'small').length,
        medium: cust.filter((c) => c.type === 'medium').length,
        large: cust.filter((c) => c.type === 'large').length,
      },
    };
  });
}

/** The manager who should take a new customer of `type`: the one with the most
 * free slots that still fits it. Null when NO single manager has room — pooled
 * leftovers don't count (fragmentation is intended). */
export function bestManagerFor(state: GameState, type: CustomerType): ManagerInfo | null {
  const fitting = managers(state).filter((m) => m.free >= SLOT_COST[type]);
  if (fitting.length === 0) return null;
  return fitting.reduce((a, b) => (b.free > a.free ? b : a));
}

/** How many MORE customers of `type` could be taken right now, honoring the
 * per-manager slot check (a fragmented 3+3 yields 0 for a large customer). */
export function freeCapacity(state: GameState, type: CustomerType): number {
  return managers(state).reduce((s, m) => s + Math.floor(m.free / SLOT_COST[type]), 0);
}

/** True once the company employs at least one Einkäufer (unlocks auto-restock). */
export function hasEinkaeufer(state: GameState): boolean {
  return state.employees.some((e) => e.role === 'einkaeufer');
}

/** Contracted weekly demand for a product = sum of active customers' line volumes. */
export function weeklyDemand(state: GameState, productId: ProductId): number {
  let sum = 0;
  for (const c of state.customers) {
    if (!c.active) continue;
    for (const l of c.lines) if (l.productId === productId) sum += l.volume;
  }
  return sum;
}

/** Best (highest) skill among warehouse workers, or 0 if none. */
function bestNegotiationSkill(state: GameState): number {
  const buyers = state.employees.filter((e) => e.role === 'einkaeufer');
  if (buyers.length === 0) return 0;
  return Math.max(...buyers.map((b) => b.skill));
}

// --- Demand / seasonal ------------------------------------------------------

export function seasonalMultiplier(productId: ProductId, week: number): number {
  return SEASONAL_TREND[productId][quarterOf(week)];
}

// Customer-size unlocks gate on the rolling MONTHLY revenue (sum of the last 4
// completed weeks, re-checked weekly) — see monthlyRevenue() in constants.ts.

export function serviceStarsRecompute(state: GameState): void {
  const active = state.customers.filter((c) => c.active);
  if (active.length === 0) return;
  state.serviceStars = active.reduce((s, c) => s + c.serviceRating, 0) / active.length;
}

/**
 * Headline figures for a completed year, summed from its weekly reports (year 0
 * = weeks 0-47, year 1 = 48-95, …). Point-in-time figures (cash, customers,
 * milestones) are read from the state as it stands at the year boundary. Shared
 * by the year-end balance sheet and continueYear (which stores it as next year's
 * comparison base). */
export function computeYearStats(state: GameState, completedYearIndex: number): YearStats {
  const yr = state.reports.filter((r) => yearOf(r.week) === completedYearIndex);
  const sum = (f: (r: (typeof yr)[number]) => number) => yr.reduce((s, r) => s + f(r), 0);
  return {
    year: completedYearIndex + 1,
    revenue: sum((r) => r.revenue),
    profit: sum((r) => r.profit),
    cashEnd: yr.length > 0 ? yr[yr.length - 1].cashEnd : state.cash,
    customersEnd: state.customers.filter((c) => c.active).length,
    deliveredOrders: sum((r) => r.deliveredOrders),
    lateOrders: sum((r) => r.lateOrders),
    spoiledUnits: sum((r) => r.spoiledUnits),
    spoilageLoss: sum((r) => r.spoilageLoss),
    milestonesAchieved: state.milestones.filter((m) => m.achievedWeek != null).length,
  };
}

// --- Order preparation ------------------------------------------------------

/** Skill speed multiplier: every point above the baseline is 1 % faster. Skill
 * 50 → ×1.0, skill 100 → ×0.5, below 50 → slower. Clamped so it can't hit ≤0. */
function skillSpeedFactor(skill: number): number {
  return clamp(1 - SKILL_SPEED_PER_POINT * (skill - SKILL_SPEED_BASELINE), 0.3, 2);
}

/** Game-days to prepare an order of `quantity` units at `skill`. Quantity-linear
 * (0.3 h/unit at the baseline skill), longer for multi-article customer bundles. */
function prepDaysFor(quantity: number, skill: number, bundleSize = 1): number {
  const bundleFactor = 1 + Math.max(0, bundleSize - 1) * PER_ARTICLE_PREP_FACTOR;
  return ((quantity * PREP_HOURS_PER_UNIT) / 24) * skillSpeedFactor(skill) * bundleFactor;
}

/** Workers currently preparing (each occupies one prep table). */
function preppingCount(state: GameState): number {
  return state.employees.filter((e) => e.task?.kind === 'prep').length;
}
/** Free prep tables = tables not currently in use. Limits parallel preparation. */
function freeTables(state: GameState): number {
  return state.warehouse.tables.length - preppingCount(state);
}

/**
 * Try to start preparing an order: needs enough SHELF stock, a free prep table
 * and a free worker. Returns a reason string on failure, or null on success.
 */
export function tryPrepareOrder(state: GameState, order: Order): string | null {
  if (order.status !== 'pending') return 'Auftrag ist nicht offen.';
  const product = getProduct(state, order.productId);
  if (shelfStock(product) < order.quantity) return 'Nicht genug Regal-Bestand.';
  if (freeTables(state) <= 0) return 'Kein freier Vorbereitungstisch.';
  const worker = state.employees.find((e) => e.role === 'lager' && !e.task);
  if (!worker) return 'Kein freier Lagermitarbeiter.';

  deductInventory(product, order.quantity);
  const paletteId = uid('pal');
  state.palettes.push({
    id: paletteId,
    orderId: order.id,
    customerId: order.customerId,
    productId: order.productId,
    quantity: order.quantity,
    status: 'preparing',
  });
  order.paletteId = paletteId;
  order.status = 'preparing';
  // More articles in the same customer order => longer prep per palette.
  const bundleSize = state.orders.filter(
    (o) => o.customerId === order.customerId && o.status !== 'delivered',
  ).length;
  let days = prepDaysFor(order.quantity, worker.skill, bundleSize);
  // Tutorial BEAT 0: the very first Herrichtung (the starter order only) is
  // near-instant so the first reward comes fast — the palette visibly appears
  // instead of a long wait. Other orders prepared early keep normal timing.
  if (state.tutorial?.active && state.tutorial.step <= STEP.HERRICHTEN && order.id === TUTORIAL_ORDER_ID) {
    days = TUTORIAL_FIRST_PREP_DAYS;
  }
  // Occupy the lowest prep table not held by another prep task — exclusive by
  // construction (the freeTables gate above guarantees one is available).
  const usedTables = new Set(
    state.employees.map((e) => (e.task?.kind === 'prep' ? (e.task.tableIndex ?? -1) : -1)),
  );
  let tableIndex = 0;
  while (usedTables.has(tableIndex)) tableIndex += 1;
  worker.task = { kind: 'prep', orderId: order.id, tableIndex, totalDays: days, remainingDays: days };
  return null;
}

function completePreparation(state: GameState, orderId: string): void {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = 'ready';
  const palette = state.palettes.find((p) => p.id === order.paletteId);
  if (palette) palette.status = 'ready';
  const cust = state.customers.find((c) => c.id === order.customerId);
  notify(
    state,
    `📦 Palette fertig: ${order.quantity}× für ${cust?.name ?? 'Kunde'} – der LKW holt sie um 18:00 ab.`,
    'success',
    { agg: { key: 'palette' } },
  );
}

function updateEmployees(state: GameState, deltaDays: number): void {
  for (const emp of state.employees) {
    if (!emp.task) continue;
    emp.task.remainingDays -= deltaDays;
    if (emp.task.remainingDays <= 0) {
      const task = emp.task;
      emp.task = undefined;
      if (task.kind === 'prep') {
        completePreparation(state, task.orderId);
      } else {
        // Put-away done: the pallet (carried in transit) lands on a shelf.
        const product = getProduct(state, task.productId);
        product.batches.push({
          id: uid('batch'),
          productId: task.productId,
          quantity: task.quantity,
          expiryDay: task.expiryDay,
          location: 'shelf',
        });
      }
    }
  }
}

/** Assign one idle worker to put a pallet away (inbound → shelf). The pallet
 * leaves the inbound zone immediately (carried in transit) so two workers can't
 * grab the same goods. Returns true if a task was started. */
function assignPutaway(state: GameState, product: Product): boolean {
  const worker = state.employees.find((e) => e.role === 'lager' && !e.task);
  if (!worker) return false;
  const qty = Math.min(PALETTE_SIZE, inboundStock(product), shelfFree(state));
  if (qty <= 0) return false;

  // Take qty from inbound (FIFO by expiry) and remember the earliest expiry.
  let remaining = qty;
  let expiry = Infinity;
  const inbound = product.batches
    .filter((b) => b.location === 'inbound')
    .sort((a, b) => a.expiryDay - b.expiryDay);
  for (const b of inbound) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    b.quantity -= take;
    remaining -= take;
    expiry = Math.min(expiry, b.expiryDay);
  }
  product.batches = product.batches.filter((b) => b.quantity > 0);

  const days = ((qty * PUTAWAY_HOURS_PER_UNIT) / 24) * skillSpeedFactor(worker.skill);
  // Work at the lowest inbound slot no other putaway task occupies (falls back
  // to round-robin only if there are more putaway workers than slots).
  const usedSlots = new Set(
    state.employees.map((e) => (e.task?.kind === 'putaway' ? (e.task.slotIndex ?? -1) : -1)),
  );
  let slotIndex = 0;
  while (usedSlots.has(slotIndex) && slotIndex < state.warehouse.inboundSlots - 1) slotIndex += 1;
  worker.task = {
    kind: 'putaway',
    productId: product.id,
    quantity: qty,
    expiryDay: expiry === Infinity ? state.totalDays + product.spoilageDays : expiry,
    slotIndex,
    totalDays: days,
    remainingDays: days,
  };
  return true;
}

/**
 * Cleanly release a worker's current task back into the queue — used when an
 * employee leaves mid-task. Nothing is lost or duplicated: a prep reverts its
 * order to 'pending' and returns the picked goods to the shelf (half shelf-life,
 * same convention as releaseCustomerOrders — the original batch expiries are
 * gone after picking); a putaway returns the carried pallet to the inbound zone
 * with its exact expiry. Auto-assign then re-queues the work on the next tick.
 */
export function releaseWorkerTask(state: GameState, employeeId: string): void {
  const emp = state.employees.find((e) => e.id === employeeId);
  const task = emp?.task;
  if (!emp || !task) return;
  if (task.kind === 'prep') {
    const order = state.orders.find((o) => o.id === task.orderId);
    if (order && order.status === 'preparing') {
      const product = getProduct(state, order.productId);
      product.batches.push({
        id: uid('batch'),
        productId: order.productId,
        quantity: order.quantity,
        expiryDay: state.totalDays + Math.round(product.spoilageDays / 2),
        location: 'shelf',
      });
      state.palettes = state.palettes.filter((p) => p.id !== order.paletteId);
      order.paletteId = undefined;
      order.status = 'pending';
    }
  } else {
    const product = getProduct(state, task.productId);
    product.batches.push({
      id: uid('batch'),
      productId: task.productId,
      quantity: task.quantity,
      expiryDay: task.expiryDay,
      location: 'inbound',
    });
  }
  emp.task = undefined;
}

/**
 * Auto-assign idle warehouse workers. Preparation comes first (fulfilling orders
 * = revenue), each needing a free prep table; whatever workers remain then put
 * delivered goods away from the inbound zone onto the shelves. With a big
 * delivery and few workers the inbound zone backs up until more staff/tables/
 * shelf space is added.
 */
function autoAssignWork(state: GameState): void {
  if (!state.settings.autoPrep) return;
  let idle = state.employees.filter((e) => e.role === 'lager' && !e.task).length;
  if (idle === 0) return;

  // 1. Prep due orders from shelf stock (bounded by free tables).
  const pending = state.orders
    .filter((o) => o.status === 'pending')
    .sort((a, b) => a.dueWeek - b.dueWeek || a.createdDay - b.createdDay);
  for (const order of pending) {
    if (idle === 0 || freeTables(state) <= 0) break;
    const product = getProduct(state, order.productId);
    if (shelfStock(product) < order.quantity) continue;
    if (tryPrepareOrder(state, order) === null) idle -= 1;
  }

  // 2. Put remaining idle workers on put-away (no table needed).
  while (idle > 0 && shelfFree(state) > 0) {
    const product = state.products.find((p) => inboundStock(p) > 0);
    if (!product || !assignPutaway(state, product)) break;
    idle -= 1;
  }
}

// --- Customer orders --------------------------------------------------------

function generateCustomerOrder(state: GameState, customer: Customer, line: CustomerLine): void {
  const week = weekOf(state.totalDays);
  const seasonal = seasonalMultiplier(line.productId, week);
  const discountUplift = 1 + demandUpliftFromDiscount(customer.activeDiscount);
  const jitter = randRange(0.9, 1.1);
  const qty = Math.max(1, Math.round(line.volume * seasonal * discountUplift * jitter));
  // Track actual demanded units this week (feeds the order recommendation).
  state.demandThisWeek[line.productId] = (state.demandThisWeek[line.productId] ?? 0) + qty;
  const price = line.price * (1 - customer.activeDiscount);
  const dueWeek = week + customer.deliveryLeadWeeks;

  const order: Order = {
    id: uid('order'),
    customerId: customer.id,
    productId: line.productId,
    quantity: qty,
    price,
    createdDay: state.totalDays,
    dueWeek,
    status: 'pending',
    late: false,
  };
  state.orders.push(order);
  const product = getProduct(state, line.productId);
  notify(
    state,
    `🧾 Bestellung ${customer.name}: ${qty}× ${product.emoji} ${product.name} – Lieferung bis Woche ${dueWeek}.`,
    'info',
    { agg: { key: 'order' } },
  );
}

// --- Monday truck pickup ----------------------------------------------------

/** All lines a customer ordered together share this key, so a multi-article
 * order is only ever shipped once every one of its lines is ready. */
function orderGroupKey(customerId: string, createdDay: number): string {
  return `${customerId}|${createdDay}`;
}

/**
 * Ready palettes whose ENTIRE order group is ready — exactly what the next 18:00
 * truck will load. A customer's whole order (all its lines from one ordering
 * event) must ship together, so a lone ready palette whose siblings aren't done
 * yet waits behind. Shared by the pickup and the renderer (does the truck even
 * bother coming?).
 */
export function loadablePalettes(state: GameState): Palette[] {
  const openByGroup = new Map<string, Order[]>();
  for (const o of state.orders) {
    if (o.status === 'delivered') continue;
    const k = orderGroupKey(o.customerId, o.createdDay);
    const arr = openByGroup.get(k);
    if (arr) arr.push(o);
    else openByGroup.set(k, [o]);
  }
  return state.palettes.filter((p) => {
    if (p.status !== 'ready') return false;
    const order = state.orders.find((o) => o.id === p.orderId);
    if (!order) return false;
    const arr = openByGroup.get(orderGroupKey(order.customerId, order.createdDay)) ?? [];
    return arr.length > 0 && arr.every((x) => x.status === 'ready');
  });
}

/** Whether the next pickup will actually load anything. If not, the truck
 * doesn't bother coming to the dock (the renderer skips the arrival animation). */
export function hasPickupReady(state: GameState): boolean {
  return loadablePalettes(state).length > 0;
}

function truckPickup(state: GameState, week: number): void {
  const loadable = loadablePalettes(state);
  const loadedPaletteIds = new Set<string>();
  let loaded = 0;

  const cashPaidOrderIds = new Set<string>();
  for (const palette of loadable) {
    const order = state.orders.find((o) => o.id === palette.orderId);
    if (!order) continue;
    order.status = 'delivered';
    loadedPaletteIds.add(palette.id);
    loaded += 1;

    // Logistics cost per palette.
    spend(state, state.truck.costPerPallet);
    state.weekAcc.logistics += state.truck.costPerPallet;

    const cust = state.customers.find((c) => c.id === order.customerId);
    const amount = order.quantity * order.price;
    // Defensive default 'medium' (payment on terms): if the customer somehow can't
    // be found, err on the ledger side rather than handing out instant cash.
    const delay = PAYMENT_DELAY_DAYS_BY_TYPE[cust?.type ?? 'medium'];

    if (delay <= 0) {
      // Small customers pay CASH ON PICKUP: credit immediately, book the revenue
      // now and close the order out (no scheduled payment to collect later).
      state.cash += amount;
      state.weekAcc.revenue += amount;
      state.stats.totalRevenue += amount;
      cashPaidOrderIds.add(order.id);
      notify(state, `💵 ${cust?.name ?? 'Kunde'} zahlt bar bei Abholung: ${Math.round(amount)}€.`, 'success', { agg: { key: 'payment', amount } });
      // First tutorial delivery → trigger the celebration beat. `<= REWARD` (not
      // `===`) also catches the same-tick race where prep completion and pickup
      // land in one advance() before the step machine ever showed REWARD.
      if (state.tutorial?.active && state.tutorial.step <= STEP.REWARD && order.id === TUTORIAL_ORDER_ID) {
        state.tutorial.step = STEP.CELEBRATE;
        state.tutorial.celebrateAmount = amount;
        state.paused = true;
      }
    } else {
      // Medium/large pay on terms (1 / 2 weeks after delivery).
      state.scheduledPayments.push({
        id: uid('pay'),
        customerId: order.customerId,
        orderId: order.id,
        amount,
        dueDay: state.totalDays + delay,
        label: `Zahlung ${order.quantity}× für Auftrag`,
      });
    }

    state.stats.deliveredOrders += 1;
    state.weekAcc.deliveredOrders += 1;

    if (cust && !order.late) {
      cust.serviceRating = clamp(cust.serviceRating + 0.1, 1, 5);
      cust.loyalty = clamp(cust.loyalty + 3, 0, 100);
    }
  }

  // Remove only the palettes actually loaded (a ready palette whose order group
  // isn't complete stays behind and waits for its siblings).
  if (loadedPaletteIds.size > 0) {
    state.palettes = state.palettes.filter((p) => !loadedPaletteIds.has(p.id));
  }
  // Cash-paid (small) orders are fully done — drop them so they don't linger.
  if (cashPaidOrderIds.size > 0) {
    state.orders = state.orders.filter((o) => !cashPaidOrderIds.has(o.id));
  }

  if (loaded > 0) {
    notify(state, `🚚 Laster abgefahren – ${loaded} Palette(n) geladen (Kosten ${loaded * state.truck.costPerPallet}€).`, 'success', { channel: 'log' });
    state.truckAnimUntil = state.totalDays + 0.06;
  }

  // With daily pickups, an order is only late once its whole due week has
  // passed without delivery (it stays deliverable on every day of that week).
  for (const order of state.orders) {
    if (order.late) continue;
    if (order.status === 'delivered') continue;
    if (order.dueWeek >= week) continue;

    order.late = true;
    state.weekAcc.lateOrders += 1;
    state.stats.lateOrders += 1;
    const cust = state.customers.find((c) => c.id === order.customerId);
    if (!cust) continue;
    cust.lateDeliveries += 1;
    cust.serviceRating = clamp(cust.serviceRating - 0.5, 1, 5);
    cust.loyalty = clamp(cust.loyalty - 12, 0, 100);

    const tolerance = 3 + Math.max(0, Math.round(cust.serviceRating - 3));
    if (cust.lateDeliveries >= tolerance) {
      cust.active = false;
      // Drop the customer's still-open orders and any preparing palettes.
      releaseCustomerOrders(state, cust.id);
      notify(state, `❌ ${cust.name} hat gekündigt! (${cust.lateDeliveries} Verspätungen)`, 'error');
    } else {
      notify(
        state,
        `⏰ Verspätung bei ${cust.name}! (${cust.lateDeliveries}/${tolerance}) Service sinkt.`,
        'warn',
      );
    }
  }

  serviceStarsRecompute(state);
}

/** Return reserved goods and clear palettes for a terminated customer. */
function releaseCustomerOrders(state: GameState, customerId: string): void {
  const openOrders = state.orders.filter(
    (o) => o.customerId === customerId && o.status !== 'delivered',
  );
  for (const order of openOrders) {
    // Return goods that were already picked back to the shelf. The original
    // batch expiries are gone after picking, so give the returned units HALF the
    // shelf life as a conservative middle ground — a full fresh expiry would
    // "rejuvenate" old stock every time a customer cancels.
    if (order.status === 'preparing' || order.status === 'ready') {
      const product = getProduct(state, order.productId);
      product.batches.push({
        id: uid('batch'),
        productId: order.productId,
        quantity: order.quantity,
        expiryDay: state.totalDays + Math.round(product.spoilageDays / 2),
        location: 'shelf',
      });
    }
    // Free any worker who was preparing it.
    const worker = state.employees.find(
      (e) => e.task?.kind === 'prep' && e.task.orderId === order.id,
    );
    if (worker) worker.task = undefined;
  }
  state.palettes = state.palettes.filter((p) => p.customerId !== customerId);
  state.orders = state.orders.filter(
    (o) => !(o.customerId === customerId && o.status !== 'delivered'),
  );
}

// --- Spoilage ---------------------------------------------------------------

function updateSpoilage(state: GameState, dayIndex: number): void {
  for (const product of state.products) {
    let spoiledUnits = 0;
    for (const batch of product.batches) {
      if (batch.expiryDay <= dayIndex && batch.quantity > 0) {
        spoiledUnits += batch.quantity;
        batch.quantity = 0;
      }
    }
    if (spoiledUnits > 0) {
      const loss = spoiledUnits * product.einkaufspreis;
      state.stats.spoiledUnits += spoiledUnits;
      state.stats.spoilageLoss += loss;
      state.weekAcc.spoiledUnits += spoiledUnits;
      state.weekAcc.spoilageLoss += loss;
      product.batches = product.batches.filter((b) => b.quantity > 0);
      notify(state, `🗑️ ${spoiledUnits}× ${product.name} verdorben (Verlust ${Math.round(loss)}€).`, 'error');
    }
  }
}

// --- Purchase orders & payments (checked every tick, idempotent) ------------

/**
 * Unload due purchase orders into the inbound zone — but only as much as fits.
 * If the Wareneingang is full the PO stays pending and keeps unloading on later
 * ticks (a Stau at the dock), which is cleared as workers put goods away and free
 * up inbound space. Goods land in the inbound zone and are NOT yet available for
 * orders until a worker shelves them.
 */
function receiveDuePurchaseOrders(state: GameState): void {
  for (const po of state.purchaseOrders) {
    if (po.status !== 'pending') continue;
    if (po.deliveryDay > state.totalDays) continue;

    let room = inboundFree(state);
    let unloadedAny = false;
    for (const item of po.items) {
      if (room <= 0) break;
      if (item.quantity <= 0) continue;
      const take = Math.min(item.quantity, room);
      const product = getProduct(state, item.productId);
      product.batches.push({
        id: uid('batch'),
        productId: item.productId,
        quantity: take,
        expiryDay: state.totalDays + product.spoilageDays,
        location: 'inbound',
      });
      item.quantity -= take;
      room -= take;
      unloadedAny = true;
    }

    const remaining = po.items.reduce((s, i) => s + i.quantity, 0);
    if (remaining <= 0) {
      po.status = 'received';
      notify(state, `📥 Lieferung im Wareneingang (Wert ${Math.round(po.totalCost)}€) – wird eingelagert.`, 'success', { channel: 'log' });
    } else if (unloadedAny) {
      notify(state, `📥 Wareneingang voll – Lieferung wird nach und nach entladen (${remaining} warten).`, 'warn');
    }
  }
  // Drop fully-received POs to keep the list tidy.
  state.purchaseOrders = state.purchaseOrders.filter((po) => po.status === 'pending');
}

function collectDuePayments(state: GameState): void {
  const due = state.scheduledPayments.filter((p) => p.dueDay <= state.totalDays);
  for (const pay of due) {
    state.cash += pay.amount;
    state.weekAcc.revenue += pay.amount;
    state.stats.totalRevenue += pay.amount;
    // The order is fully done — remove it.
    state.orders = state.orders.filter((o) => o.id !== pay.orderId);
    const cust = state.customers.find((c) => c.id === pay.customerId);
    notify(state, `💰 Zahlung erhalten: ${Math.round(pay.amount)}€ von ${cust?.name ?? 'Kunde'}.`, 'success', { agg: { key: 'payment', amount: pay.amount } });
  }
  state.scheduledPayments = state.scheduledPayments.filter((p) => p.dueDay > state.totalDays);
}

// --- Auto restock -----------------------------------------------------------

/** Shared PO creation used by the weekly order flow (manual and the Einkäufer's
 * automatic order). Delivery always lands on the NEXT Monday, regardless of the
 * exact moment the order is placed. Returns the created PO, or null if empty. */
export function createPurchaseOrderInternal(
  state: GameState,
  items: { productId: ProductId; quantity: number }[],
  opts?: { priceMultiplier?: number; leadDays?: number },
): PurchaseOrder | null {
  const mult = opts?.priceMultiplier ?? 1;
  let total = 0;
  const poItems = items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const sp = state.supplier.products.find((s) => s.productId === i.productId)!;
      const unit = sp.price * mult;
      total += i.quantity * unit;
      return { productId: i.productId, quantity: i.quantity, pricePerUnit: unit };
    });
  if (poItems.length === 0) return null;

  spend(state, total);
  state.weekAcc.purchases += total;
  const po: PurchaseOrder = {
    id: uid('po'),
    items: poItems,
    orderDay: state.totalDays,
    // Express orders ship in a fixed few days; regular weekly orders arrive next
    // Monday (start of the week after the current one).
    deliveryDay:
      opts?.leadDays != null
        ? state.totalDays + opts.leadDays
        : (weekOf(state.totalDays) + 1) * DAYS_PER_WEEK,
    totalCost: total,
    status: 'pending',
  };
  state.purchaseOrders.push(po);
  return po;
}

/** Reverse of spend(): pay down outstanding credit first, then return cash. */
function refund(state: GameState, amount: number): void {
  let remaining = amount;
  if (state.bankCredit > 0) {
    const pay = Math.min(remaining, state.bankCredit);
    state.bankCredit -= pay;
    remaining -= pay;
  }
  state.cash += remaining;
}

/** Units in stock that will spoil within the next `days` game-days. */
export function expiringWithinDays(product: Product, currentDay: number, days: number): number {
  return product.batches
    .filter((b) => b.expiryDay <= currentDay + days)
    .reduce((s, b) => s + b.quantity, 0);
}

export interface OrderOutlook {
  /** Next week's FIXED outflow: the current customers' subscribed volumes,
   * seasonally adjusted for the coming week — what will definitely be ordered. */
  fixDemand: number;
  /** Units in already-created orders still waiting to be fulfilled. */
  backlog: number;
  stock: number;
  incoming: number;
  expiring: number;
  /** Units missing to cover the backlog + next week's fixed demand — what the
   * Einkäufer buys automatically. Deliberately NOT surfaced as a
   * "recommendation": the order screen only states the facts. */
  deficit: number;
}

/**
 * Facts for the Saturday order screen — no cover-multiplier, no buffer, no
 * recommendation: next week's fixed outflow (subscribed volumes × next week's
 * seasonal factor; newly won customers count immediately), the unfulfilled
 * backlog, what's on hand / in transit, what spoils within the week, and the
 * resulting deficit.
 */
export function orderOutlook(state: GameState, productId: ProductId): OrderOutlook {
  const product = getProduct(state, productId);
  const stock = inventoryTotal(product);
  const incoming = incomingPO(state, productId);
  const week = weekOf(state.totalDays);
  const fixDemand = Math.round(
    weeklyDemand(state, productId) * seasonalMultiplier(productId, week + 1),
  );
  const backlog = state.orders
    .filter((o) => o.productId === productId && o.status === 'pending')
    .reduce((s, o) => s + o.quantity, 0);
  const expiring = expiringWithinDays(product, state.totalDays, DAYS_PER_WEEK);
  const deficit = Math.max(0, Math.round(backlog + fixDemand - stock - incoming + expiring));
  return { fixDemand, backlog, stock, incoming, expiring, deficit };
}

/** Cancel & refund the current week's still-pending PO (used when the player
 * overrides the Einkäufer / re-submits the weekly order). */
function refundCurrentWeekPo(state: GameState): void {
  const id = state.currentWeekPoId;
  if (!id) return;
  const idx = state.purchaseOrders.findIndex((p) => p.id === id && p.status === 'pending');
  if (idx >= 0) {
    const po = state.purchaseOrders[idx];
    refund(state, po.totalCost);
    state.weekAcc.purchases -= po.totalCost;
    state.purchaseOrders.splice(idx, 1);
  }
  state.currentWeekPoId = null;
}

/** Place (or replace) the current week's purchase order in one shot. Any order
 * already placed this week is cancelled & refunded first, so this is idempotent
 * within a week and safe for the [ÜBERSCHREIBEN] override. */
export function commitWeeklyOrder(
  state: GameState,
  items: { productId: ProductId; quantity: number }[],
): PurchaseOrder | null {
  refundCurrentWeekPo(state);
  const po = createPurchaseOrderInternal(state, items);
  state.currentWeekPoId = po ? po.id : null;
  state.pendingOrderWeek = null;
  return po;
}

/**
 * Weekly procurement step, run on Saturday once this week's demand is fully in.
 * With an Einkäufer the recommended quantities are ordered automatically (capped
 * to what's affordable); without one, a prompt is raised for the player. The
 * "already ordered this week" reference (currentWeekPoId) is cleared at the
 * Monday rollover, so this fires at most once per week.
 */
function processWeeklyOrder(state: GameState, week: number): void {
  if (!hasEinkaeufer(state)) {
    // Manual: raise the Saturday order prompt for the player to handle.
    state.pendingOrderWeek = week;
    return;
  }

  // Automatic: the Einkäufer covers next week's fixed demand (the deficit),
  // trimmed to budget — no cushion, exactly what the subscriptions need.
  let budget = state.cash + availableCredit(state);
  const items: { productId: ProductId; quantity: number }[] = [];
  for (const product of state.products) {
    const outlook = orderOutlook(state, product.id);
    if (outlook.deficit <= 0) continue;
    const sp = state.supplier.products.find((s) => s.productId === product.id);
    if (!sp) continue;
    const affordable = Math.min(outlook.deficit, Math.floor(budget / sp.price));
    if (affordable <= 0) continue;
    items.push({ productId: product.id, quantity: affordable });
    budget -= affordable * sp.price;
  }
  const po = commitWeeklyOrder(state, items);
  if (po) {
    const summary = po.items
      .map((i) => `${i.quantity}× ${getProduct(state, i.productId).name}`)
      .join(', ');
    notify(
      state,
      `✓ Einkäufer deckt die fixe Nachfrage: ${summary} (${Math.round(po.totalCost)}€) – Lieferung nächsten Montag.`,
      'success',
    );
  }
}

// --- Inquiries --------------------------------------------------------------

function unlockedTypes(state: GameState): CustomerType[] {
  const rev = monthlyRevenue(state);
  const types: CustomerType[] = ['small'];
  if (rev >= MEDIUM_UNLOCK_MONTHLY) types.push('medium');
  if (rev >= LARGE_UNLOCK_MONTHLY) types.push('large');
  return types;
}

/** Products that could be listed right now but aren't in the assortment yet
 * (past their unlockWeek — never before). */
export function listableUnlistedProducts(state: GameState): ProductId[] {
  const week = weekOf(state.totalDays);
  return PRODUCT_DEFS.filter((d) => d.unlockWeek <= week && !isInAssortment(state, d.id)).map(
    (d) => d.id,
  );
}

/** Live product if listed (its VK may have been re-priced by the player),
 * otherwise the catalog definition — inquiries may target listable-but-unlisted
 * products (Wachstumsmotor A). */
function inquiryProductInfo(state: GameState, id: ProductId) {
  return state.products.find((p) => p.id === id) ?? getProductDef(id);
}

/** Bias new inquiries toward products we already sell, so a new customer's
 * first order isn't guaranteed late by the supplier lead time. A slice of
 * demand targets listable-but-unlisted products — the market pulling the player
 * toward more breadth (accepting requires listing, see acceptInquiry). */
function pickInquiryProduct(state: GameState): ProductId {
  const unlisted = listableUnlistedProducts(state);
  if (unlisted.length > 0 && Math.random() < INQUIRY_UNLISTED_PRODUCT_CHANCE) {
    return pick(unlisted);
  }
  const familiar = [
    ...new Set(state.customers.filter((c) => c.active).flatMap((c) => c.lines.map((l) => l.productId))),
  ];
  if (familiar.length > 0 && Math.random() < INQUIRY_FAMILIAR_PRODUCT_CHANCE) {
    return pick(familiar);
  }
  return pick(state.products.map((p) => p.id));
}

/** A customer name not already used by an active customer or an open inquiry,
 * so the customer list never shows confusing duplicates. */
function uniqueCustomerName(state: GameState, type: CustomerType): string {
  const taken = new Set<string>();
  for (const c of state.customers) if (c.active) taken.add(c.name);
  for (const i of state.inquiries) if (i.status === 'open') taken.add(i.name);
  const pool = CUSTOMER_NAME_POOL[type];
  const free = pool.filter((n) => !taken.has(n));
  if (free.length > 0) return pick(free);
  // Pool exhausted — append a number suffix until unique.
  for (let i = 2; i < 999; i++) {
    for (const base of pool) {
      const name = `${base} ${i}`;
      if (!taken.has(name)) return name;
    }
  }
  return `${pick(pool)} ${uid('n')}`;
}

/** Draw a wish price for a new inquiry from the tiered spread (good / mid /
 * lowball as a fraction of list VK). This is the growth brake: many inquiries
 * arrive, but not all are good business — the player earns growth by choosing. */
function rollInquiryTargetPrice(listVk: number): number {
  const r = Math.random();
  let acc = 0;
  let range: [number, number] = INQUIRY_PRICE_TIERS[INQUIRY_PRICE_TIERS.length - 1].range;
  for (const tier of INQUIRY_PRICE_TIERS) {
    acc += tier.weight;
    if (r <= acc) {
      range = tier.range;
      break;
    }
  }
  return Math.round(listVk * randRange(range[0], range[1]) * 2) / 2;
}

/** Weekly volume for a new line: customer-type range × product factor — cheap
 * products sell in bigger quantities (Menge statt Preis), so a Gemüse line is
 * worth roughly as much revenue as a Fisch line. */
function rollLineVolume(type: CustomerType, productId: ProductId): number {
  const [minV, maxV] = CUSTOMER_VOLUME_RANGE[type];
  return Math.round(randInt(minV, maxV) * PRODUCT_VOLUME_FACTOR[productId]);
}

/** Skill-weighted acquisition power of the Vertrieb team (each rep contributes
 * 0.5 + 0.5×Skill/100). Enlarges every tier's market (see typeInquiryChance). */
export function salesAcquisitionPower(state: GameState): number {
  return state.employees
    .filter((e) => e.role === 'sales')
    .reduce((sum, e) => sum + 0.5 + 0.5 * (e.skill / 100), 0);
}

/** Weekly chance of a NEW-customer inquiry of a given size: a per-tier
 * saturation curve, BASE × market/(market + Kunden dieser Größe), whose market
 * is enlarged by the Vertrieb team. Each tier saturates against its OWN count,
 * so a pile of small customers never suppresses the rare medium/large tiers. */
export function typeInquiryChance(state: GameState, type: CustomerType): number {
  const count = state.customers.filter((c) => c.active && c.type === type).length;
  const market = INQUIRY_MARKET[type] + salesAcquisitionPower(state) * SALES_MARKET_PER_REP;
  return INQUIRY_BASE_CHANCE[type] * (market / (market + count));
}

/** Expected new-customer inquiries per week across all unlocked tiers that have
 * free capacity — the headline the staff screen shows. */
export function expectedNewInquiriesPerWeek(state: GameState): number {
  return unlockedTypes(state)
    .filter((t) => freeCapacity(state, t) > 0)
    .reduce((sum, t) => sum + typeInquiryChance(state, t), 0);
}

/** Create one NEW-customer inquiry of the given size. */
function generateNewInquiry(state: GameState, type: CustomerType): void {
  const week = weekOf(state.totalDays);
  const preferred = pickInquiryProduct(state);
  const product = inquiryProductInfo(state, preferred);
  const inquiry: Inquiry = {
    id: uid('inq'),
    name: uniqueCustomerName(state, type),
    emoji: CUSTOMER_EMOJI[type],
    type,
    preferredProduct: preferred,
    suggestedVolume: rollLineVolume(type, preferred),
    targetPrice: rollInquiryTargetPrice(product.verkaufspreis),
    createdWeek: week,
    expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
    status: 'open',
  };
  state.inquiries.push(inquiry);
  const unlistedHint = isInAssortment(state, preferred) ? '' : ' (noch nicht gelistet!)';
  notify(
    state,
    `📨 Neue Kundenanfrage: ${inquiry.name} (${type}) sucht ${product.name}${unlistedHint}.`,
    'info',
  );
}

/**
 * Light expansion inquiries (🔁): existing customers ask to add a product line
 * they don't buy yet. SCALES with the base — every eligible customer rolls
 * EXPANSION_CHANCE_PER_CUSTOMER each Thursday, capped at EXPANSION_MAX_PER_WEEK.
 * Friendly by design: normal expiry, declining has no consequences — the rare
 * Wunsch→Ultimatum engine below stays the only escalating pressure. Customers
 * with any open inquiry or a scheduled ultimatum are skipped (no double-booking).
 */
function maybeGenerateExpansionInquiries(state: GameState): void {
  const week = weekOf(state.totalDays);
  const listable = [
    ...state.products.map((p) => p.id),
    ...listableUnlistedProducts(state),
  ];
  const busy = new Set<string>();
  for (const i of state.inquiries) {
    if (i.status === 'open' && i.existingCustomerId) busy.add(i.existingCustomerId);
  }
  for (const u of state.pendingUltimatums) busy.add(u.customerId);

  let created = 0;
  for (const cust of state.customers) {
    if (created >= EXPANSION_MAX_PER_WEEK) break;
    if (!cust.active) continue;
    if (cust.loyalty < EXPANSION_MIN_LOYALTY) continue;
    if (busy.has(cust.id)) continue;
    const missing = listable.filter((pid) => !cust.lines.some((l) => l.productId === pid));
    if (missing.length === 0) continue;
    if (Math.random() > EXPANSION_CHANCE_PER_CUSTOMER) continue;

    const productId = pick(missing);
    const product = inquiryProductInfo(state, productId);
    state.inquiries.push({
      id: uid('inq'),
      name: cust.name,
      emoji: cust.emoji,
      type: cust.type,
      existingCustomerId: cust.id,
      preferredProduct: productId,
      suggestedVolume: rollLineVolume(cust.type, productId),
      targetPrice: rollInquiryTargetPrice(product.verkaufspreis),
      createdWeek: week,
      expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
      status: 'open',
    });
    notify(
      state,
      `🔁 ${cust.name} möchte zusätzlich ${product.emoji} ${product.name} beziehen.`,
      'info',
    );
    created += 1;
  }
}

// --- Demand engine (Wachstumsmotor Paket B) ---------------------------------
// Established customers WANT more product groups: Wunsch (Stufe 1, friendly,
// 1-4 week deadline) → on rejection/expiry an Ultimatum 3-6 weeks later (Stufe
// 2, 2-3 week deadline) → on rejection/expiry the customer churns COMPLETELY.
// Strictly dosed: one process company-wide, cooldown after each one ends.

/** True while a demand process is running anywhere (open demand inquiry or a
 * scheduled ultimatum) — no second one may start meanwhile. */
function demandProcessActive(state: GameState): boolean {
  return (
    state.inquiries.some((i) => i.status === 'open' && i.demand) ||
    state.pendingUltimatums.length > 0
  );
}

/** Build the demand inquiry (both stages share the shape; the stage lives in
 * `demand`, the deadline doubles as expiryWeek so the normal expiry drives it). */
function pushDemandInquiry(
  state: GameState,
  cust: Customer,
  productId: ProductId,
  stage: 1 | 2,
  deadlineWeek: number,
): void {
  const product = inquiryProductInfo(state, productId);
  state.inquiries.push({
    id: uid('inq'),
    name: cust.name,
    emoji: cust.emoji,
    type: cust.type,
    existingCustomerId: cust.id,
    preferredProduct: productId,
    suggestedVolume: rollLineVolume(cust.type, productId),
    targetPrice: rollInquiryTargetPrice(product.verkaufspreis),
    createdWeek: weekOf(state.totalDays),
    expiryWeek: deadlineWeek,
    status: 'open',
    demand: { stage, deadlineWeek },
  });
}

/** Thursday: maybe an established, loyal customer voices a wish for a product
 * group they don't buy from us yet (Stufe 1). Conditions keep it fair and rare:
 * loyal + established customers only, the product must be listable, customers
 * already at DEMAND_MAX_LINES groups are content, one process at a time. */
function maybeGenerateDemand(state: GameState): void {
  const week = weekOf(state.totalDays);
  if (demandProcessActive(state)) return;
  if (state.lastDemandWeek != null && week - state.lastDemandWeek < DEMAND_COOLDOWN_WEEKS) return;
  if (Math.random() > DEMAND_CHANCE_PER_WEEK) return;

  // Anything listable counts — including products the player hasn't listed yet
  // (the wish is exactly what pulls them toward listing, see Paket A).
  const listable = [
    ...state.products.map((p) => p.id),
    ...listableUnlistedProducts(state),
  ];
  const candidates: { cust: Customer; missing: ProductId[] }[] = [];
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (cust.loyalty < DEMAND_MIN_LOYALTY) continue;
    if (week - cust.sinceWeek < DEMAND_MIN_CUSTOMER_WEEKS) continue;
    if (cust.lines.length >= DEMAND_MAX_LINES) continue;
    const missing = listable.filter((pid) => !cust.lines.some((l) => l.productId === pid));
    if (missing.length > 0) candidates.push({ cust, missing });
  }
  if (candidates.length === 0) return;
  const { cust, missing } = pick(candidates);
  const productId = pick(missing);
  const deadline = week + randInt(DEMAND_STAGE1_DEADLINE[0], DEMAND_STAGE1_DEADLINE[1]);
  pushDemandInquiry(state, cust, productId, 1, deadline);
  const product = inquiryProductInfo(state, productId);
  notify(
    state,
    `🙋 ${cust.name} würde gern auch ${product.emoji} ${product.name} bei uns beziehen – Antwort in ${deadline - week} Wochen fällig.`,
    'info',
  );
}

/** Thursday: due stage-2 escalations become the ULTIMATUM inquiry. A firing
 * that has become moot (customer gone, line meanwhile added, or already content
 * at DEMAND_MAX_LINES) ends the process silently. */
function fireDueUltimatums(state: GameState): void {
  const week = weekOf(state.totalDays);
  const due = state.pendingUltimatums.filter((u) => u.fireWeek <= week);
  if (due.length === 0) return;
  state.pendingUltimatums = state.pendingUltimatums.filter((u) => u.fireWeek > week);
  for (const u of due) {
    const cust = state.customers.find((c) => c.id === u.customerId);
    const moot =
      !cust ||
      !cust.active ||
      cust.lines.some((l) => l.productId === u.productId) ||
      cust.lines.length >= DEMAND_MAX_LINES;
    if (moot) {
      state.lastDemandWeek = week; // process over — cooldown starts
      continue;
    }
    const deadline = week + randInt(DEMAND_STAGE2_DEADLINE[0], DEMAND_STAGE2_DEADLINE[1]);
    pushDemandInquiry(state, cust, u.productId, 2, deadline);
    const product = inquiryProductInfo(state, u.productId);
    notify(
      state,
      `⚠️ ULTIMATUM: ${cust.name} braucht einen Distributor, der auch ${product.emoji} ${product.name} liefert – sonst wechseln sie in ${deadline - week} Wochen KOMPLETT zum Konkurrenten!`,
      'error',
    );
  }
}

/** The demanded line never came: the customer leaves completely — all lines,
 * all revenue. The pain is quantified so the loss is felt, not vague. */
function churnDemandCustomer(state: GameState, cust: Customer, productId: ProductId): void {
  const product = getProductDef(productId);
  const weeklyRevenue = Math.round(cust.lines.reduce((s, l) => s + l.volume * l.price, 0));
  cust.active = false;
  releaseCustomerOrders(state, cust.id);
  notify(
    state,
    `❌ ${cust.name} ist zum Konkurrenten gewechselt (${product.name} fehlte im Sortiment). Verlorener Wochenumsatz: ~${weeklyRevenue}€.`,
    'error',
  );
}

/** Central rejection path for demand inquiries — called when one is dismissed,
 * expires, or a counter offer on it falls through. Stufe 1 → schedule the
 * ultimatum; Stufe 2 → the customer churns completely (only ever after this
 * DOUBLE rejection — never without both warnings). */
export function resolveDemandRejection(state: GameState, inq: Inquiry): void {
  if (!inq.demand) return;
  const week = weekOf(state.totalDays);
  inq.status = 'expired';
  const cust = state.customers.find((c) => c.id === inq.existingCustomerId);
  if (!cust || !cust.active) {
    state.lastDemandWeek = week;
    return;
  }
  if (inq.demand.stage === 1) {
    const product = getProductDef(inq.preferredProduct);
    state.pendingUltimatums.push({
      customerId: cust.id,
      productId: inq.preferredProduct,
      fireWeek: week + randInt(DEMAND_ESCALATION_DELAY[0], DEMAND_ESCALATION_DELAY[1]),
    });
    notify(
      state,
      `😕 ${cust.name} ist enttäuscht – das Thema ${product.emoji} ${product.name} ist damit nicht vom Tisch.`,
      'warn',
    );
  } else {
    churnDemandCustomer(state, cust, inq.preferredProduct);
    state.lastDemandWeek = week;
  }
}

function makeLine(inq: Inquiry, price: number): CustomerLine {
  return {
    productId: inq.preferredProduct,
    price, // accepted price (target price, or the player's counter offer)
    agreedPrice: price, // the mutually agreed baseline for later renegotiations
    volume: inq.suggestedVolume, // fixed quantity
  };
}

/** Probability a customer accepts a counter offer at `price`. At or below the
 * target it's certain; above target it drops off the greedier the ask (slope
 * tuned via COUNTER_ACCEPT_SLOPE so a fair premium lands ~50-70 %). */
export function counterAcceptChance(targetPrice: number, price: number): number {
  if (price <= targetPrice) return 1;
  return clamp(1 - (price / targetPrice - 1) * COUNTER_ACCEPT_SLOPE, 0.05, 1);
}

/** Probability a customer accepts an IN-CONTRACT raise of `line` to `price` —
 * the mirror of counterAcceptChance, judged against the last AGREED price.
 * Existing contracts resist more (steeper slope), great service softens the
 * resistance and lifts the ceiling: prices above listVK × (1 + (stars−3)×4 %)
 * collapse to the floor chance, so 40-45 % margin is earned via service. */
export function repriceAcceptChance(
  state: GameState,
  cust: Customer,
  line: CustomerLine,
  price: number,
): number {
  if (price <= line.agreedPrice * (1 + REPRICE_TOLERANCE)) return 1;
  const listVk = getProduct(state, line.productId).verkaufspreis;
  const ceiling = listVk * (1 + (cust.serviceRating - 3) * REPRICE_STAR_CEILING_BONUS);
  if (price > ceiling) return REPRICE_ACCEPT_FLOOR;
  const increase = price / line.agreedPrice - 1;
  return clamp(
    1 - increase * REPRICE_ACCEPT_SLOPE * repriceStarDamp(cust.serviceRating),
    REPRICE_ACCEPT_FLOOR,
    1,
  );
}

/** Immediately onboard an inquiry: create a new customer, or add a product line
 * to an existing one, at `priceOverride` (defaults to the inquiry's target price)
 * and the fixed suggested volume. */
export function acceptInquiry(state: GameState, inq: Inquiry, priceOverride?: number): void {
  const week = weekOf(state.totalDays);
  const price = priceOverride ?? inq.targetPrice;

  if (inq.existingCustomerId) {
    const cust = state.customers.find((c) => c.id === inq.existingCustomerId);
    inq.status = 'accepted';
    if (!cust || !cust.active) return;
    const product = getProduct(state, inq.preferredProduct);
    // The new line orders together with the customer's other lines on its day.
    cust.lines.push(makeLine(inq, price));
    if (inq.demand) {
      // Demand answered — the process ends here: cooldown starts, any scheduled
      // escalation for this product is moot, loyalty reacts per stage.
      state.lastDemandWeek = week;
      state.pendingUltimatums = state.pendingUltimatums.filter(
        (u) => !(u.customerId === cust.id && u.productId === inq.preferredProduct),
      );
      if (inq.demand.stage === 2) {
        cust.loyalty = clamp(cust.loyalty + DEMAND_STAGE2_LOYALTY_GAIN, 0, 100);
        state.stats.ultimatumsHeld += 1;
        notify(
          state,
          `😅 ${cust.name} bleibt! ${product.emoji} ${product.name} kommt dazu (${inq.suggestedVolume}× @ ${price}€) – die Beziehung erholt sich spürbar.`,
          'success',
        );
      } else {
        cust.loyalty = clamp(cust.loyalty + DEMAND_STAGE1_LOYALTY_GAIN, 0, 100);
        notify(
          state,
          `🤝 ${cust.name} freut sich: ${product.emoji} ${product.name} kommt dazu (${inq.suggestedVolume}× @ ${price}€). Loyalität steigt.`,
          'success',
        );
      }
      return;
    }
    notify(
      state,
      `🎉 ${cust.name} nimmt zusätzlich ${product.emoji} ${product.name} ab! ${inq.suggestedVolume}× @ ${price}€.`,
      'success',
    );
    return;
  }

  // Slot check per manager: the new customer needs SLOT_COST[type] free slots
  // at ONE manager (auto-assigned to the one with the most room).
  const mgr = bestManagerFor(state, inq.type);
  if (!mgr) {
    notify(
      state,
      `❌ Kein Manager hat ${SLOT_COST[inq.type]} freie Slots für ${inq.name} – stelle einen KAM ein oder verteile Kunden um.`,
      'warn',
    );
    return;
  }

  const customer: Customer = {
    id: uid('cust'),
    name: inq.name,
    emoji: inq.emoji,
    type: inq.type,
    lines: [makeLine(inq, price)],
    managerId: mgr.id,
    orderDayOfWeek: randInt(0, 5), // Mon-Sat
    nextOrderWeek: week + 1, // one-week grace to pre-stock before the first order
    serviceRating: 3,
    loyalty: 60,
    lateDeliveries: 0,
    deliveryLeadWeeks: CUSTOMER_LEAD_WEEKS[inq.type],
    volatility: CUSTOMER_VOLATILITY[inq.type],
    activeDiscount: 0,
    sinceWeek: week,
    active: true,
  };
  state.customers.push(customer);
  inq.status = 'accepted';
  notify(
    state,
    `🎉 ${inq.name} ist jetzt Kunde! ${inq.suggestedVolume}× @ ${price}€ · betreut von ${mgr.isChef ? 'dir' : mgr.name}.`,
    'success',
  );
}

function expireInquiries(state: GameState): void {
  const week = weekOf(state.totalDays);
  for (const inq of state.inquiries) {
    if (inq.status === 'open' && inq.expiryWeek <= week) {
      // Letting a demand deadline lapse counts as a rejection (escalate/churn).
      if (inq.demand) {
        resolveDemandRejection(state, inq);
        continue;
      }
      inq.status = 'expired';
      notify(state, `⌛ Anfrage von ${inq.name} ist verfallen.`, 'info');
    }
  }
  // Prune resolved inquiries that are a couple weeks old.
  state.inquiries = state.inquiries.filter(
    (inq) => !(inq.status === 'accepted' || inq.status === 'expired') || inq.expiryWeek > week - 2,
  );
}

// --- Quarterly events -------------------------------------------------------

function applyQuarterlyEvents(state: GameState): void {
  // 1. Customer volatility: ~25% of customers grow or shrink (each product line).
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (Math.random() > 0.25) continue;
    const beforeTotal = cust.lines.reduce((s, l) => s + l.volume, 0);
    for (const line of cust.lines) {
      const change = (Math.random() * 2 - 1) * cust.volatility * 0.5;
      line.volume = Math.max(4, Math.round(line.volume * (1 + change)));
    }
    const afterTotal = cust.lines.reduce((s, l) => s + l.volume, 0);
    const dir = afterTotal >= beforeTotal ? '📈' : '📉';
    notify(state, `${dir} ${cust.name}: Bedarf ${beforeTotal} → ${afterTotal}/Woche.`, 'info');
  }

  // 2. Supplier price increase — the game's built-in antagonist. Staged as a
  // clear event: EK rises → margin falls → the player must react (raise VK). The
  // Einkäufer's negotiation is made visible, and the resulting margin drop is
  // spelled out with a nudge toward the pricing screen.
  if (Math.random() < SUPPLIER_INCREASE_CHANCE) {
    const sp = pick(state.supplier.products);
    const product = getProduct(state, sp.productId);
    const pct = randRange(SUPPLIER_INCREASE_RANGE[0], SUPPLIER_INCREASE_RANGE[1]);
    const skill = bestNegotiationSkill(state);
    const reduction = skill / 100;
    const effective = pct * (1 - reduction);
    const oldPrice = sp.price;
    sp.price = Math.round(oldPrice * (1 + effective) * 100) / 100;
    product.einkaufspreis = sp.price;

    const vk = product.verkaufspreis;
    const marginAt = (ek: number) => (vk > 0 ? ((vk - ek) / vk) * 100 : 0);
    const marginNote =
      vk > 0 ? ` Marge fällt von ${marginAt(oldPrice).toFixed(0)}% auf ${marginAt(sp.price).toFixed(0)}%.` : '';
    if (skill > 0) {
      const wouldBe = Math.round(oldPrice * (1 + pct) * 100) / 100;
      notify(
        state,
        `📈 Lieferant erhöht ${product.name} um ${(pct * 100).toFixed(0)}% (ohne Verhandlung €${wouldBe.toFixed(2)}). Dein Einkäufer holt es auf +${(effective * 100).toFixed(1)}% runter: EK €${oldPrice.toFixed(2)} → €${sp.price.toFixed(2)}.${marginNote} → Preise anpassen.`,
        'warn',
      );
    } else {
      notify(
        state,
        `📈 Lieferant erhöht ${product.name} um ${(effective * 100).toFixed(0)}%: EK €${oldPrice.toFixed(2)} → €${sp.price.toFixed(2)}.${marginNote} Ein Einkäufer könnte verhandeln. → Preise anpassen.`,
        'warn',
      );
    }
  }
}

// --- Weekly rollover --------------------------------------------------------

function weeklyRollover(state: GameState, endedWeek: number, newWeek: number): void {
  // 1. Interest on outstanding credit (charged to the week that just ended).
  if (state.bankCredit > 0) {
    const interest = state.bankCredit * CREDIT_INTEREST_RATE;
    state.bankCredit += interest;
    state.weekAcc.interest += interest;
  }

  // 1b. Accrual accounting for the report: book each week its *share* of the
  // monthly fixed costs (salaries + rent), so the weekly profit reflects the true
  // economic result even though the cash itself only leaves at month end. Over a
  // full month the four weekly shares add up to the amount actually debited below.
  const weeklySalary = state.employees.reduce((s, e) => s + e.salary, 0);
  const monthlyRent = currentMonthlyRent(state);
  state.weekAcc.salaries += weeklySalary;
  state.weekAcc.rent += monthlyRent / WEEKS_PER_MONTH;

  // 1c. Cash side — at month end the whole month's salaries + rent are actually
  // debited, all at once (accrued through the weekly shares above). newWeek is the
  // start of the next month when it is divisible by 4.
  if (newWeek % WEEKS_PER_MONTH === 0 && newWeek > 0) {
    const monthlySalary = weeklySalary * WEEKS_PER_MONTH;
    spend(state, monthlySalary + monthlyRent);
    const expansions = state.warehouse.expansions + state.warehouse.officeExpansions;
    const rentNote =
      expansions > 0
        ? `Miete ${Math.round(monthlyRent)}€ (Basis ${MONTHLY_RENT}€ + ${expansions} Erweiterungen)`
        : `Miete ${MONTHLY_RENT}€`;
    notify(
      state,
      `💸 Monatsabschluss: Personal ${Math.round(monthlySalary)}€ + ${rentNote} abgebucht.`,
      'warn',
    );
  }

  // 2. Close the ended week's report.
  const acc = state.weekAcc;
  const profit = acc.revenue - acc.purchases - acc.salaries - acc.rent - acc.logistics - acc.interest;
  state.stats.totalProfit += profit;
  state.reports.push({
    week: endedWeek,
    revenue: acc.revenue,
    purchases: acc.purchases,
    salaries: acc.salaries,
    rent: acc.rent,
    logistics: acc.logistics,
    spoilageLoss: acc.spoilageLoss,
    spoiledUnits: acc.spoiledUnits,
    interest: acc.interest,
    profit,
    cashEnd: state.cash,
    customerCount: state.customers.filter((c) => c.active).length,
    deliveredOrders: acc.deliveredOrders,
    lateOrders: acc.lateOrders,
    avgStars: state.serviceStars,
  });
  state.profitHistory.push(profit);

  // 3. Update credit limit from the last 4 weeks' average profit.
  const last4 = state.profitHistory.slice(-4);
  const avgProfit = last4.reduce((s, p) => s + p, 0) / last4.length;
  state.creditLimit = Math.max(CREDIT_LIMIT_FLOOR, Math.round(3 * avgProfit));

  // 4. Reset the accumulator for the new week.
  state.weekAcc = {
    revenue: 0,
    purchases: 0,
    salaries: 0,
    rent: 0,
    logistics: 0,
    spoilageLoss: 0,
    spoiledUnits: 0,
    interest: 0,
    deliveredOrders: 0,
    lateOrders: 0,
  };

  // 4b. Roll the ended week's per-product demand into the log (keep the last 4
  // weeks) and reset the running counter — feeds the order recommendation.
  for (const product of state.products) {
    const log = state.demandLog[product.id] ?? [];
    log.push(state.demandThisWeek[product.id] ?? 0);
    if (log.length > 4) log.shift();
    state.demandLog[product.id] = log;
  }
  state.demandThisWeek = {};

  // 5. Quarterly triggers (start of a new quarter/season, not week 0). Keeps
  // running across years so seasons and supplier prices keep evolving.
  if (newWeek % WEEKS_PER_QUARTER === 0 && newWeek > 0) {
    applyQuarterlyEvents(state);
  }

  // 5b. Newly unlocked product groups (not yet in the assortment).
  for (const def of PRODUCT_DEFS) {
    if (def.unlockWeek === newWeek && !isInAssortment(state, def.id)) {
      notify(
        state,
        `🆕 Neue Produktgruppe verfügbar: ${def.emoji} ${def.name}! Im Sortiment aufnehmen (Gebühr ${def.listingFee}€).`,
        'success',
      );
    }
  }

  // 5c. Loyalty with teeth: deeply unhappy customers (below the threshold) may
  // quit — but NEVER without warning. Crossing the threshold raises the warning
  // and starts the clock; the weekly quit roll only runs from the NEXT week, so
  // there is always at least one week to react (service, discount, patience).
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (cust.loyalty < LOYALTY_CHURN_THRESHOLD) {
      if (cust.lowLoyaltySinceWeek == null) {
        cust.lowLoyaltySinceWeek = newWeek;
        notify(
          state,
          `💔 ${cust.name} ist tief unzufrieden (Loyalität ${Math.round(cust.loyalty)}%) und droht zu kündigen – Service verbessern oder Rabatt geben!`,
          'error',
        );
      } else if (newWeek > cust.lowLoyaltySinceWeek) {
        const depth = (LOYALTY_CHURN_THRESHOLD - cust.loyalty) / LOYALTY_CHURN_THRESHOLD;
        if (Math.random() < depth * LOYALTY_CHURN_CHANCE_MAX) {
          const weekly = Math.round(cust.lines.reduce((s, l) => s + l.volume * l.price, 0));
          cust.active = false;
          releaseCustomerOrders(state, cust.id);
          notify(
            state,
            `❌ ${cust.name} hat gekündigt – das Vertrauen war aufgebraucht. Verlorener Wochenumsatz: ~${weekly}€.`,
            'error',
          );
        }
      }
    } else if (cust.lowLoyaltySinceWeek != null) {
      cust.lowLoyaltySinceWeek = undefined; // recovered — clock resets
    }
  }

  // 6. Customer acquisition pipeline: expire stale inquiries here (weekly). NEW
  // inquiries arrive Thursday and the order window is Saturday (see onDayStart).
  expireInquiries(state);

  // 6b. Start of a fresh order-week: forget last week's purchase order (it is on
  // its way / delivered — do NOT refund it) and clear any leftover prompt. The
  // Saturday step then places exactly one order for the new week.
  state.currentWeekPoId = null;
  state.pendingOrderWeek = null;

  // 7. Weekly report notification.
  notify(
    state,
    `📊 Wochenreport W${endedWeek}: Gewinn ${profit >= 0 ? '+' : ''}${Math.round(profit)}€, Kasse ${Math.round(state.cash)}€.`,
    profit >= 0 ? 'success' : 'warn',
  );

  // 8. Year complete? Fires at every year boundary (week 48, 96, …), pausing for
  // the year-summary screen. The player can then continue into the next year.
  if (newWeek % WEEKS_PER_YEAR === 0 && newWeek > 0) {
    const year = newWeek / WEEKS_PER_YEAR;
    state.yearComplete = true;
    state.paused = true;
    notify(state, `🏁 Jahr ${year} geschafft! 12 Monate abgeschlossen. Siehe Jahresabschluss.`, 'success');
  }
}

// --- Day start --------------------------------------------------------------

function onDayStart(state: GameState, dayIndex: number): void {
  // Weekly rollover happens at the start of Monday (except day 0).
  if (dayIndex % DAYS_PER_WEEK === 0 && dayIndex > 0) {
    const newWeek = dayIndex / DAYS_PER_WEEK;
    weeklyRollover(state, newWeek - 1, newWeek);
  }

  updateSpoilage(state, dayIndex);

  // Customer orders: each customer orders ALL its product lines together once a
  // week, on its own day, spread randomly across Mon-Sat (never Sunday) and
  // re-randomised after each order.
  const week = weekOf(dayIndex);
  const dow = dayOfWeek(dayIndex);
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (cust.nextOrderWeek <= week && cust.orderDayOfWeek === dow) {
      for (const line of cust.lines) {
        generateCustomerOrder(state, cust, line);
      }
      cust.nextOrderWeek = week + 1;
      cust.orderDayOfWeek = randInt(0, 5); // Mon-Sat, exclude Sunday
    }
  }

  // New customer & expansion inquiries arrive on Thursday — the player sees the
  // fresh demand before the Saturday order. During the tutorial they are held
  // back until the growth lesson is DONE, so the uncle's two inquiries stay the
  // only open ones while the accept/counter guidance runs.
  const inquiriesUnlocked = !state.tutorial?.active || state.tutorial.step > STEP.GROWTH;
  if (dow === INQUIRY_DAY_OF_WEEK && inquiriesUnlocked) {
    // Per-tier acquisition: each unlocked size with free capacity rolls its own
    // saturation curve independently (small saturates → bounded; medium/large
    // keep their own trickle; Vertrieb enlarges every market).
    for (const type of unlockedTypes(state)) {
      if (freeCapacity(state, type) <= 0) continue;
      if (Math.random() < typeInquiryChance(state, type)) generateNewInquiry(state, type);
    }
    // Bestandskunden-Entwicklung: light expansion wishes scale with the base…
    maybeGenerateExpansionInquiries(state);
    // …while the demand engine (Wachstumsmotor) stays the rare, serious event:
    // due ultimatums first, then maybe a new wish (one process at a time).
    fireDueUltimatums(state);
    maybeGenerateDemand(state);
  }

  // Weekly order window: Saturday, after this week's customer orders are in (so
  // the recommendation is built on demand the player has actually seen). Fires
  // at most once per week — currentWeekPoId is cleared at the Monday rollover, so
  // if the player already ordered earlier this week we don't prompt again. During
  // the tutorial the prompt is held back until the ordering beat unlocks it.
  const orderingUnlocked = !state.tutorial?.active || state.tutorial.step >= STEP.ORDER;
  if (dow === ORDER_DAY_OF_WEEK && state.currentWeekPoId === null && orderingUnlocked) {
    processWeeklyOrder(state, week);
  }
}

// --- Tutorial ---------------------------------------------------------------

/** Create the two inquiries "the uncle left behind" for the growth beat (BEAT 2):
 * small fish customers, so accepting can't be late. The first teaches Annehmen,
 * the second Gegenangebot. Fixed ids; each is only created if it doesn't already
 * exist (the recovery path may re-enter the growth beat). */
function forceTutorialInquiries(state: GameState): void {
  const week = weekOf(state.totalDays);
  const product = getProduct(state, 'fisch');
  let created = 0;
  for (const id of TUTORIAL_INQUIRY_IDS) {
    if (state.inquiries.some((i) => i.id === id)) continue;
    // The first inquiry (Annehmen lesson) offers a fair wish price; the second
    // (Gegenangebot lesson) deliberately lowballs at ~90 % of list, so the player
    // learns early that accepting is a decision and countering restores margin.
    const isCounterLesson = id === TUTORIAL_INQUIRY_IDS[1];
    state.inquiries.push({
      id,
      name: uniqueCustomerName(state, 'small'),
      emoji: CUSTOMER_EMOJI.small,
      type: 'small',
      preferredProduct: 'fisch',
      suggestedVolume: rollLineVolume('small', 'fisch'),
      targetPrice: Math.round(product.verkaufspreis * (isCounterLesson ? 0.9 : 1) * 2) / 2,
      createdWeek: week,
      expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
      status: 'open',
    });
    created += 1;
  }
  if (created > 0) {
    notify(state, `📨 Dein Onkel hat dir ${created === 2 ? '2 Kundenanfragen' : 'eine Kundenanfrage'} hinterlassen!`, 'info');
  }
}

/** The guaranteed (100 %) Fleisch inquiry of the meat beat — arrives the moment
 * Fleisch is listed in the assortment. Small customer, so accepting can't be
 * late; fixed id so the UI can glow its Annehmen button. */
function forceMeatInquiry(state: GameState): void {
  if (state.inquiries.some((i) => i.id === TUTORIAL_MEAT_INQUIRY_ID)) return;
  const week = weekOf(state.totalDays);
  const product = getProduct(state, 'fleisch');
  state.inquiries.push({
    id: TUTORIAL_MEAT_INQUIRY_ID,
    name: uniqueCustomerName(state, 'small'),
    emoji: CUSTOMER_EMOJI.small,
    type: 'small',
    preferredProduct: 'fleisch',
    suggestedVolume: rollLineVolume('small', 'fleisch'),
    targetPrice: Math.round(product.verkaufspreis * 2) / 2,
    createdWeek: week,
    expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
    status: 'open',
  });
  notify(state, `📨 Ein Fleisch-Interessent hat angefragt – dein erster 🥩-Kunde wartet!`, 'info');
}

/** Move to the growth beat: auto-prep on for the rest of the game. The uncle's
 * two inquiries do NOT appear yet — they arrive on the weekly inquiry day
 * (Thursday), so the tutorial follows the game's natural rhythm. Shared by the
 * celebration's "Weiter" and the recovery path. */
function tutorialEnterGrowth(state: GameState): void {
  if (!state.tutorial) return;
  state.tutorial.step = STEP.GROWTH;
  state.settings.autoPrep = true;
}

/** UI hook for the celebration overlay's "Weiter". */
export function tutorialContinueFromCelebrate(state: GameState): void {
  tutorialEnterGrowth(state);
}

/** Recovery: the starter order vanished (e.g. the customer cancelled and
 * releaseCustomerOrders dropped it) while the early beats still waited on it.
 * Without this the machine would sit in HERRICHTEN/REWARD forever with the whole
 * UI locked — skip the celebration and carry on with the growth beat instead. */
function tutorialRecoverToGrowth(state: GameState): void {
  if (!state.tutorial) return;
  notify(state, `⚠️ Der erste Auftrag ist entfallen – weiter geht's mit den Anfragen des Onkels!`, 'warn');
  tutorialEnterGrowth(state);
}

/** Enter the ordering beat (BEAT 3). No forced prompt — the order window opens
 * through the REGULAR Saturday cycle (processWeeklyOrder is unlocked from this
 * step), so the first purchase happens at the natural weekly moment. */
function enterTutorialOrder(state: GameState): void {
  if (!state.tutorial) return;
  state.tutorial.step = STEP.ORDER;
}

/** UI hook for the monthly-statement overlay's "Fertig": end the tutorial and
 * free the whole UI. Milestone checks only run once the tutorial is over, so we
 * reconcile here: goals silently met DURING the tutorial (e.g. the first
 * delivery) are marked done without a celebration, and show up already ticked
 * when the notebook is introduced. */
export function finishTutorial(state: GameState): void {
  state.tutorial = null;
  reconcileMilestones(state);
}

// --- Milestones ("Onkels Notizbuch") ----------------------------------------

/** Mark every already-satisfied milestone as achieved WITHOUT a celebration —
 * called once when the tutorial ends. Anything the player accomplished during the
 * guided phase enters the notebook pre-ticked (no retroactive confetti). */
export function reconcileMilestones(state: GameState): void {
  const week = weekOf(state.totalDays);
  for (const def of MILESTONE_DEFS) {
    const progress = state.milestones.find((m) => m.id === def.id);
    if (!progress || progress.achievedWeek !== null) continue;
    if (def.check(state)) progress.achievedWeek = week;
  }
}

/** Check milestone conditions and fire newly-achieved ones: record the week,
 * notify, queue the celebration overlay and pause. Runs every tick but only once
 * the tutorial has ended (no milestone pop-ups during onboarding). Cheap and
 * idempotent — an achieved milestone is skipped forever after. */
export function checkMilestones(state: GameState): void {
  if (state.tutorial) return; // tutorial still running — checks are held back
  const week = weekOf(state.totalDays);
  for (const def of MILESTONE_DEFS) {
    const progress = state.milestones.find((m) => m.id === def.id);
    if (!progress || progress.achievedWeek !== null) continue;
    if (!def.check(state)) continue;
    progress.achievedWeek = week;
    notify(state, `📓 Meilenstein erreicht: ${def.title}!`, 'success');
    // Queue the celebration; the UI (MilestoneLayer) shows it and owns the pause.
    // Deliberately NOT paused here — a sim-driven pause would wedge any headless
    // run (or hidden tab) that doesn't drain the queue.
    (state.celebrateMilestones ??= []).push(def.id);
  }
}

/**
 * Idempotent forward-only beat machine, run once per tick from advance(). Only
 * the automatic transitions live here; the INTRO→HERRICHTEN, CELEBRATE→GROWTH and
 * MONTH→end transitions are driven by explicit UI buttons (see TutorialLayer).
 */
export function advanceTutorial(state: GameState): void {
  const t = state.tutorial;
  if (!t || !t.active) return;

  switch (t.step) {
    case STEP.HERRICHTEN: {
      const o = state.orders.find((ord) => ord.id === TUTORIAL_ORDER_ID);
      // Order gone without a cash payment (payment would have jumped straight to
      // CELEBRATE inside truckPickup) → it was cancelled away; recover.
      if (!o) tutorialRecoverToGrowth(state);
      // The player pressed Herrichten → the starter order left 'pending'.
      else if (o.status !== 'pending') t.step = STEP.REWARD;
      break;
    }
    case STEP.REWARD: {
      // Waiting for the truck to pay the starter order (handled in truckPickup).
      // If the order vanished unpaid, nothing can ever complete this beat — recover.
      const o = state.orders.find((ord) => ord.id === TUTORIAL_ORDER_ID);
      if (!o) tutorialRecoverToGrowth(state);
      break;
    }
    case STEP.GROWTH: {
      // The uncle's inquiries arrive on the weekly inquiry day (Thursday) — not
      // the instant the celebration closes. Until then the player just plays.
      if (!state.inquiries.some((i) => TUTORIAL_INQUIRY_IDS.includes(i.id))) {
        if (dayOfWeek(state.totalDays) >= INQUIRY_DAY_OF_WEEK) {
          forceTutorialInquiries(state);
        }
        break;
      }
      // Both dealt with (accepted, countered, dismissed or expired) → the
      // accept + counter-offer lesson is done.
      const anyOpen = state.inquiries.some(
        (i) => TUTORIAL_INQUIRY_IDS.includes(i.id) && i.status === 'open',
      );
      if (!anyOpen) enterTutorialOrder(state);
      break;
    }
    case STEP.ORDER: {
      // The first purchase happens at the REGULAR Saturday window. Remember that
      // the prompt was raised; advance once it's dealt with — an order placed, or
      // the raised prompt closed/skipped (the Monday rollover clearing it doubles
      // as a time-based fallback).
      if (state.pendingOrderWeek != null) t.orderPromptSeen = true;
      if (
        state.currentWeekPoId != null ||
        (t.orderPromptSeen && state.pendingOrderWeek == null)
      ) {
        t.step = STEP.CAPACITY;
      }
      break;
    }
    case STEP.CAPACITY: {
      // Free play until Fleisch unlocks (3rd week) — then the meat lesson runs:
      // list Fleisch, win the guaranteed meat customer, restock.
      if (weekOf(state.totalDays) >= getProductDef('fleisch').unlockWeek) {
        t.step = STEP.MEAT;
        notify(state, `🥩 Neue Produktgruppe freigeschaltet: Fleisch! Nimm sie ins Sortiment auf.`, 'success');
      }
      break;
    }
    case STEP.MEAT: {
      // The first monthly statement ends the lesson REGARDLESS — the meat beat
      // is optional and must never hold the locked features hostage. Ignoring
      // Fleisch is a valid choice: it stays listable in the Sortiment forever,
      // and the tutorial ends at the same moment as on the guided path.
      if (state.reports.length >= WEEKS_PER_MONTH) {
        if (!isInAssortment(state, 'fleisch')) {
          notify(
            state,
            '👴 „Fleisch läuft dir nicht weg – du findest es jederzeit im Sortiment."',
            'info',
          );
        }
        t.step = STEP.MONTH;
        state.paused = true; // story overlay — don't let the sim run behind it
        break;
      }
      // Phase A: Fleisch must be listed in the assortment (coach guides there).
      if (!isInAssortment(state, 'fleisch')) break;
      // Phase B: the guaranteed meat inquiry arrives on the weekly inquiry day
      // (Thursday) after listing, then wants accepting.
      if (!state.inquiries.some((i) => i.id === TUTORIAL_MEAT_INQUIRY_ID)) {
        if (dayOfWeek(state.totalDays) >= INQUIRY_DAY_OF_WEEK) {
          forceMeatInquiry(state);
        }
        break;
      }
      // Phase C: restock meat via the REGULAR Saturday window (no forced
      // prompt) — the marker keeps the coach text honest; the transition above
      // fires at the week-4 statement either way.
      if (state.pendingOrderWeek != null) t.meatOrderPrompted = true;
      break;
    }
    // REWARD→CELEBRATE is set in truckPickup; INTRO/CELEBRATE/MONTH wait on the UI.
  }
}

// --- Main advance -----------------------------------------------------------

/**
 * How much of the interval [prev, next] (in game-days) falls inside the daily
 * working window [WORK_START_HOUR, WORK_END_HOUR). Worker task progress is scaled
 * by this so nothing gets done at night. Iterates day-by-day (the capped delta is
 * far below one day, so this loops at most twice).
 */
function workingDelta(prev: number, next: number): number {
  const wStart = WORK_START_HOUR / 24;
  const wEnd = WORK_END_HOUR / 24;
  let total = 0;
  let a = prev;
  while (a < next) {
    const day = Math.floor(a);
    const dayEnd = Math.min(next, day + 1);
    const lo = Math.max(a, day + wStart);
    const hi = Math.min(dayEnd, day + wEnd);
    if (hi > lo) total += hi - lo;
    a = dayEnd;
  }
  return total;
}

/**
 * Convert a real-time tick into game-days, fast-forwarding the night: day
 * portions (6–20) run at the chosen speed, night portions at NIGHT_SPEED (×16).
 * Integrates piecewise up to each next 6:00/20:00 boundary, so a tick that
 * crosses a boundary applies each factor exactly to its own segment (no
 * overshooting the morning at night speed).
 */
function nightAwareDelta(totalDays: number, realSeconds: number, userSpeed: number): number {
  const wStart = WORK_START_HOUR / 24;
  const wEnd = WORK_END_HOUR / 24;
  // Float-safety margin: the stepping snaps ONTO boundaries, and `t - day` can
  // round to a hair below the boundary it just landed on — which would classify
  // the same instant as "before the boundary" forever and freeze the clock at
  // exactly 20:00. Anything within EPS below a boundary counts as past it.
  const EPS = 1e-9;
  let t = totalDays;
  let rem = realSeconds;
  let guard = 0;
  while (rem > 1e-6 && guard++ < 16) {
    const day = Math.floor(t);
    const frac = t - day;
    const beforeWork = frac < wStart - EPS;
    const inWork = !beforeWork && frac < wEnd - EPS;
    const factor = inWork ? userSpeed : NIGHT_SPEED;
    // Next factor-change boundary strictly ahead of t.
    const boundary = beforeWork ? day + wStart : inWork ? day + wEnd : day + 1 + wStart;
    const capacity = (rem / SECONDS_PER_DAY_AT_1X) * factor; // game-days at this factor
    const step = Math.min(capacity, boundary - t);
    const nt = t + step;
    if (nt === t) break; // sub-ulp remainder — nothing meaningful left to add
    rem -= (step / factor) * SECONDS_PER_DAY_AT_1X;
    t = nt;
  }
  // Derive the delta from the position actually reached — exact by construction.
  return t - totalDays;
}

export function advance(state: GameState, realDeltaMs: number): void {
  if (state.paused || state.gameOver || state.yearComplete) return;

  // Cap the delta so a long pause (e.g. hidden tab) can't skip events. The night
  // (20–6) fast-forwards at NIGHT_SPEED regardless of the chosen speed.
  const cappedMs = Math.min(realDeltaMs, 250);
  const deltaDays = nightAwareDelta(state.totalDays, cappedMs / 1000, state.speed);
  if (deltaDays <= 0) return;

  const prev = state.totalDays;
  const next = prev + deltaDays;

  // Fire day-start events for every integer day boundary we crossed.
  const firstDay = Math.floor(prev) + 1;
  for (let d = firstDay; d <= next; d++) {
    state.totalDays = d; // events see the day they belong to
    onDayStart(state, d);
    if (state.yearComplete || state.gameOver) {
      return;
    }
  }
  state.totalDays = next;

  // Daily 18:00 truck pickups crossed in this interval.
  const startDay = Math.floor(prev);
  const endDay = Math.floor(next);
  for (let d = startDay; d <= endDay; d++) {
    const threshold = d + TRUCK_DAY_FRACTION;
    if (threshold > prev && threshold <= next) {
      truckPickup(state, weekOf(d));
    }
  }

  // Continuous & idempotent updates. Worker task progress only counts working
  // hours (6–20); the rest of the interval is "Feierabend" and nothing advances.
  updateEmployees(state, workingDelta(prev, next));
  autoAssignWork(state);
  receiveDuePurchaseOrders(state);
  collectDuePayments(state);

  // Bankruptcy check.
  if (state.cash <= BANKRUPTCY_CASH && availableCredit(state) <= 0) {
    state.gameOver = true;
    state.paused = true;
    notify(state, `💀 Insolvenz! Das Geschäft ist pleite. Spiel vorbei.`, 'error');
  }

  // Advance the onboarding beat machine from the state this tick produced.
  advanceTutorial(state);

  // Check "Onkels Notizbuch" milestones (no-op while the tutorial runs).
  checkMilestones(state);
}
