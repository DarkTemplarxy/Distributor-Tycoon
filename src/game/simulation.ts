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
  REGIONAL_KAM_LARGE_SLOTS,
  PREP_HOURS_PER_UNIT,
  PUTAWAY_HOURS_PER_UNIT,
  CARRY_CAPACITY,
  CARRY_CAPACITY_CART,
  CARRY_TRIP_DAYS,
  SKILL_SPEED_BASELINE,
  SKILL_SPEED_PER_POINT,
  COUNTER_ACCEPT_SLOPE,
  CREDIT_INTEREST_RATE,
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_EMOJI,
  CUSTOMER_LEAD_WEEKS,
  CUSTOMER_NAME_POOL,
  BACKLOG_CATCHUP_WEEKS,
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
  RENOWN,
  MARKET,
  groupOfArticle,
  articleEconomics,
  articlesOfGroup,
  pickArticleForRegion,
  defaultArticleOf,
  ARTICLE_REACH,
  ARTICLE_DEV_START_WEEK,
  ARTICLE_DEV_CUSTOMER_AGE,
  ARTICLE_DEV_CHANCE,
  ARTICLE_VOLUME_FACTOR,
  INQUIRY_DAY_OF_WEEK,
  ORDER_DAY_OF_WEEK,
  INQUIRY_EXPIRY_WEEKS,
  INQUIRY_UNLISTED_PRODUCT_CHANCE,
  INQUIRY_PRICE_TIERS,
  LARGE_UNLOCK_MONTHLY,
  LOYALTY_CHURN_CHANCE_MAX,
  LOYALTY_CHURN_THRESHOLD,
  COMPETITOR_DEFS,
  COMPETITOR_STRENGTH_DRIFT,
  COMPETITOR_STRENGTH_BAND,
  POACH_BASE_CHANCE,
  POACH_COURT_WEEKS,
  POACH_EXPOSURE_FULL,
  POACH_SAFE_LOYALTY,
  POACH_DIRECT_LOSS_LOYALTY,
  GEGENANGEBOT_DISCOUNT,
  POACH_DECISION_WEEKS,
  FIRST_ATTACK_WEEK,
  COMP_SERVICE_NEUTRAL,
  COMP_SERVICE_SLOPE,
  COMP_AGGR_SLOPE,
  COMP_SHARE_MIN_MULT,
  COMP_SHARE_MAX_MULT,
  COMP_SLOT_EASE,
  supplierDeliversTo,
  SITE_META,
  BRANCH_ORDER,
  cityPoolFactor,
  BRANCH_RENT,
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
  FORKLIFT_PUTAWAY_SPEED,
  PACKSTATION_PREP_SPEED,
  BUYER_PRODUCT_CAPACITY,
  COOLING_SHELFLIFE_BONUS,
  NO_COOLING_SPOILAGE_MULT,
  TRANSFER_COST_PER_PALLET,
  TRANSFER_COST_OWN_PER_PALLET,
  FLEET_VEHICLES,
  PICKUP_SAVE_PER_CAPACITY,
  PICKUP_SAVE_FLOOR,
  volumeDiscount,
  getStrategyDef,
  BIGORDER_CHANCE_PER_WEEK,
  BIGORDER_COOLDOWN_WEEKS,
  BIGORDER_MIN_CUSTOMERS,
  BIGORDER_VOLUME_MULT,
  BIGORDER_PRICE_PREMIUM,
  BIGORDER_EXPIRY_WEEKS,
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
  Competitor,
  Customer,
  CustomerLine,
  CustomerType,
  EquipmentId,
  VehicleId,
  SiteId,
  Transfer,
  GameState,
  Inquiry,
  NotificationType,
  Order,
  Palette,
  Product,
  ProductId,
  ArticleId,
  PurchaseOrder,
  YearStats,
} from './types';
import {
  clamp,
  dayOfWeek,
  euro,
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

/** Units on shelves AT THIS SITE — the only stock available to prepare orders. */
export function shelfStock(product: Product, site: SiteId = 'hq'): number {
  return product.batches.reduce(
    (s, b) => s + (b.location === 'shelf' && (b.siteId ?? 'hq') === site ? b.quantity : 0),
    0,
  );
}

/** Units in the inbound zone AT THIS SITE, waiting to be shelved. */
export function inboundStock(product: Product, site: SiteId = 'hq'): number {
  return product.batches.reduce(
    (s, b) => s + (b.location === 'inbound' && (b.siteId ?? 'hq') === site ? b.quantity : 0),
    0,
  );
}

// --- Standorte (L3) ---------------------------------------------------------
export function branchOpen(state: GameState): boolean {
  return !!state.branches && Object.keys(state.branches).length > 0;
}
/** Ist DIESER Standort in Betrieb (hq immer, sonst eröffnete Zweigstelle)? */
export function branchOpenAt(state: GameState, site: SiteId): boolean {
  return site === 'hq' || !!state.branches?.[site];
}
/** Das Warehouse eines Standorts ('hq' = Hauptlager, sonst die eröffnete Zweigstelle). */
export function warehouseOf(state: GameState, site: SiteId = 'hq'): GameState['warehouse'] {
  const branch = site !== 'hq' ? state.branches?.[site] : undefined;
  return branch ?? state.warehouse;
}
export function siteOfCustomer(c: { region?: SiteId } | undefined): SiteId {
  return c?.region ?? 'hq';
}
export function siteOfEmployee(e: { siteId?: SiteId }): SiteId {
  return e.siteId ?? 'hq';
}
export function siteOfOrder(state: GameState, order: { customerId: string }): SiteId {
  return siteOfCustomer(state.customers.find((c) => c.id === order.customerId));
}
/** Alle aktiven Standorte (Hauptlager + eröffnete Zweigstellen, in Eröffnungs-Reihenfolge). */
export function activeSites(state: GameState): SiteId[] {
  return ['hq', ...BRANCH_ORDER.filter((s) => state.branches?.[s])];
}

/** Total shelf capacity in units at a site: shelves × slots × palette size. */
export function shelfCapacity(state: GameState, site: SiteId = 'hq'): number {
  return warehouseOf(state, site).shelves.length * SHELF_SLOTS * PALETTE_SIZE;
}
export function shelfUsed(state: GameState, site: SiteId = 'hq'): number {
  return state.products.reduce((s, p) => s + shelfStock(p, site), 0);
}
export function shelfFree(state: GameState, site: SiteId = 'hq'): number {
  return Math.max(0, shelfCapacity(state, site) - shelfUsed(state, site));
}

// --- ❄️ Kühlbereich ---------------------------------------------------------
// Als Kühlbereich markierte Lager-Kacheln machen die Regale darauf zu
// Kühlregalen. Die Lagerkapazität ist damit PARTITIONIERT: kühlpflichtige Ware
// (Käse/Tiefkühl/Feinkost) lagert AUSSCHLIESSLICH in Kühlregalen, alle andere
// Ware ausschließlich in normalen Regalen.

export function coolTiles(state: GameState, site: SiteId = 'hq'): { gx: number; gy: number }[] {
  return warehouseOf(state, site).coolTiles ?? [];
}
export function isCoolTile(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): boolean {
  return coolTiles(state, site).some((t) => t.gx === gx && t.gy === gy);
}
/** Kühlregale = Regale, die auf einer Kühlbereich-Kachel stehen. */
export function coldShelfCount(state: GameState, site: SiteId = 'hq'): number {
  return warehouseOf(state, site).shelves.filter((s) => isCoolTile(state, s.gx, s.gy, site)).length;
}
export function coldShelfCapacity(state: GameState, site: SiteId = 'hq'): number {
  return coldShelfCount(state, site) * SHELF_SLOTS * PALETTE_SIZE;
}
export function coldShelfUsed(state: GameState, site: SiteId = 'hq'): number {
  return state.products.reduce(
    (s, p) => s + (getProductDef(p.groupId).requiresCooling ? shelfStock(p, site) : 0),
    0,
  );
}
export function coldShelfFree(state: GameState, site: SiteId = 'hq'): number {
  return Math.max(0, coldShelfCapacity(state, site) - coldShelfUsed(state, site));
}
export function normalShelfCapacity(state: GameState, site: SiteId = 'hq'): number {
  return shelfCapacity(state, site) - coldShelfCapacity(state, site);
}
export function normalShelfUsed(state: GameState, site: SiteId = 'hq'): number {
  return shelfUsed(state, site) - coldShelfUsed(state, site);
}
export function normalShelfFree(state: GameState, site: SiteId = 'hq'): number {
  return Math.max(0, normalShelfCapacity(state, site) - normalShelfUsed(state, site));
}
/** Freier Regalplatz für DIESEN Artikel (kalt → Kühlregale, sonst normale). */
export function shelfFreeFor(state: GameState, articleId: ArticleId, site: SiteId = 'hq'): number {
  return getProductDef(groupOfArticle(articleId)!).requiresCooling
    ? coldShelfFree(state, site)
    : normalShelfFree(state, site);
}
/** Regal-Gesamtkapazität, die diesem Artikel überhaupt offensteht. */
export function shelfCapacityFor(state: GameState, articleId: ArticleId, site: SiteId = 'hq'): number {
  return getProductDef(groupOfArticle(articleId)!).requiresCooling
    ? coldShelfCapacity(state, site)
    : normalShelfCapacity(state, site);
}

/** Total inbound (Wareneingang) capacity and how much is free right now. */
export function inboundCapacity(state: GameState, site: SiteId = 'hq'): number {
  return warehouseOf(state, site).inboundSlots * PALETTE_SIZE;
}
export function inboundUsed(state: GameState, site: SiteId = 'hq'): number {
  return state.products.reduce((s, p) => s + inboundStock(p, site), 0);
}
export function inboundFree(state: GameState, site: SiteId = 'hq'): number {
  return Math.max(0, inboundCapacity(state, site) - inboundUsed(state, site));
}

export function getProduct(state: GameState, id: ArticleId): Product {
  return state.products.find((p) => p.id === id)!;
}

export function incomingPO(state: GameState, id: ArticleId, site?: SiteId): number {
  let sum = 0;
  for (const po of state.purchaseOrders) {
    if (po.status !== 'pending') continue;
    if (site && (po.siteId ?? 'hq') !== site) continue;
    for (const item of po.items) if (item.productId === id) sum += item.quantity;
  }
  return sum;
}

/** Ist die GRUPPE (Kategorie) im Sortiment (= mindestens ein Artikel davon gelistet)? */
export function isInAssortment(state: GameState, id: ProductId): boolean {
  return state.products.some((p) => p.groupId === id);
}
/** Ist dieser konkrete ARTIKEL (SKU) gelistet? */
export function isArticleListed(state: GameState, id: ArticleId): boolean {
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
    if (def.exclusiveSite === 'sued' && !branchOpen(state)) {
      return { def, status: 'locked', reason: 'braucht Standort Süd' };
    }
    if (week >= def.unlockWeek) return { def, status: 'addable' };
    return { def, status: 'locked', reason: `ab Woche ${def.unlockWeek + 1}` };
  });
}

/** Remove `qty` units of SHELF stock from a product, FIFO (soonest expiry
 * first). Inbound stock is never used to fill orders. */
function deductInventory(product: Product, qty: number, site: SiteId = 'hq'): void {
  let remaining = qty;
  product.batches.sort((a, b) => a.expiryDay - b.expiryDay);
  for (const batch of product.batches) {
    if (remaining <= 0) break;
    if (batch.location !== 'shelf' || (batch.siteId ?? 'hq') !== site) continue;
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
function expansionFrontier(state: GameState, zone: 'hall' | 'office', site: SiteId = 'hq'): ExpansionBlock[] {
  const w = warehouseOf(state, site);
  const zoneTiles = w.tiles.filter((t) =>
    zone === 'office' ? t.zone === 'office' : t.zone !== 'office',
  );
  if (zoneTiles.length === 0) return [];
  const occupied = new Set(w.tiles.map((t) => cellKey(t.gx, t.gy)));
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
function objectAt(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): boolean {
  const w = warehouseOf(state, site);
  return (
    w.shelves.some((s) => s.gx === gx && s.gy === gy) ||
    w.tables.some((t) => t.gx === gx && t.gy === gy) ||
    w.desks.some((d) => d.gx === gx && d.gy === gy)
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
function freeNeighbors(
  state: GameState,
  gx: number,
  gy: number,
  blocked?: { gx: number; gy: number },
  site: SiteId = 'hq',
): number {
  let n = 0;
  const w = warehouseOf(state, site);
  for (const [dx, dy] of N4) {
    const x = gx + dx;
    const y = gy + dy;
    if (blocked && blocked.gx === x && blocked.gy === y) continue;
    if (!w.tiles.some((t) => t.gx === x && t.gy === y)) continue;
    if (objectAt(state, x, y, site)) continue;
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
export function placementBlocksAccess(
  state: GameState,
  gx: number,
  gy: number,
  site: SiteId = 'hq',
): string | null {
  if (freeNeighbors(state, gx, gy, undefined, site) === 0) {
    return 'Objekt wäre nicht erreichbar – mindestens eine Nachbarkachel muss frei bleiben.';
  }
  for (const [dx, dy] of N4) {
    const x = gx + dx;
    const y = gy + dy;
    if (!objectAt(state, x, y, site)) continue;
    if (freeNeighbors(state, x, y, { gx, gy }, site) === 0) {
      return 'Würde ein Nachbar-Objekt einmauern – dessen letzte freie Seite bleibt frei.';
    }
  }
  return null;
}

/** Current monthly rent: base + RENT_PER_EXPANSION per built 2×2 block (hall
 * and office alike) — expansion carries running costs. */
export function currentMonthlyRent(state: GameState): number {
  const hq =
    MONTHLY_RENT + RENT_PER_EXPANSION * (state.warehouse.expansions + state.warehouse.officeExpansions);
  let branch = 0;
  for (const s of BRANCH_ORDER) {
    const wh = state.branches?.[s];
    if (wh) branch += BRANCH_RENT + RENT_PER_EXPANSION * wh.expansions;
  }
  return hq + branch;
}

export function hallExpansionFrontier(state: GameState, site: SiteId = 'hq'): ExpansionBlock[] {
  return expansionFrontier(state, 'hall', site);
}
export function officeExpansionFrontier(state: GameState): ExpansionBlock[] {
  return expansionFrontier(state, 'office'); // Büro gibt es nur am Hauptlager
}

/** Whether `block` is one of the currently offered frontier blocks. Shared by
 * the build actions so overlay, click handling and the mutation agree. */
export function isFrontierBlock(
  state: GameState,
  zone: 'hall' | 'office',
  block: ExpansionBlock,
  site: SiteId = 'hq',
): boolean {
  if (block.length !== 4) return false;
  const key = block
    .map((c) => cellKey(c.gx, c.gy))
    .sort()
    .join('|');
  return expansionFrontier(state, zone, site).some(
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

/** Regional-KAMs (Konzern, Regionalbüro): jeder betreut bis zu REGIONAL_KAM_LARGE_SLOTS
 * GROSSKUNDEN (Landeskunden). Eigener Kapazitäts-Topf, getrennt vom zentralen Slot-System
 * — Großkunden werden bewusst aus der Einzel-Standort-Sicht herausgenommen und hier
 * geführt. Fehlt ein Regional-KAM, gibt es keine Großkunden-Kapazität (harte Hürde). */
export interface RegionalKamInfo { id: string; name: string; used: number; free: number }
export function regionalKams(state: GameState): RegionalKamInfo[] {
  return state.employees
    .filter((e) => e.role === 'regionalkam')
    .map((e) => {
      const used = state.customers.filter((c) => c.active && c.managerId === e.id).length;
      return { id: e.id, name: e.name, used, free: Math.max(0, REGIONAL_KAM_LARGE_SLOTS - used) };
    });
}
/** Freie Großkunden-Plätze über alle Regional-KAMs. */
export function regionalKamFreeLarge(state: GameState): number {
  return regionalKams(state).reduce((s, k) => s + k.free, 0);
}
/** Der Regional-KAM, der einen neuen Großkunden übernimmt (fullest-fitting, wie zentral). */
function bestRegionalKamFor(state: GameState): Pick<ManagerInfo, 'id' | 'name' | 'isChef'> | null {
  const fitting = regionalKams(state).filter((k) => k.free >= 1);
  if (fitting.length === 0) return null;
  const best = fitting.reduce((a, b) => (b.free < a.free ? b : a));
  return { id: best.id, name: best.name, isChef: false };
}

/** The manager who should take a new customer of `type`: for small/medium the
 * central managers are filled SEQUENTIALLY — the most-utilised manager that still
 * fits gets it (one book is topped up completely before the next starts). GROSSKUNDEN
 * gehen NICHT ins zentrale Slot-System, sondern an einen Regional-KAM (Regionalbüro).
 * Null when NO single manager/KAM has room — pooled leftovers don't count. */
export function bestManagerFor(state: GameState, type: CustomerType): Pick<ManagerInfo, 'id' | 'name' | 'isChef'> | null {
  if (type === 'large') return bestRegionalKamFor(state);
  const fitting = managers(state).filter((m) => m.free >= SLOT_COST[type]);
  if (fitting.length === 0) return null;
  return fitting.reduce((a, b) => (b.free < a.free ? b : a));
}

/** How many MORE customers of `type` could be taken right now. Small/medium honor
 * the per-manager central slot check (a fragmented 3+3 yields 0 for their cost);
 * large customers count the separate Regional-KAM capacity. */
export function freeCapacity(state: GameState, type: CustomerType): number {
  if (type === 'large') return regionalKamFreeLarge(state);
  return managers(state).reduce((s, m) => s + Math.floor(m.free / SLOT_COST[type]), 0);
}

/** True once the company employs at least one Einkäufer (unlocks auto-restock). */
export function hasEinkaeufer(state: GameState): boolean {
  return state.employees.some((e) => e.role === 'einkaeufer');
}

/** Wie viele Produktgruppen die Einkäufer zusammen betreuen können. */
export function buyerCapacity(state: GameState): number {
  return (
    state.employees.filter((e) => e.role === 'einkaeufer').length * BUYER_PRODUCT_CAPACITY
  );
}
/** Die betreuten Produktgruppen — in Listungs-Reihenfolge (die ältesten zuerst). */
export function buyerCoveredGroups(state: GameState): ProductId[] {
  const groups: ProductId[] = [];
  for (const p of state.products) if (!groups.includes(p.groupId)) groups.push(p.groupId);
  return groups.slice(0, buyerCapacity(state));
}
/** Die betreuten Artikel (= alle Artikel der betreuten Gruppen). Nur diese werden
 * automatisch bestellt und bei Preiserhöhungen verhandelt. */
export function buyerCoveredProducts(state: GameState): ArticleId[] {
  const covered = new Set(buyerCoveredGroups(state));
  return state.products.filter((p) => covered.has(p.groupId)).map((p) => p.id);
}
export function isBuyerCovered(state: GameState, articleId: ArticleId): boolean {
  return buyerCoveredGroups(state).includes(groupOfArticle(articleId)!);
}
/** Unbetreute Gruppen (Sortiment breiter als die Einkäufer-Kapazität). */
export function buyerUncoveredProducts(state: GameState): ProductId[] {
  const groups: ProductId[] = [];
  for (const p of state.products) if (!groups.includes(p.groupId)) groups.push(p.groupId);
  return groups.slice(buyerCapacity(state));
}

/** Contracted weekly demand for a product = sum of active customers' line volumes,
 * scaled by the company strategy (Mengen-Discounter orders more, Frische-Spezialist
 * a touch less). Applied at this single source so the cockpit, the order outlook
 * and the Einkäufer all see the same figure. */
export function weeklyDemand(state: GameState, articleId: ArticleId, site?: SiteId): number {
  let sum = 0;
  for (const c of state.customers) {
    if (!c.active) continue;
    if (site && siteOfCustomer(c) !== site) continue;
    for (const l of c.lines) if (l.productId === articleId) sum += l.volume;
  }
  return Math.round(sum * strategyDemandFactor(state));
}

/** Total contracted units per week across all products (what the crew must
 * handle: prepare for pickup AND put away when delivered). */
export function totalWeeklyDemand(state: GameState): number {
  return state.products.reduce((s, p) => s + weeklyDemand(state, p.id), 0);
}

// --- Equipment & strategy modifiers (Pakete 2 & 4) --------------------------
// Live multipliers applied to the core formulas so an upgrade or strategy shift
// takes effect everywhere at once (including the cockpit) with no stored state
// to migrate.

/** Owned count (per-worker devices) or level (facility upgrades) of a piece of
 * equipment (0 if none). */
export function equipmentLevel(state: GameState, id: EquipmentId): number {
  return state.equipment?.[id] ?? 0;
}

/** Anzahl Fahrzeuge einer Fuhrpark-Klasse (0 ohne). */
export function fleetCount(state: GameState, id: VehicleId): number {
  return state.fleet?.[id] ?? 0;
}
/** Gesamtzahl der Fahrzeuge im Fuhrpark. */
export function fleetSize(state: GameState): number {
  return FLEET_VEHICLES.reduce((s, v) => s + fleetCount(state, v.id), 0);
}
/** Günstige Transfer-Kapazität des Fuhrparks in Paletten je Fahrt (Summe aller
 * Fahrzeug-Kapazitäten; 0 ohne Fuhrpark). */
export function fleetTransferCapacityPallets(state: GameState): number {
  return FLEET_VEHICLES.reduce((s, v) => s + fleetCount(state, v.id) * v.capacity, 0);
}
/** Laufende Monatskosten des Fuhrparks (Instandhaltung + Treibstoff je Fahrzeug). */
export function fleetMonthlyCost(state: GameState): number {
  return FLEET_VEHICLES.reduce((s, v) => s + fleetCount(state, v.id) * v.monthly, 0);
}
/** Kosten eines Transfers über `pallets` Paletten: bis zur Fuhrpark-Kapazität zum
 * günstigen Eigen-Tarif, der Überlauf zum teuren Fremd-Spediteur-Tarif. Ohne
 * Fuhrpark ist alles Fremd-Tarif (= bisheriges Verhalten). */
export function transferCost(state: GameState, pallets: number): number {
  const own = Math.min(pallets, fleetTransferCapacityPallets(state));
  const ext = Math.max(0, pallets - own);
  return own * TRANSFER_COST_OWN_PER_PALLET + ext * TRANSFER_COST_PER_PALLET;
}

const lagerCount = (state: GameState): number => state.employees.filter((e) => e.role === 'lager').length;

/** Is a forklift free to hand to a worker starting a put-away right now? A device
 * helps exactly one active user, so availability = owned − currently in use. */
export function forkliftAvailable(state: GameState): boolean {
  const inUse = state.employees.filter((e) => e.task?.kind === 'putaway' && e.task.usesForklift).length;
  return inUse < equipmentLevel(state, 'forklift');
}
/** Is a picking cart free for a worker starting a prep right now? */
export function cartAvailable(state: GameState): boolean {
  const inUse = state.employees.filter((e) => e.task?.kind === 'prep' && e.task.usesCart).length;
  return inUse < equipmentLevel(state, 'packstation');
}

/** Blended prep hours per unit for the cockpit ESTIMATE: the average across the
 * crew, weighting how many carts you own against how many workers could prep at
 * once (limited by tables). Actual per-task timing is binary (has a cart or not,
 * see tryPrepareOrder) — this is only the aggregate capacity view. */
export function blendedPrepHours(state: GameState): number {
  const prepCrew = Math.max(1, Math.min(lagerCount(state), state.warehouse.tables.length));
  const frac = Math.min(equipmentLevel(state, 'packstation'), prepCrew) / prepCrew;
  return PREP_HOURS_PER_UNIT * (1 - PACKSTATION_PREP_SPEED * frac);
}
/** Blended put-away hours per unit for the cockpit estimate (forklifts vs crew). */
export function blendedPutawayHours(state: GameState): number {
  const crew = Math.max(1, lagerCount(state));
  const frac = Math.min(equipmentLevel(state, 'forklift'), crew) / crew;
  return PUTAWAY_HOURS_PER_UNIT * (1 - FORKLIFT_PUTAWAY_SPEED * frac);
}
/** Logistics cost per pallet for customer pickups — a bigger eigener Fuhrpark
 * (mehr Gesamtkapazität) senkt die Abholkosten, gedeckelt (max. 60 % Ersparnis). */
export function truckCostPerPallet(state: GameState): number {
  const save = Math.max(PICKUP_SAVE_FLOOR, 1 - fleetTransferCapacityPallets(state) * PICKUP_SAVE_PER_CAPACITY);
  return Math.round(state.truck.costPerPallet * save);
}
/** Effective shelf life for a product's fresh batches: cooling extends it, the
 * Frische-Spezialist strategy shortens it. Kühlpflichtige Gruppen (Käse, Tiefkühl,
 * Feinkost) verderben stark beschleunigt, solange es KEINE Kühlregale gibt
 * (❄️ Kühlbereich im Bau-Modus + Regal darauf) — die Ware steht dann warm. */
export function spoilageDaysFor(state: GameState, product: Product, site: SiteId = 'hq'): number {
  const cooling = 1 + COOLING_SHELFLIFE_BONUS * equipmentLevel(state, 'cooling');
  const strat = getStrategyDef(state.strategy).spoilageFactor;
  const needsCold = !!getProductDef(product.groupId).requiresCooling;
  const coldPenalty = needsCold && coldShelfCapacity(state, site) === 0 ? NO_COOLING_SPOILAGE_MULT : 1;
  return Math.max(1, Math.round(product.spoilageDays * cooling * strat * coldPenalty));
}

/** Kühlpflichtiges Produkt im Sortiment, aber kein Kühlregal (Kühlbereich-Kachel
 * mit Regal darauf) → Warnung: die Ware kann nirgends kalt lagern. */
export function coldChainGap(state: GameState): boolean {
  if (coldShelfCapacity(state) > 0) return false;
  return state.products.some((p) => getProductDef(p.groupId).requiresCooling);
}

/** Strategy multiplier on the price customers will pay in NEW deals. */
export function strategyPriceFactor(state: GameState): number {
  return getStrategyDef(state.strategy).priceFactor;
}
/** Strategy multiplier on ordered volumes (demand). */
export function strategyDemandFactor(state: GameState): number {
  return getStrategyDef(state.strategy).demandFactor;
}

// --- Supplier pricing (Paket 3) ---------------------------------------------

/** The per-unit purchase price in force for a product: an active supply contract
 * price if one is running, otherwise the spot price. */
export function supplierUnitPrice(state: GameState, productId: ArticleId): number {
  const sp = state.supplier.products.find((s) => s.productId === productId);
  if (!sp) return 0;
  if (sp.contract && sp.contract.untilWeek > weekOf(state.totalDays)) return sp.contract.price;
  return sp.price;
}
/** Whether a product currently has a running supply contract. */
export function hasActiveContract(state: GameState, productId: ArticleId): boolean {
  const sp = state.supplier.products.find((s) => s.productId === productId);
  return !!sp?.contract && sp.contract.untilWeek > weekOf(state.totalDays);
}

// --- Operations cockpit (Betriebs-Status) -----------------------------------
// Forward-looking utilisation gauges so the player can SEE a bottleneck coming
// (staff overload, shelves filling, slots running out, thin liquidity) instead
// of hitting it blind. Everything is derived from live state — no new fields.

/** Clock hours a single worker is on shift per week (6–20, seven days). */
const WORK_HOURS_PER_WEEK = (WORK_END_HOUR - WORK_START_HOUR) * 7;

export type OpsLevel = 'ok' | 'warn' | 'crit';

export interface OpsGauge {
  key: 'labor' | 'storage' | 'slots' | 'cash';
  label: string;
  icon: string;
  /** Fill fraction for the bar (0..1, clamped for display). */
  fill: number;
  /** Headline value, e.g. "82 %" or "156 k€". */
  value: string;
  level: OpsLevel;
  /** One-line context under the value. */
  detail: string;
  /** Actionable hint, present when level is warn/crit. */
  hint?: string;
  /** Modal the chip jumps to when clicked. */
  target: 'employees' | 'build' | 'customers' | 'finance';
}

export interface OpsStatus {
  gauges: OpsGauge[];
  worst: OpsLevel;
  /** Aggregated actionable hints (warn/crit gauges), worst first. */
  alerts: { level: OpsLevel; text: string }[];
}

const worseLevel = (a: OpsLevel, b: OpsLevel): OpsLevel =>
  a === 'crit' || b === 'crit' ? 'crit' : a === 'warn' || b === 'warn' ? 'warn' : 'ok';

/** Live operations dashboard: labour load, storage, customer slots, liquidity. */
export function opsStatus(state: GameState): OpsStatus {
  const gauges: OpsGauge[] = [];

  // 1) Personal (Lager) — weekly handling hours demanded vs. crew hours supplied.
  const weeklyUnits = totalWeeklyDemand(state);
  const handlingHours = weeklyUnits * (blendedPrepHours(state) + blendedPutawayHours(state));
  const lager = state.employees.filter((e) => e.role === 'lager');
  const laborHours = lager.reduce((s, e) => s + WORK_HOURS_PER_WEEK / skillSpeedFactor(e.skill), 0);
  const laborPct = laborHours > 0 ? handlingHours / laborHours : weeklyUnits > 0 ? Infinity : 0;
  const laborLevel: OpsLevel = laborPct >= 0.95 ? 'crit' : laborPct >= 0.75 ? 'warn' : 'ok';
  const tables = state.warehouse.tables.length;
  const tableShort = lager.length > tables;
  gauges.push({
    key: 'labor',
    label: 'Personal',
    icon: '👷',
    fill: Math.min(1, laborPct),
    value: Number.isFinite(laborPct) ? `${Math.round(laborPct * 100)} %` : '∞',
    level: tableShort && laborLevel === 'ok' ? 'warn' : laborLevel,
    detail: `${lager.length} Lagerkräfte · ${Math.round(handlingHours)}/${Math.round(laborHours)} h/Wo`,
    hint:
      laborLevel === 'crit'
        ? 'Team überlastet – Aufträge stauen sich. Jetzt einen Lagermitarbeiter einstellen (oder schulen).'
        : laborLevel === 'warn'
          ? 'Bald einen Lagermitarbeiter einstellen oder das Team schulen.'
          : tableShort
            ? `Nur ${tables} Herricht-Tische für ${lager.length} Kräfte – ein paar können nicht gleichzeitig herrichten.`
            : undefined,
    target: 'employees',
  });

  // 2) Lagerplatz — shelf units used vs. capacity.
  const used = shelfUsed(state);
  const cap = shelfCapacity(state);
  const storagePct = cap > 0 ? used / cap : 1;
  const storageLevel: OpsLevel = storagePct >= 0.92 ? 'crit' : storagePct >= 0.8 ? 'warn' : 'ok';
  gauges.push({
    key: 'storage',
    label: 'Lagerplatz',
    icon: '📦',
    fill: Math.min(1, storagePct),
    value: `${Math.round(storagePct * 100)} %`,
    level: storageLevel,
    detail: `${used}/${cap} Einheiten belegt`,
    hint:
      storageLevel === 'crit'
        ? 'Lager fast voll – bald blockiert das Einlagern. Ein Regal im Bau-Modus ergänzen.'
        : storageLevel === 'warn'
          ? 'Lager füllt sich – demnächst ein Regal bauen.'
          : undefined,
    target: 'build',
  });

  // 3) Kunden-Slots — occupied vs. total across all managers.
  const ms = managers(state);
  const slotsUsed = ms.reduce((s, m) => s + m.used, 0);
  const slotsTotal = ms.length * MANAGER_SLOTS;
  const slotPct = slotsTotal > 0 ? slotsUsed / slotsTotal : 1;
  const slotLevel: OpsLevel = slotsUsed >= slotsTotal ? 'crit' : slotPct >= 0.85 ? 'warn' : 'ok';
  gauges.push({
    key: 'slots',
    label: 'Kunden-Slots',
    icon: '🤝',
    fill: Math.min(1, slotPct),
    value: `${slotsUsed}/${slotsTotal}`,
    level: slotLevel,
    detail: `${ms.length} Manager · ${slotsTotal - slotsUsed} Slots frei`,
    hint:
      slotLevel === 'crit'
        ? 'Keine Kunden-Slots frei – ein KAM bringt mehr Kapazität für neue Kunden.'
        : slotLevel === 'warn'
          ? 'Wenige Slots frei – für weiteres Wachstum bald einen KAM einstellen.'
          : undefined,
    target: 'customers',
  });

  // 4) Liquidität — reserves (cash + free credit) vs. weekly fixed cost.
  const payroll = state.employees.reduce((s, e) => s + e.salary, 0);
  const weeklyFixed = payroll + currentMonthlyRent(state) / WEEKS_PER_MONTH;
  const liquidity = state.cash + availableCredit(state);
  const weeksCovered = weeklyFixed > 0 ? liquidity / weeklyFixed : Infinity;
  const cashLevel: OpsLevel = liquidity < 0 || weeksCovered < 2 ? 'crit' : weeksCovered < 4 ? 'warn' : 'ok';
  gauges.push({
    key: 'cash',
    label: 'Liquidität',
    icon: '💰',
    // Bar fills as the reserve shrinks toward one month of fixed cost.
    fill: Math.min(1, weeklyFixed > 0 ? (weeklyFixed * 4) / Math.max(liquidity, 1) : 0),
    value: euro(liquidity),
    level: cashLevel,
    detail: `Fixkosten ${euro(Math.round(weeklyFixed))}/Wo · Reserve deckt ${
      Number.isFinite(weeksCovered) ? Math.floor(weeksCovered) : '∞'
    } Wo`,
    hint:
      cashLevel === 'crit'
        ? 'Reserve dünn – Ausgaben bremsen oder Umsatz sichern, sonst droht die Insolvenz.'
        : cashLevel === 'warn'
          ? 'Reserve unter einem Monat Fixkosten – neue Investitionen mit Bedacht.'
          : undefined,
    target: 'finance',
  });

  const worst = gauges.reduce<OpsLevel>((w, g) => worseLevel(w, g.level), 'ok');
  const alerts = gauges
    .filter((g) => g.hint && g.level !== 'ok')
    .map((g) => ({ level: g.level, text: g.hint! }))
    .sort((a, b) => (a.level === 'crit' ? -1 : b.level === 'crit' ? 1 : 0));

  return { gauges, worst, alerts };
}

/** Best (highest) skill among warehouse workers, or 0 if none. */
function bestNegotiationSkill(state: GameState): number {
  const buyers = state.employees.filter((e) => e.role === 'einkaeufer');
  if (buyers.length === 0) return 0;
  return Math.max(...buyers.map((b) => b.skill));
}

// --- Demand / seasonal ------------------------------------------------------

export function seasonalMultiplier(id: ArticleId, week: number): number {
  const group = (groupOfArticle(id) ?? id) as ProductId;
  return SEASONAL_TREND[group][quarterOf(week)];
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
export function skillSpeedFactor(skill: number): number {
  return clamp(1 - SKILL_SPEED_PER_POINT * (skill - SKILL_SPEED_BASELINE), 0.3, 2);
}

/** Game-days to prepare an order of `quantity` units at `skill`. Quantity-linear
 * (0.3 h/unit at the baseline skill, reduced by the Kommissionier-Station), longer
 * for multi-article customer bundles. */
/** Units a worker can carry per trip shelf→table (doubled with a picking cart). */
export function carryCapacity(usesCart: boolean): number {
  return usesCart ? CARRY_CAPACITY_CART : CARRY_CAPACITY;
}
/** Carry trips an order of `quantity` needs — ceil(qty / carry capacity). */
export function carryLoads(quantity: number, usesCart: boolean): number {
  return Math.max(1, Math.ceil(quantity / carryCapacity(usesCart)));
}

function prepDaysFor(quantity: number, skill: number, bundleSize = 1, usesCart = false): number {
  const bundleFactor = 1 + Math.max(0, bundleSize - 1) * PER_ARTICLE_PREP_FACTOR;
  const perUnit = PREP_HOURS_PER_UNIT * (usesCart ? 1 - PACKSTATION_PREP_SPEED : 1);
  const packDays = ((quantity * perUnit) / 24) * skillSpeedFactor(skill) * bundleFactor;
  // Physical carrying: goods are fetched from the shelf in loads. Only trips
  // BEYOND the first cost extra walking time, so normal small orders stay at
  // baseline speed while orders exceeding the carry capacity pay for the extra
  // runs. A cart doubles capacity → fewer extra trips for big orders.
  const walkDays = Math.max(0, carryLoads(quantity, usesCart) - 1) * CARRY_TRIP_DAYS;
  return packDays + walkDays;
}

/**
 * Pick the best free Lager worker for a task, honouring BOTH instructions:
 * task-type priority first (prefers this kind > no preference > prefers the other
 * kind), then product priority (prefers this product > none > another). `strictTask`
 * (used by the first auto-assign pass) restricts to workers who prefer exactly
 * this task type, so specialists get their own work before anyone falls back.
 */
function pickLagerWorker(
  state: GameState,
  kind: 'prep' | 'putaway',
  articleId: ArticleId,
  strictTask = false,
  site: SiteId = 'hq',
): { id: string } | undefined {
  let free = state.employees.filter(
    (e) => e.role === 'lager' && !e.task && siteOfEmployee(e) === site,
  );
  if (strictTask) free = free.filter((e) => e.preferredTask === kind);
  if (free.length === 0) return undefined;
  const taskScore = (e: { preferredTask?: 'prep' | 'putaway' }) =>
    e.preferredTask === kind ? 0 : !e.preferredTask ? 1 : 2;
  const prodScore = (e: { preferredProduct?: ArticleId }) =>
    e.preferredProduct === articleId ? 0 : !e.preferredProduct ? 1 : 2;
  return free
    .slice()
    .sort((a, b) => taskScore(a) - taskScore(b) || prodScore(a) - prodScore(b))[0];
}

/** Workers currently preparing AT THIS SITE (each occupies one prep table). */
function preppingCount(state: GameState, site: SiteId = 'hq'): number {
  return state.employees.filter((e) => e.task?.kind === 'prep' && siteOfEmployee(e) === site).length;
}
/** Free prep tables at a site = tables not currently in use. */
function freeTables(state: GameState, site: SiteId = 'hq'): number {
  return warehouseOf(state, site).tables.length - preppingCount(state, site);
}

/**
 * Try to start preparing an order: needs enough SHELF stock, a free prep table
 * and a free worker. Returns a reason string on failure, or null on success.
 */
export function tryPrepareOrder(
  state: GameState,
  order: Order,
  opts?: { strictTask?: boolean },
): string | null {
  if (order.status !== 'pending') return 'Auftrag ist nicht offen.';
  const product = getProduct(state, order.productId);
  // Standort des Kunden: Bestand, Tisch und Personal zählen NUR dort.
  const site = siteOfOrder(state, order);
  if (shelfStock(product, site) < order.quantity) return 'Nicht genug Regal-Bestand.';
  if (freeTables(state, site) <= 0) return 'Kein freier Vorbereitungstisch.';
  // Task- and product-priority aware worker pick (see pickLagerWorker).
  const pick = pickLagerWorker(state, 'prep', order.productId, opts?.strictTask, site);
  const worker = pick && state.employees.find((e) => e.id === pick.id);
  if (!worker) return 'Kein freier Lagermitarbeiter.';

  deductInventory(product, order.quantity, site);
  const paletteId = uid('pal');
  state.palettes.push({
    id: paletteId,
    orderId: order.id,
    customerId: order.customerId,
    productId: order.productId,
    quantity: order.quantity,
    status: 'preparing',
    siteId: site,
  });
  order.paletteId = paletteId;
  order.status = 'preparing';
  // More articles in the same customer order => longer prep per palette.
  const bundleSize = state.orders.filter(
    (o) => o.customerId === order.customerId && o.status !== 'delivered',
  ).length;
  // Hand this worker a picking cart if one is free (Paket 2): faster + rendered.
  const usesCart = cartAvailable(state);
  let days = prepDaysFor(order.quantity, worker.skill, bundleSize, usesCart);
  // Tutorial BEAT 0: the very first Herrichtung (the starter order only) is
  // near-instant so the first reward comes fast — the palette visibly appears
  // instead of a long wait. Other orders prepared early keep normal timing.
  if (state.tutorial?.active && state.tutorial.step <= STEP.HERRICHTEN && order.id === TUTORIAL_ORDER_ID) {
    days = TUTORIAL_FIRST_PREP_DAYS;
  }
  // Occupy the lowest prep table not held by another prep task — exclusive by
  // construction (the freeTables gate above guarantees one is available).
  const usedTables = new Set(
    state.employees.map((e) =>
      e.task?.kind === 'prep' && siteOfEmployee(e) === site ? (e.task.tableIndex ?? -1) : -1,
    ),
  );
  let tableIndex = 0;
  while (usedTables.has(tableIndex)) tableIndex += 1;
  const loads = carryLoads(order.quantity, usesCart);
  worker.task = { kind: 'prep', orderId: order.id, tableIndex, usesCart, loads, totalDays: days, remainingDays: days };
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
        // Put-away done: the pallet (carried in transit) lands on a shelf at
        // the worker's own site.
        const product = getProduct(state, task.productId);
        product.batches.push({
          id: uid('batch'),
          productId: task.productId,
          quantity: task.quantity,
          expiryDay: task.expiryDay,
          location: 'shelf',
          siteId: siteOfEmployee(emp),
        });
      }
    }
  }
}

/** Assign one idle worker to put a pallet away (inbound → shelf). The pallet
 * leaves the inbound zone immediately (carried in transit) so two workers can't
 * grab the same goods. Returns true if a task was started. */
function assignPutaway(
  state: GameState,
  product: Product,
  opts?: { strictTask?: boolean },
  site: SiteId = 'hq',
): boolean {
  // Task- and product-priority aware worker pick (see pickLagerWorker).
  const pick = pickLagerWorker(state, 'putaway', product.id, opts?.strictTask, site);
  const worker = pick && state.employees.find((e) => e.id === pick.id);
  if (!worker) return false;
  // Zonen-Regel: kühlpflichtige Ware passt nur in freie KÜHLregale, alle andere
  // nur in freie normale Regale (shelfFreeFor) — jeweils AN DIESEM Standort.
  const qty = Math.min(PALETTE_SIZE, inboundStock(product, site), shelfFreeFor(state, product.id, site));
  if (qty <= 0) return false;

  // Take qty from inbound (FIFO by expiry) and remember the earliest expiry.
  let remaining = qty;
  let expiry = Infinity;
  const inbound = product.batches
    .filter((b) => b.location === 'inbound' && (b.siteId ?? 'hq') === site)
    .sort((a, b) => a.expiryDay - b.expiryDay);
  for (const b of inbound) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    b.quantity -= take;
    remaining -= take;
    expiry = Math.min(expiry, b.expiryDay);
  }
  product.batches = product.batches.filter((b) => b.quantity > 0);

  // Hand this worker a forklift if one is free (Paket 2): faster + rendered.
  const usesForklift = forkliftAvailable(state);
  const perUnit = PUTAWAY_HOURS_PER_UNIT * (usesForklift ? 1 - FORKLIFT_PUTAWAY_SPEED : 1);
  const days = ((qty * perUnit) / 24) * skillSpeedFactor(worker.skill);
  // Work at the lowest inbound slot no other putaway task occupies (falls back
  // to round-robin only if there are more putaway workers than slots).
  const usedSlots = new Set(
    state.employees.map((e) =>
      e.task?.kind === 'putaway' && siteOfEmployee(e) === site ? (e.task.slotIndex ?? -1) : -1,
    ),
  );
  let slotIndex = 0;
  while (usedSlots.has(slotIndex) && slotIndex < warehouseOf(state, site).inboundSlots - 1) slotIndex += 1;
  worker.task = {
    kind: 'putaway',
    productId: product.id,
    quantity: qty,
    expiryDay: expiry === Infinity ? state.totalDays + spoilageDaysFor(state, product, site) : expiry,
    slotIndex,
    usesForklift,
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
        siteId: siteOfEmployee(emp),
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
      siteId: siteOfEmployee(emp),
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
  const idleCount = () => state.employees.filter((e) => e.role === 'lager' && !e.task).length;
  if (idleCount() === 0) return;

  // One assignment round: prep due orders first (revenue, needs a free table),
  // then put remaining idle workers on put-away. `strict` restricts each step to
  // workers who prioritise that task type (used by the first pass).
  // Jeder Standort arbeitet mit SEINEN Kräften, SEINEN Tischen und SEINEM
  // Bestand — die Zuweisungslogik läuft je Standort identisch.
  const round = (strict: boolean, site: SiteId) => {
    const idleAt = () =>
      state.employees.filter((e) => e.role === 'lager' && !e.task && siteOfEmployee(e) === site)
        .length;
    let idle = idleAt();
    if (idle === 0) return;
    // Serve orders in the SAME order the Aufträge-Panel shows them: late first,
    // then earliest due week, then oldest. This makes the visible list the actual
    // service order instead of a hidden due-week-only rule.
    const pending = state.orders
      .filter((o) => o.status === 'pending' && siteOfOrder(state, o) === site)
      .sort(
        (a, b) =>
          Number(b.late) - Number(a.late) ||
          a.dueWeek - b.dueWeek ||
          a.createdDay - b.createdDay,
      );
    // Per-product stock claim: a higher-priority order that is still short on
    // shelf stock RESERVES what's there, so a stream of smaller same-product
    // orders can no longer drain the stock a big order is waiting to accumulate.
    // The freed workers fall through to put-away below → the reserved order fills
    // up faster. Reservation is per product (unrelated products stay servable) and
    // only for orders the warehouse could actually hold (no permanent dead-block).
    const avail: Record<string, number> = {};
    for (const p of state.products) avail[p.id] = shelfStock(p, site);
    for (const order of pending) {
      if (idle === 0 || freeTables(state, site) <= 0) break;
      const have = avail[order.productId] ?? 0;
      if (have < order.quantity) {
        // Reservation nur, wenn das Lager den Auftrag überhaupt fassen KÖNNTE —
        // für Kühlware zählt dabei nur die Kühlregal-Kapazität.
        if (order.quantity <= shelfCapacityFor(state, order.productId, site)) avail[order.productId] = 0;
        continue;
      }
      if (tryPrepareOrder(state, order, { strictTask: strict }) === null) {
        avail[order.productId] = have - order.quantity;
        idle -= 1;
      }
    }
    while (idle > 0) {
      // Nur Produkte einlagern, die in IHRER Zone noch Platz haben (Kühlware →
      // Kühlregale, sonst normale Regale) — Kühlware im Wareneingang blockiert
      // so nie das Einlagern normaler Ware und umgekehrt.
      const free = state.employees.filter(
        (e) => e.role === 'lager' && !e.task && siteOfEmployee(e) === site,
      );
      const fits = (p: Product) => inboundStock(p, site) > 0 && shelfFreeFor(state, p.id, site) > 0;
      const product =
        state.products.find((p) => fits(p) && free.some((w) => w.preferredProduct === p.id)) ??
        state.products.find(fits);
      if (!product || !assignPutaway(state, product, { strictTask: strict }, site)) break;
      idle -= 1;
    }
  };

  // Pass 1: task specialists get their preferred work first (Einlagern-only crews
  // shelve, Herrichten-only crews pack). Pass 2: everyone still idle fills in on
  // whatever is left — so a specialist never sits idle when the other job waits.
  for (const site of activeSites(state)) {
    round(true, site);
    round(false, site);
  }
}

// --- Customer orders --------------------------------------------------------

function generateCustomerOrder(state: GameState, customer: Customer, line: CustomerLine): void {
  const week = weekOf(state.totalDays);
  const seasonal = seasonalMultiplier(line.productId, week);
  const discountUplift = 1 + demandUpliftFromDiscount(customer.activeDiscount);
  const jitter = randRange(0.9, 1.1);
  const qty = Math.max(
    1,
    Math.round(line.volume * seasonal * discountUplift * jitter * strategyDemandFactor(state)),
  );
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

    // Logistics cost per palette (lowered by the eigener-LKW upgrade).
    const palletCost = truckCostPerPallet(state);
    spend(state, palletCost);
    state.weekAcc.logistics += palletCost;

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
    notify(state, `🚚 Laster abgefahren – ${loaded} Palette(n) geladen (Kosten ${loaded * truckCostPerPallet(state)}€).`, 'success', { channel: 'log' });
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
export function releaseCustomerOrders(state: GameState, customerId: string): void {
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

    const site = po.siteId ?? 'hq';
    let room = inboundFree(state, site);
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
        expiryDay: state.totalDays + spoilageDaysFor(state, product, site),
        location: 'inbound',
        siteId: site,
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

/** Angekommene Standort-Transfers entladen: die Ware landet im Wareneingang des
 * Ziel-Standorts (Original-Haltbarkeit bleibt). Ist der Wareneingang voll,
 * wartet der LKW und versucht es beim nächsten Tick erneut. */
function processTransfers(state: GameState): void {
  if (!state.transfers || state.transfers.length === 0) return;
  const remaining: Transfer[] = [];
  for (const t of state.transfers) {
    if (t.arrivalDay > state.totalDays) {
      remaining.push(t);
      continue;
    }
    const room = inboundFree(state, t.toSite);
    if (room <= 0) {
      remaining.push(t); // Wareneingang voll – LKW wartet
      continue;
    }
    const take = Math.min(t.quantity, room);
    const product = getProduct(state, t.productId);
    product.batches.push({
      id: uid('batch'),
      productId: t.productId,
      quantity: take,
      expiryDay: t.expiryDay,
      location: 'inbound',
      siteId: t.toSite,
    });
    t.quantity -= take;
    if (t.quantity > 0) remaining.push(t);
    else {
      notify(
        state,
        `🚚 Transfer angekommen: ${take}× ${product.emoji} ${product.name} im Wareneingang ${SITE_META[t.toSite].short}.`,
        'success',
        { channel: 'log' },
      );
    }
  }
  state.transfers = remaining;
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
  items: { productId: ArticleId; quantity: number }[],
  opts?: { priceMultiplier?: number; leadDays?: number; siteId?: SiteId },
): PurchaseOrder | null {
  const site = opts?.siteId ?? 'hq';
  const mult = opts?.priceMultiplier ?? 1;
  let total = 0;
  const deliverable = items.filter((i) => i.quantity > 0 && supplierDeliversTo(i.productId, site));
  // Mengenrabatt (C3): auf die aggregierte GRUPPEN-Menge dieser Bestellung, nicht
  // je Einzel-Artikel. Seit dem Artikel-Modell splittet sich die Nachfrage einer
  // Gruppe auf mehrere SKUs — ein Rabatt je Artikel würde durch den Split unter die
  // Staffelschwellen fallen. Der Distributor verhandelt den Bulk-Satz aber auf die
  // ganze KATEGORIE, die er beim Lieferanten abnimmt.
  const groupQty = new Map<ProductId, number>();
  for (const i of deliverable) {
    const g = groupOfArticle(i.productId)!;
    groupQty.set(g, (groupQty.get(g) ?? 0) + i.quantity);
  }
  const poItems = deliverable.map((i) => {
    // Contract price if one is running, else spot; then the bulk discount for the
    // whole category ordered this week.
    const base = supplierUnitPrice(state, i.productId);
    const disc = volumeDiscount(groupQty.get(groupOfArticle(i.productId)!) ?? i.quantity);
    const unit = Math.round(base * (1 - disc) * mult * 100) / 100;
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
    siteId: site,
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
export function orderOutlook(state: GameState, productId: ArticleId, site: SiteId = 'hq'): OrderOutlook {
  const product = getProduct(state, productId);
  const stock = shelfStock(product, site) + inboundStock(product, site);
  const incoming = incomingPO(state, productId, site);
  const week = weekOf(state.totalDays);
  const fixDemand = Math.round(
    weeklyDemand(state, productId, site) * seasonalMultiplier(productId, week + 1),
  );
  const backlog = state.orders
    .filter(
      (o) =>
        o.productId === productId && o.status === 'pending' && siteOfOrder(state, o) === site,
    )
    .reduce((s, o) => s + o.quantity, 0);
  const expiring = expiringWithinDays(product, state.totalDays, DAYS_PER_WEEK);
  // Rückstand (offene Aufträge) zuerst gegen das VERRECHNEN, was schon da oder im
  // Zulauf ist. Der Rest wird NICHT jede Woche komplett neu gekauft: die letzte
  // Bestellung für diesen Rückstand rollt bereits durchs Lager (im Wochentakt ist
  // sie bis zum Bestellfenster geliefert, `incoming` also ≈0), und mehr als der
  // Durchsatz verschickt, kann ohnehin nicht raus. Ein ungedeckelter Rückstand
  // erzeugt sonst Monster-Bestellungen → Verderb + Kassen-Schock (Konkurs-Ursache).
  // Deshalb den Nachhol-Anteil je Woche auf BACKLOG_CATCHUP_WEEKS × Wochenbedarf deckeln.
  const covered = stock + incoming;
  const uncoveredBacklog = Math.max(0, backlog - covered);
  const backlogCatchup = Math.min(uncoveredBacklog, Math.ceil(fixDemand * BACKLOG_CATCHUP_WEEKS));
  const coverAfterBacklog = Math.max(0, covered - backlog);
  const demandNeed = Math.max(0, fixDemand + expiring - coverAfterBacklog);
  const deficit = Math.max(0, Math.round(backlogCatchup + demandNeed));
  return { fixDemand, backlog, stock, incoming, expiring, deficit };
}

/** Cancel & refund the current week's still-pending PO (used when the player
 * overrides the Einkäufer / re-submits the weekly order). */
function refundCurrentWeekPo(state: GameState, site: SiteId = 'hq'): void {
  const id = state.currentWeekPoBySite[site];
  if (!id) return;
  const idx = state.purchaseOrders.findIndex((p) => p.id === id && p.status === 'pending');
  if (idx >= 0) {
    const po = state.purchaseOrders[idx];
    refund(state, po.totalCost);
    state.weekAcc.purchases -= po.totalCost;
    state.purchaseOrders.splice(idx, 1);
  }
  delete state.currentWeekPoBySite[site];
}

/** Place (or replace) the current week's purchase order in one shot. Any order
 * already placed this week is cancelled & refunded first, so this is idempotent
 * within a week and safe for the [ÜBERSCHREIBEN] override. */
export function commitWeeklyOrder(
  state: GameState,
  items: { productId: ArticleId; quantity: number }[],
  site: SiteId = 'hq',
): PurchaseOrder | null {
  refundCurrentWeekPo(state, site);
  const po = createPurchaseOrderInternal(state, items, { siteId: site });
  if (po) state.currentWeekPoBySite[site] = po.id;
  else delete state.currentWeekPoBySite[site];
  if (site === 'hq') state.pendingOrderWeek = null;
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
  // trimmed to budget. The player can instruct a safety buffer (buyerOrderBuffer,
  // e.g. +5 %) that is ordered ON TOP of the deficit as a cushion against
  // demand spikes/spoilage — self-correcting, since next week's deficit sees the
  // leftover stock.
  const buffer = Math.max(0, state.settings.buyerOrderBuffer ?? 0);
  let budget = state.cash + availableCredit(state);
  const covered = new Set(buyerCoveredProducts(state));
  for (const site of activeSites(state)) {
    const items: { productId: ArticleId; quantity: number }[] = [];
    for (const product of state.products) {
      if (!covered.has(product.id)) continue; // über der Einkäufer-Kapazität → manuell
      if (!supplierDeliversTo(product.id, site)) continue; // Regionalware: nur per Transfer
      const outlook = orderOutlook(state, product.id, site);
      if (outlook.deficit <= 0) continue;
      const unit = supplierUnitPrice(state, product.id);
      if (unit <= 0) continue;
      const target = Math.ceil(outlook.deficit * (1 + buffer));
      const affordable = Math.min(target, Math.floor(budget / unit));
      if (affordable <= 0) continue;
      items.push({ productId: product.id, quantity: affordable });
      budget -= affordable * unit;
    }
    const po = commitWeeklyOrder(state, items, site);
    if (!po) continue;
    const summary = po.items
      .map((i) => `${i.quantity}× ${getProduct(state, i.productId).name}`)
      .join(', ');
    const bufNote = buffer > 0 ? ` (inkl. +${Math.round(buffer * 100)}% Puffer)` : '';
    notify(
      state,
      `✓ Einkäufer deckt ${SITE_META[site].short}${bufNote}: ${summary} (${Math.round(po.totalCost)}€) – Lieferung nächsten Montag.`,
      'success',
    );
  }
  // Kapazitäts-Grenze: unbetreute Gruppen bestellt niemand automatisch. Braucht
  // eine davon Nachschub, öffnet das manuelle Bestellfenster — oder ein weiterer
  // Einkäufer übernimmt (BUYER_PRODUCT_CAPACITY Gruppen pro Kopf).
  const uncovered = buyerUncoveredProducts(state);
  if (uncovered.length > 0) {
    // Eine unbetreute GRUPPE ist „needy", wenn irgendein Artikel darin an einem
    // belieferbaren Standort ein Defizit hat.
    const needy = uncovered.filter((group) =>
      articlesOfGroup(group).some((art) =>
        activeSites(state).some(
          (site) => supplierDeliversTo(art.id, site) && orderOutlook(state, art.id, site).deficit > 0,
        ),
      ),
    );
    if (needy.length > 0) {
      state.pendingOrderWeek = week;
      const names = needy.map((group) => getProductDef(group).name).join(', ');
      notify(
        state,
        `📋 Einkäufer-Kapazität voll (${buyerCapacity(state)} Gruppen): ${names} unbetreut – manuell bestellen oder weiteren Einkäufer einstellen.`,
        'warn',
      );
    }
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
  return PRODUCT_DEFS.filter(
    (d) =>
      d.unlockWeek <= week &&
      !isInAssortment(state, d.id) &&
      !(d.exclusiveSite === 'sued' && !branchOpen(state)),
  ).map((d) => d.id);
}

/** Live article if listed (its VK may have been re-priced by the player),
 * otherwise the catalog economics — inquiries may target listable-but-unlisted
 * articles (Wachstumsmotor A). Beide Formen liefern name/emoji/verkaufspreis. */
function inquiryProductInfo(state: GameState, id: ArticleId) {
  return state.products.find((p) => p.id === id) ?? articleEconomics(id)!;
}

/** Bias new inquiries toward ARTICLES we already sell, so a new customer's first
 * order isn't guaranteed late by the supplier lead time. A slice of demand targets
 * a listable-but-unlisted GROUP (represented by one of its articles) — the market
 * pulling the player toward more breadth (accepting lists the group, see acceptInquiry). */
function pickInquiryProduct(state: GameState, region: SiteId = 'hq'): ArticleId {
  const unlisted = listableUnlistedProducts(state);
  if (unlisted.length > 0 && Math.random() < INQUIRY_UNLISTED_PRODUCT_CHANCE) {
    // Neue Gruppe (Markt-Sog): region-typischer Leit-Artikel; muss erst gelistet
    // & bevorratet werden (Liefer-Verzug wie bisher gewollt).
    return pickArticleForRegion(pick(unlisted), region).id;
  }
  // Sonst: bevorzugt einen bereits VERKAUFTEN Artikel (auf Lager) — so wird ein
  // Neukunde ohne Liefer-Verzug bedient (Artikel-Fragmentierung würde sonst jeden
  // Neukunden garantiert zu spät beliefern). Fallback: irgendein gelisteter Artikel.
  const familiar = [
    ...new Set(state.customers.filter((c) => c.active).flatMap((c) => c.lines.map((l) => l.productId))),
  ];
  if (familiar.length > 0) return pick(familiar);
  return pick(state.products.map((p) => p.id));
}

/** A customer name not already used by an active customer or an open inquiry,
 * so the customer list never shows confusing duplicates. */
export function uniqueCustomerName(state: GameState, type: CustomerType): string {
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
function rollLineVolume(type: CustomerType, id: ArticleId): number {
  const [minV, maxV] = CUSTOMER_VOLUME_RANGE[type];
  // id kann ein Artikel ODER (Tutorial) eine Gruppe sein — auf die Gruppe abbilden.
  const group = (groupOfArticle(id) ?? id) as ProductId;
  return Math.round(randInt(minV, maxV) * PRODUCT_VOLUME_FACTOR[group]);
}

/** Skill-weighted acquisition power of the Vertrieb team (each rep contributes
 * 0.5 + 0.5×Skill/100). Enlarges every tier's market (see typeInquiryChance). */
export function salesAcquisitionPower(state: GameState): number {
  return state.employees
    .filter((e) => e.role === 'sales')
    .reduce((sum, e) => sum + 0.5 + 0.5 * (e.skill / 100), 0);
}

/** Skill-weighted power of the Marketing-Manager team (same 0.5 + 0.5×Skill/100
 * shape as Vertrieb). Beschleunigt den Ruf-Aufbau (siehe runRenownWeek) — mehr
 * Bekanntheit, schneller. */
export function marketingPower(state: GameState): number {
  return state.employees
    .filter((e) => e.role === 'marketing')
    .reduce((sum, e) => sum + 0.5 + 0.5 * (e.skill / 100), 0);
}

// --- Artikel-Sammel-Motor (Phase B4): der Kern-Wachstumsmotor des Artikel-Modells --
// Etablierte, loyale Kunden nehmen mit der Zeit AUTOMATISCH weitere gelistete Artikel
// in ihr Programm auf (bis zu ihrer größen-abhängigen Reichweite). So wächst der
// Umsatz je Kunde über Jahr 1 hinweg — das ist, was den 120k-Checkpoint trägt und
// später (Groß-Kunden, unbegrenzt) Richtung 600k zieht. Kühl-Artikel nur mit Kühl-
// Platz (kein Verderb-Schock), Regional-Artikel nur wenn am Standort belieferbar.

/** Anzahl zusätzlicher Artikel-Linien (über die erste hinaus), die ein Kunde hat. */
function extraArticleCount(cust: Customer): number {
  return Math.max(0, cust.lines.length - 1);
}

function growCustomerArticles(state: GameState, newWeek: number): void {
  if (state.tutorial?.active) return;
  if (newWeek < ARTICLE_DEV_START_WEEK) return;
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (newWeek - (cust.sinceWeek ?? 0) < ARTICLE_DEV_CUSTOMER_AGE) continue;
    if (cust.loyalty < 55) continue; // nur zufriedene Kunden sammeln
    if (extraArticleCount(cust) >= ARTICLE_REACH[cust.type]) continue;
    if (Math.random() >= ARTICLE_DEV_CHANCE[cust.type]) continue;
    const site = siteOfCustomer(cust);
    const have = new Set(cust.lines.map((l) => l.productId));
    // Kandidaten: gelistete Artikel, die der Kunde noch nicht hat, am Standort
    // belieferbar; kühlpflichtige nur mit genügend freiem Kühlregal.
    const cand = state.products.filter((p) => {
      if (have.has(p.id)) return false;
      if (!supplierDeliversTo(p.id, site)) return false;
      if (getProductDef(p.groupId).requiresCooling && coldShelfFree(state, site) < 60) return false;
      return true;
    });
    if (cand.length === 0) continue;
    const p = pick(cand);
    const vol = Math.max(1, Math.round(rollLineVolume(cust.type, p.id) * ARTICLE_VOLUME_FACTOR));
    cust.lines.push({ productId: p.id, price: p.verkaufspreis, agreedPrice: p.verkaufspreis, volume: vol });
    // KEIN Loyalitäts-Bonus: das Sammeln macht Kunden nicht künstlich klebrig — der
    // Wunsch→Ultimatum-Druck (ignorierte Forderungen → Abwanderung) bleibt scharf.
    // Nur Großkunden melden (sichtbarer Late-Game-Sog); klein/mittel still wachsen.
    if (cust.type === 'large') {
      notify(state, `⭐ ${cust.name} nimmt jetzt auch ${p.emoji} ${p.name} ins Programm – ${vol}×/Woche.`, 'success');
    }
  }
}

// --- Marktanteil-Modell (entkoppelt) ----------------------------------------

/** Basis-Markt einer Größe an einem Standort: klein/mittel skalieren mit der STADTGRÖSSE
 * (poolFactor — kleine Stadt weniger, Hauptstadt viel); large ist ein FIXER Pool pro LAND
 * (nicht stadt-skaliert). */
function marketBase(type: CustomerType, site: SiteId = 'hq'): number {
  if (type === 'large') return MARKET.BASE.large;
  return MARKET.BASE[type] * cityPoolFactor(site);
}
/** Wie viele Kunden dieser Größe du betreust (large = national; sonst je Standort,
 * oder gesamt wenn site weggelassen). */
export function yourHeld(state: GameState, type: CustomerType, site?: SiteId): number {
  return state.customers.filter(
    (c) => c.active && c.type === type && (type === 'large' || site == null || (c.region ?? 'hq') === site),
  ).length;
}
/** Basis-Konkurrenz-Anteil einer Größe an einem Standort (Anker: guter Service). */
function competitorBase(type: CustomerType, site: SiteId = 'hq'): number {
  return marketBase(type, site) * MARKET.COMPETITOR_SHARE;
}
/** Von Konkurrenten gehaltene Kunden (Stufe 2: dynamisch). Große Kunden bleiben ein
 * FIXER Pool (Basis-Anteil, kein Slot-Wachstum). Für klein/mittel liest die Funktion
 * die wöchentlich fortgeschriebenen Slots (competitorHeldBySite), die sich einem
 * Service-abhängigen Gleichgewicht nähern — fehlend = Basis-Anteil (Stufe-1-Wert). */
export function competitorHeld(state: GameState, type: CustomerType, site: SiteId = 'hq'): number {
  if (type === 'large') return Math.round(competitorBase('large'));
  const held = state.competitorHeldBySite?.[site]?.[type];
  return Math.round(held ?? competitorBase(type, site));
}
/** Ziel-Gleichgewicht der Konkurrenz-Slots: am Service-Anker (COMP_SERVICE_NEUTRAL)
 * exakt der Basis-Anteil; schlechterer Service ODER aggressivere Wettbewerber heben
 * es (sie erobern Markt), besserer Service drückt es (du gewinnst Anteil). */
function competitorEquilibrium(state: GameState, type: CustomerType, site: SiteId): number {
  const comps = ensureCompetitors(state);
  const avgAggr = comps.reduce((s, c) => s + c.aggressiveness, 0) / Math.max(1, comps.length);
  const serviceAdj = 1 + COMP_SERVICE_SLOPE * (COMP_SERVICE_NEUTRAL - state.serviceStars);
  const aggrAdj = 1 + (avgAggr - 0.5) * COMP_AGGR_SLOPE;
  const mult = clamp(serviceAdj * aggrAdj, COMP_SHARE_MIN_MULT, COMP_SHARE_MAX_MULT);
  return competitorBase(type, site) * mult;
}
/** Wöchentlich: die Konkurrenz-Slots (klein/mittel, je aktivem Standort) nähern sich
 * träge ihrem Gleichgewicht. So wächst der Konkurrenz-Druck bei schlechtem Service /
 * aggressiven Rivalen und schrumpft, wenn du den Markt dominierst. */
function runCompetitorSlotsWeek(state: GameState): void {
  if (!state.competitorHeldBySite) state.competitorHeldBySite = {};
  for (const site of activeSites(state)) {
    const bySite = (state.competitorHeldBySite[site] ??= {});
    for (const type of ['small', 'medium'] as CustomerType[]) {
      const cur = bySite[type] ?? competitorBase(type, site);
      const target = competitorEquilibrium(state, type, site);
      const next = cur + (target - cur) * COMP_SLOT_EASE;
      bySite[type] = clamp(next, competitorBase(type, site) * COMP_SHARE_MIN_MULT, competitorBase(type, site) * COMP_SHARE_MAX_MULT);
    }
  }
}
/** Einen Konkurrenz-Slot um n erhöhen (ein abgeworbener Kunde ist jetzt bei der
 * Konkurrenz) — bleibt im erlaubten Band. */
export function addCompetitorSlot(state: GameState, type: CustomerType, site: SiteId, n: number): void {
  if (type === 'large') return;
  if (!state.competitorHeldBySite) state.competitorHeldBySite = {};
  const bySite = (state.competitorHeldBySite[site] ??= {});
  const cur = bySite[type] ?? competitorBase(type, site);
  bySite[type] = clamp(cur + n, competitorBase(type, site) * COMP_SHARE_MIN_MULT, competitorBase(type, site) * COMP_SHARE_MAX_MULT);
}
/**
 * Gesamt-Markt (Anzeige/Marktanteil): WÄCHST mit dem bedienten Markt (deine Kunden + die der
 * Konkurrenz) — kein harter Deckel. Große Kunden: FIXER Markt je Land (kein Wachstum). Die
 * Kundenmechanik läuft separat; hier kommen Kunden & Markt nur für die Kennzahl zusammen. */
export function marketPool(state: GameState, type: CustomerType, site: SiteId = 'hq'): number {
  if (type === 'large') return marketBase('large');
  return marketBase(type, site) + yourHeld(state, type, site) + competitorHeld(state, type, site);
}
/** Marktanteil je Standort/Land: deine Kunden ÷ (deine + Konkurrenz). */
export function marketPenetration(state: GameState, type: CustomerType, site: SiteId = 'hq'): number {
  const you = yourHeld(state, type, type === 'large' ? undefined : site);
  const comp = competitorHeld(state, type, site);
  return you + comp > 0 ? you / (you + comp) : 0;
}

/** Weekly chance of a NEW-customer inquiry of a given size. Die Rate saturiert am
 * BASIS-Markt (je mehr du + Konkurrenz schon haben, desto seltener Neue) — aber weil der
 * Markt mitwächst, gibt es keine harte Wand. Service (neutral bei 3★), Ruf UND Vertrieb
 * heben die Rate (Vertrieb & Ruf nicht mehr den Pool). Expansion (2. Stadt) verdoppelt
 * den Basis-Markt → frische Kunden. */
export function typeInquiryChance(state: GameState, type: CustomerType): number {
  const sites: SiteId[] = type === 'large' ? ['hq'] : activeSites(state);
  let base = 0;
  let comp = 0;
  for (const site of sites) {
    base += marketBase(type, site);
    comp += competitorHeld(state, type, site);
  }
  const you = yourHeld(state, type);
  const saturation = base > 0 ? base / (base + you + comp) : 0;
  const serviceFactor = clamp(1 + 0.05 * (state.serviceStars - 3), MARKET.SERVICE_FLOOR, 1.1);
  const renownBoost = 1 + (nationalRenown(state) / RENOWN.MAX) * RENOWN.ACQUISITION_BOOST;
  const salesBonus = 1 + salesAcquisitionPower(state) * MARKET.SALES_RATE_BONUS;
  return INQUIRY_BASE_CHANCE[type] * saturation * serviceFactor * renownBoost * salesBonus;
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
  // Region: nach Ruf gewichtet — ein bekannter Standort (auch der neu eröffnete,
  // der einen Teil des Landes-Rufs geerbt hat) zieht mehr Neukunden an.
  const region: SiteId = pickInquiryRegion(state);
  // Konkreter Artikel — pickInquiryProduct bevorzugt bereits VERKAUFTE Artikel (auf
  // Lager), damit Neukunden ohne Liefer-Verzug bedient werden. Nur bei einer neuen
  // (ungelisteten) Gruppe wird der region-typische Leit-Artikel gewählt.
  const preferred = pickInquiryProduct(state, region);
  const product = inquiryProductInfo(state, preferred);
  const inquiry: Inquiry = {
    id: uid('inq'),
    name: uniqueCustomerName(state, type),
    emoji: CUSTOMER_EMOJI[type],
    type,
    preferredProduct: preferred,
    suggestedVolume: rollLineVolume(type, preferred),
    targetPrice: rollInquiryTargetPrice(product.verkaufspreis * strategyPriceFactor(state)),
    createdWeek: week,
    expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
    status: 'open',
    region,
  };
  state.inquiries.push(inquiry);
  const unlistedHint = isInAssortment(state, groupOfArticle(preferred)!) ? '' : ' (noch nicht gelistet!)';
  notify(
    state,
    `📨 Neue Kundenanfrage (${SITE_META[region].short}): ${inquiry.name} (${type}) sucht ${product.name}${unlistedHint}.`,
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
  // Angeboten werden ARTIKEL: alle gelisteten SKUs + je unlistbarer Gruppe ihr
  // Leit-Artikel (Annahme listet die Gruppe). So bekommt der Kunde eine konkrete SKU.
  const listable: ArticleId[] = [
    ...state.products.map((p) => p.id),
    ...listableUnlistedProducts(state).map((g) => defaultArticleOf(g).id),
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
    // C2: nur Artikel anbieten, die der Lieferant an den STANDORT des Kunden bringt
    // (ein Süd-Kunde kann keine Nord-exklusive Fisch-SKU beziehen) — sonst entsteht
    // eine unerfüllbare Anfrage.
    const custSite = siteOfCustomer(cust);
    const missing = listable.filter(
      (pid) => !cust.lines.some((l) => l.productId === pid) && supplierDeliversTo(pid, custSite),
    );
    if (missing.length === 0) continue;
    if (Math.random() > EXPANSION_CHANCE_PER_CUSTOMER) continue;

    // Breite bevorzugen: ein Artikel aus einer noch NICHT bezogenen Gruppe zuerst.
    // Weitere SKUs einer bereits bezogenen Gruppe deckt der passive Sammel-Motor
    // (growCustomerArticles) schon ab — das hier soll echtes Sortiments-Wachstum sein.
    const ownedGroups = new Set(cust.lines.map((l) => groupOfArticle(l.productId)));
    const newGroup = missing.filter((pid) => !ownedGroups.has(groupOfArticle(pid)!));
    const productId = pick(newGroup.length > 0 ? newGroup : missing);
    const product = inquiryProductInfo(state, productId);
    state.inquiries.push({
      id: uid('inq'),
      name: cust.name,
      emoji: cust.emoji,
      type: cust.type,
      existingCustomerId: cust.id,
      preferredProduct: productId,
      suggestedVolume: rollLineVolume(cust.type, productId),
      targetPrice: rollInquiryTargetPrice(product.verkaufspreis * strategyPriceFactor(state)),
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
  productId: ArticleId,
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
    targetPrice: rollInquiryTargetPrice(product.verkaufspreis * strategyPriceFactor(state)),
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
// --- Konkurrenz & Markt (L2) ------------------------------------------------

/** Lazy-seed competitors for saves created before L2 (no SAVE bump). */
export function ensureCompetitors(state: GameState): Competitor[] {
  if (!state.competitors || state.competitors.length === 0) {
    state.competitors = COMPETITOR_DEFS.map((d) => ({
      id: d.id,
      name: d.name,
      emoji: d.emoji,
      strength: d.baseStrength,
      aggressiveness: d.aggressiveness,
    }));
  }
  return state.competitors;
}

/** Player's market footprint: size-weighted active customers (small 1 / medium 2
 * / large 6). Grows as the operation grows — that's what lifts the market share. */
export function playerMarketStrength(state: GameState): number {
  return state.customers.reduce((s, c) => (c.active ? s + SLOT_COST[c.type] : s), 0);
}
export function totalMarketStrength(state: GameState): number {
  const comp = ensureCompetitors(state).reduce((s, c) => s + c.strength, 0);
  return playerMarketStrength(state) + comp;
}
/** Player's current market share (0..1). */
export function marketShare(state: GameState): number {
  const total = totalMarketStrength(state);
  return total > 0 ? playerMarketStrength(state) / total : 0;
}

// --- Renown / Ruf (Mid-Game-Wachstumsmotor) ---------------------------------

/** Ruf (0..100) eines Standorts. Fehlend = 0. */
export function siteRenown(state: GameState, site: SiteId = 'hq'): number {
  return state.renownBySite?.[site] ?? 0;
}
/** Landes-Ruf: kunden-gewichteter Mittelwert der Standort-Rufe (der große, etablierte
 * Standort prägt die Marke stärker). Basis, die ein neuer Standort erbt. */
export function nationalRenown(state: GameState): number {
  let wSum = 0;
  let rSum = 0;
  for (const s of activeSites(state)) {
    const cust = state.customers.filter((c) => c.active && (c.region ?? 'hq') === s).length;
    const w = 1 + cust;
    wSum += w;
    rSum += w * siteRenown(state, s);
  }
  return wSum > 0 ? rSum / wSum : 0;
}
/** Zielwert, dem sich der Ruf eines Standorts nähert: mehr zufriedene Kunden +
 * Service über 3★ → höherer Ruf. */
function renownTargetForSite(state: GameState, site: SiteId): number {
  const cust = state.customers.filter((c) => c.active && (c.region ?? 'hq') === site);
  const n = cust.length;
  const svc = n ? cust.reduce((a, c) => a + c.serviceRating, 0) / n : 3;
  return clamp(n * RENOWN.PER_CUSTOMER + Math.max(0, svc - 3) * RENOWN.SERVICE_BONUS, 0, RENOWN.MAX);
}
/** Wöchentlich: jeder Standort-Ruf nähert sich (träge) seinem Zielwert. Der
 * Marketing-Manager beschleunigt das Tempo (schnellere Annäherung) — weil der Ruf
 * sich nur um EASE annähert, ist der absolute Wochen-Gewinn dort am größten, wo der
 * Abstand zum Ziel groß ist, also am jungen Standort: „Kunden werden vor allem
 * initial schneller aufmerksam." */
function runRenownWeek(state: GameState): void {
  if (!state.renownBySite) state.renownBySite = {};
  const ease = Math.min(RENOWN.MAX_EASE, RENOWN.EASE * (1 + marketingPower(state) * RENOWN.MARKETING_SPEED));
  for (const site of activeSites(state)) {
    const cur = siteRenown(state, site);
    const target = renownTargetForSite(state, site);
    state.renownBySite[site] = clamp(cur + (target - cur) * ease, 0, RENOWN.MAX);
  }
}
/** Region einer neuen Anfrage — nach Ruf gewichtet: ein bekannter (auch neu
 * eröffneter, geerbter) Standort zieht mehr Neukunden. */
export function pickInquiryRegion(state: GameState): SiteId {
  const sites = activeSites(state);
  if (sites.length <= 1) return sites[0] ?? 'hq';
  const weights = sites.map((s) => RENOWN.REGION_BASE + siteRenown(state, s));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < sites.length; i++) {
    r -= weights[i];
    if (r <= 0) return sites[i];
  }
  return sites[sites.length - 1];
}

export interface RankRow {
  id: string;
  name: string;
  emoji: string;
  strength: number;
  share: number;
  isPlayer: boolean;
  aggressiveness?: number;
}
/** Market leaderboard (player + competitors), strongest first. */
export function marketRanking(state: GameState): RankRow[] {
  const total = totalMarketStrength(state) || 1;
  const rows: RankRow[] = ensureCompetitors(state).map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    strength: c.strength,
    share: c.strength / total,
    isPlayer: false,
    aggressiveness: c.aggressiveness,
  }));
  const ps = playerMarketStrength(state);
  rows.push({ id: 'player', name: 'Deine Firma', emoji: '🏭', strength: ps, share: ps / total, isPlayer: true });
  return rows.sort((a, b) => b.strength - a.strength);
}
/** 1-based rank of the player in the market. */
export function playerRank(state: GameState): number {
  return marketRanking(state).findIndex((r) => r.isPlayer) + 1;
}

/** How poachable a customer is right now (higher = more at risk). Zero for
 * comfortable customers — good service and fair prices protect them. Overpricing
 * (paying above the product's list price) and low loyalty raise the risk. */
function poachRisk(cust: Customer): number {
  if (cust.loyalty >= POACH_SAFE_LOYALTY) return 0;
  const loyaltyGap = (POACH_SAFE_LOYALTY - cust.loyalty) / POACH_SAFE_LOYALTY; // 0..1
  // Overpricing: agreed price vs the product's list price (verkaufspreis).
  let overprice = 0;
  for (const l of cust.lines) {
    const list = articleEconomics(l.productId)?.verkaufspreis ?? 0;
    if (list > 0) overprice = Math.max(overprice, (l.price - list) / list);
  }
  const priceFactor = 1 + Math.max(0, overprice) * 2; // teuer = attraktiveres Ziel
  const serviceFactor = 1 + Math.max(0, (3 - cust.serviceRating)) * 0.3; // schlechter Service = leichter
  return loyaltyGap * priceFactor * serviceFactor;
}

/** Customers that already have an open decision/ask attached — not re-targeted. */
function poachBusy(state: GameState): Set<string> {
  const busy = new Set<string>();
  for (const i of state.inquiries) if (i.status === 'open' && i.existingCustomerId) busy.add(i.existingCustomerId);
  for (const u of state.pendingUltimatums) busy.add(u.customerId);
  if (state.pendingPoach) busy.add(state.pendingPoach.customerId);
  return busy;
}
/** The single most vulnerable free customer (highest poachRisk), or undefined. */
function mostVulnerableCustomer(state: GameState): Customer | undefined {
  const busy = poachBusy(state);
  let target: Customer | undefined;
  let bestRisk = 0;
  for (const cust of state.customers) {
    if (!cust.active || busy.has(cust.id)) continue;
    const r = poachRisk(cust);
    if (r > bestRisk) { bestRisk = r; target = cust; }
  }
  return target;
}
/** The raider: the most aggressive competitor. */
function pickRaider(state: GameState): Competitor {
  return ensureCompetitors(state).slice().sort((a, b) => b.aggressiveness - a.aggressiveness)[0];
}

/**
 * Resolve a competitor attack on a customer by LOYALTY TIER (Stufe 2):
 *  - loyalty < POACH_DIRECT_LOSS_LOYALTY (30): DIRECT loss — the neglected customer
 *    leaves for the competitor immediately (their slot grows). No decision.
 *  - 30 … POACH_SAFE_LOYALTY (60): a GEGENANGEBOT decision opens (state.pendingPoach)
 *    — hold the customer by conceding margin, or let them walk.
 *  (loyalty ≥ 60 is SAFE and never targeted, see poachRisk.)
 */
function launchPoachAttack(state: GameState, target: Customer, raider: Competitor, newWeek: number, tutorial = false): void {
  target.courtedUntilWeek = newWeek + POACH_COURT_WEEKS;
  const site: SiteId = target.region ?? 'hq';
  if (target.loyalty < POACH_DIRECT_LOSS_LOYALTY) {
    const weekly = Math.round(target.lines.reduce((s, l) => s + l.volume * l.price, 0));
    target.active = false;
    releaseCustomerOrders(state, target.id);
    addCompetitorSlot(state, target.type, site, 1);
    notify(
      state,
      `🏴 ${raider.emoji} ${raider.name} hat ${target.name} abgeworben! Die Loyalität war zu niedrig für ein Gegenangebot. Verlorener Wochenumsatz: ~${weekly}€.`,
      'error',
    );
    return;
  }
  // Mid loyalty → the player gets a counter-offer decision.
  state.pendingPoach = {
    customerId: target.id,
    raiderId: raider.id,
    raiderName: raider.name,
    raiderEmoji: raider.emoji,
    discountOffer: GEGENANGEBOT_DISCOUNT,
    deadlineWeek: newWeek + POACH_DECISION_WEEKS,
    tutorial,
  };
  notify(
    state,
    `🎯 ${raider.emoji} ${raider.name} greift nach ${target.name}! Mit einem Gegenangebot gegenhalten (Marge einbüßen) oder ziehen lassen?`,
    'warn',
  );
}

/**
 * Weekly market step (Stufe 2). Competitor strengths drift, the player's share is
 * recomputed, the competitor customer-slots ease toward their service-dependent
 * equilibrium, and — gated by exposure & aggressiveness — a competitor may attack
 * the most vulnerable customer, resolved by the 3-tier loyalty defense above. The
 * first attack is scripted for month 3 (Woche 12) so the mechanic is taught once.
 */
function runMarketWeek(state: GameState, newWeek: number): void {
  const comps = ensureCompetitors(state);
  for (const c of comps) {
    const def = COMPETITOR_DEFS.find((d) => d.id === c.id);
    const base = def ? def.baseStrength : c.strength;
    const drift = randRange(-COMPETITOR_STRENGTH_DRIFT, COMPETITOR_STRENGTH_DRIFT);
    c.strength = clamp(c.strength + drift, base * (1 - COMPETITOR_STRENGTH_BAND), base * (1 + COMPETITOR_STRENGTH_BAND));
  }
  state.marketShare = marketShare(state);
  runCompetitorSlotsWeek(state);

  // No competitive harassment during the tutorial.
  if (state.tutorial?.active) return;

  // An unanswered counter-offer expires → the customer walks to the competitor.
  if (state.pendingPoach && newWeek >= state.pendingPoach.deadlineWeek) {
    const cust = state.customers.find((c) => c.id === state.pendingPoach!.customerId);
    if (cust && cust.active) {
      const weekly = Math.round(cust.lines.reduce((s, l) => s + l.volume * l.price, 0));
      cust.active = false;
      releaseCustomerOrders(state, cust.id);
      addCompetitorSlot(state, cust.type, cust.region ?? 'hq', 1);
      notify(state, `🏴 ${cust.name} ist zur Konkurrenz gewechselt – das Gegenangebot blieb aus. Verlorener Wochenumsatz: ~${weekly}€.`, 'error');
    }
    state.pendingPoach = undefined;
  }
  // Only one open poach decision at a time.
  if (state.pendingPoach) return;

  // Month-3 scripted first attack — always a GEGENANGEBOT (mid loyalty) so the
  // player experiences the counter-offer choice with a clear explanation.
  if (!state.firstAttackShown && newWeek >= FIRST_ATTACK_WEEK) {
    const target = mostVulnerableCustomer(state)
      ?? state.customers.filter((c) => c.active && !poachBusy(state).has(c.id))
        .sort((a, b) => a.loyalty - b.loyalty)[0];
    if (target) {
      state.firstAttackShown = true;
      // Guarantee the mid-loyalty tier for the teaching moment.
      target.loyalty = clamp(Math.min(target.loyalty, 48), POACH_DIRECT_LOSS_LOYALTY + 5, POACH_SAFE_LOYALTY - 5);
      launchPoachAttack(state, target, pickRaider(state), newWeek, true);
    }
    return;
  }

  // Ongoing pressure — ramps with your footprint (a late-game force, not a
  // newcomer nuisance) and competitor aggressiveness.
  const avgAggr = comps.reduce((s, c) => s + c.aggressiveness, 0) / Math.max(1, comps.length);
  const active = state.customers.filter((c) => c.active).length;
  const exposure = clamp(active / POACH_EXPOSURE_FULL, 0, 1);
  if (Math.random() >= POACH_BASE_CHANCE * avgAggr * exposure) return;
  const target = mostVulnerableCustomer(state);
  if (!target) return;
  launchPoachAttack(state, target, pickRaider(state), newWeek);
}

function maybeGenerateDemand(state: GameState): void {
  const week = weekOf(state.totalDays);
  if (demandProcessActive(state)) return;
  if (state.lastDemandWeek != null && week - state.lastDemandWeek < DEMAND_COOLDOWN_WEEKS) return;
  if (Math.random() > DEMAND_CHANCE_PER_WEEK) return;

  // Anything listable counts (as ARTIKEL) — including a listable-but-unlisted
  // group via its Leit-Artikel (the wish is what pulls them toward listing, Paket A).
  const listable: ArticleId[] = [
    ...state.products.map((p) => p.id),
    ...listableUnlistedProducts(state).map((g) => defaultArticleOf(g).id),
  ];
  // A customer already fielding an open ask (expansion or Großauftrag) or a
  // pending ultimatum must not get piled with a second — no double-booking.
  const busy = new Set<string>();
  for (const i of state.inquiries) if (i.status === 'open' && i.existingCustomerId) busy.add(i.existingCustomerId);
  for (const u of state.pendingUltimatums) busy.add(u.customerId);
  const candidates: { cust: Customer; missing: ArticleId[] }[] = [];
  for (const cust of state.customers) {
    if (!cust.active) continue;
    if (busy.has(cust.id)) continue;
    if (cust.loyalty < DEMAND_MIN_LOYALTY) continue;
    if (week - cust.sinceWeek < DEMAND_MIN_CUSTOMER_WEEKS) continue;
    // Der Wunsch-Druck zielt auf BREITE (eine noch nicht bezogene GRUPPE), unabhängig
    // von der Artikel-Tiefe — sonst würde das automatische Artikel-Sammeln den Druck
    // stumm schalten. Gedeckelt auf DEMAND_MAX_LINES verschiedene Gruppen.
    const custGroups = new Set(cust.lines.map((l) => groupOfArticle(l.productId)));
    if (custGroups.size >= DEMAND_MAX_LINES) continue;
    const missing = listable.filter((pid) => !custGroups.has(groupOfArticle(pid)));
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

/** Occasional Großauftrag (Paket 5): an existing customer offers a large one-off
 * delivery next week at a premium price on a tight deadline. A bet — accept only
 * if you can build the stock and prep it in time; miss it and it hits service
 * like any late order. Surfaced as a special inquiry (bigOrder) in the Anfragen
 * screen; there's never more than one open at a time. */
function maybeGenerateBigOrder(state: GameState): void {
  const week = weekOf(state.totalDays);
  if (state.customers.filter((c) => c.active).length < BIGORDER_MIN_CUSTOMERS) return;
  if (state.lastBigOrderWeek != null && week - state.lastBigOrderWeek < BIGORDER_COOLDOWN_WEEKS) return;
  if (state.inquiries.some((i) => i.status === 'open' && i.bigOrder)) return;
  if (Math.random() > BIGORDER_CHANCE_PER_WEEK) return;

  // Don't pile a second ask on a customer who already has an open inquiry or a
  // pending ultimatum (same rule as expansion offers).
  const busy = new Set<string>();
  for (const i of state.inquiries) if (i.status === 'open' && i.existingCustomerId) busy.add(i.existingCustomerId);
  for (const u of state.pendingUltimatums) busy.add(u.customerId);
  const eligible = state.customers.filter((c) => c.active && !busy.has(c.id));
  if (eligible.length === 0) return;

  const listed = state.products; // alle gelisteten Artikel
  if (listed.length === 0) return;
  const product = pick(listed);
  const cust = pick(eligible);
  const baseVol = rollLineVolume('medium', product.id);
  const mult = randInt(BIGORDER_VOLUME_MULT[0], BIGORDER_VOLUME_MULT[1]);
  const quantity = Math.max(PALETTE_SIZE, baseVol * mult);
  const premium = randRange(BIGORDER_PRICE_PREMIUM[0], BIGORDER_PRICE_PREMIUM[1]);
  const price = Math.round(product.verkaufspreis * (1 + premium) * 2) / 2;
  const dueWeek = week + 1;

  state.lastBigOrderWeek = week;
  state.inquiries.push({
    id: uid('inq'),
    name: cust.name,
    emoji: '📦',
    type: cust.type,
    existingCustomerId: cust.id,
    preferredProduct: product.id,
    suggestedVolume: quantity,
    targetPrice: price,
    createdWeek: week,
    expiryWeek: week + BIGORDER_EXPIRY_WEEKS,
    status: 'open',
    bigOrder: { quantity, dueWeek },
  });
  notify(
    state,
    `📦 Großauftrag! ${cust.name} will einmalig ${quantity}× ${product.emoji} ${product.name} @ ${price}€ – Lieferung bis Woche ${dueWeek}. Nur annehmen, wenn du rechtzeitig lieferst!`,
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
    // Gegenstandslos, sobald der Kunde die gewünschte GRUPPE bezieht (egal welcher
    // Artikel daraus) oder seine Breiten-Reichweite erreicht hat.
    const wantGroup = groupOfArticle(u.productId);
    const moot =
      !cust ||
      !cust.active ||
      cust.lines.some((l) => groupOfArticle(l.productId) === wantGroup) ||
      new Set(cust.lines.map((l) => groupOfArticle(l.productId))).size >= DEMAND_MAX_LINES;
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
function churnDemandCustomer(state: GameState, cust: Customer, productId: ArticleId): void {
  const product = articleEconomics(productId)!;
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
    const product = articleEconomics(inq.preferredProduct)!;
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

  // Slot check per manager: small/medium need SLOT_COST[type] free slots at ONE
  // central manager; GROSSKUNDEN brauchen einen freien Platz bei einem Regional-KAM.
  const mgr = bestManagerFor(state, inq.type);
  if (!mgr) {
    notify(
      state,
      inq.type === 'large'
        ? `❌ Kein Regional-KAM hat noch Platz für ${inq.name} (Großkunde) – stelle im Regionalbüro einen Regional-KAM ein (betreut bis zu ${REGIONAL_KAM_LARGE_SLOTS}).`
        : `❌ Kein Manager hat ${SLOT_COST[inq.type]} freie Slots für ${inq.name} – stelle einen KAM ein oder verteile Kunden um.`,
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
    // Ein gezielt abgeworbener Kunde kommt schon etwas überzeugt (höhere Startloyalität).
    loyalty: inq.poached ? 68 : 60,
    lateDeliveries: 0,
    deliveryLeadWeeks: CUSTOMER_LEAD_WEEKS[inq.type],
    volatility: CUSTOMER_VOLATILITY[inq.type],
    activeDiscount: 0,
    sinceWeek: week,
    active: true,
    region: inq.region,
  };
  state.customers.push(customer);
  inq.status = 'accepted';
  if (inq.poached) {
    // Du hast ihn der Konkurrenz weggenommen → ihr Slot dieser Größe sinkt.
    addCompetitorSlot(state, inq.type, inq.region ?? 'hq', -1);
    notify(
      state,
      `🎯 Abgeworben! ${inq.name} wechselt von ${inq.poached.fromName} zu dir (${inq.suggestedVolume}× @ ${price}€) · betreut von ${mgr.isChef ? 'dir' : mgr.name}.`,
      'success',
    );
    return;
  }
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
    // A running supply contract shields its product from the hike — that's the
    // whole point of locking a price. Pick only among un-contracted products.
    const open = state.supplier.products.filter((s) => !hasActiveContract(state, s.productId));
    if (open.length === 0) return;
    const sp = pick(open);
    const product = getProduct(state, sp.productId);
    const pct = randRange(SUPPLIER_INCREASE_RANGE[0], SUPPLIER_INCREASE_RANGE[1]);
    // Verhandelt wird nur, was ein Einkäufer BETREUT (Kapazität: 3 Gruppen pro
    // Kopf) — unbetreute Gruppen trifft die volle Erhöhung.
    const skill = isBuyerCovered(state, sp.productId) ? bestNegotiationSkill(state) : 0;
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
  // Fuhrpark-Unterhalt (Instandhaltung + Treibstoff) ist ein monatlicher Fixkosten-
  // block wie die Miete: wöchentlicher Anteil ins Logistik-Konto, Barabbuchung monatlich.
  const fleetMonthly = fleetMonthlyCost(state);
  state.weekAcc.salaries += weeklySalary;
  state.weekAcc.rent += monthlyRent / WEEKS_PER_MONTH;
  state.weekAcc.logistics += fleetMonthly / WEEKS_PER_MONTH;

  // 1c. Cash side — at month end the whole month's salaries + rent (+ Fuhrpark-
  // Unterhalt) are actually debited, all at once (accrued through the weekly shares
  // above). newWeek is the start of the next month when it is divisible by 4.
  if (newWeek % WEEKS_PER_MONTH === 0 && newWeek > 0) {
    const monthlySalary = weeklySalary * WEEKS_PER_MONTH;
    spend(state, monthlySalary + monthlyRent + fleetMonthly);
    const expansions = state.warehouse.expansions + state.warehouse.officeExpansions;
    const rentNote =
      expansions > 0
        ? `Miete ${Math.round(monthlyRent)}€ (Basis ${MONTHLY_RENT}€ + ${expansions} Erweiterungen)`
        : `Miete ${MONTHLY_RENT}€`;
    const fleetNote = fleetMonthly > 0 ? ` + Fuhrpark ${Math.round(fleetMonthly)}€` : '';
    notify(
      state,
      `💸 Monatsabschluss: Personal ${Math.round(monthlySalary)}€ + ${rentNote}${fleetNote} abgebucht.`,
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

  // 5b2. Konkurrenz & Markt (L2): Wettbewerber-Stärken driften, Marktanteil neu
  // berechnen, ggf. einen verwundbaren Kunden abwerben (Loyalitäts-Schlag →
  // speist den bestehenden Abwanderungs-Pfad direkt darunter).
  runMarketWeek(state, newWeek);
  runRenownWeek(state);
  growCustomerArticles(state, newWeek);

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
  state.currentWeekPoBySite = {};
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
    // …and the occasional one-off Großauftrag bet (Paket 5).
    maybeGenerateBigOrder(state);
  }

  // Weekly order window: Saturday, after this week's customer orders are in (so
  // the recommendation is built on demand the player has actually seen). Fires
  // at most once per week — currentWeekPoId is cleared at the Monday rollover, so
  // if the player already ordered earlier this week we don't prompt again. During
  // the tutorial the prompt is held back until the ordering beat unlocks it.
  const orderingUnlocked = !state.tutorial?.active || state.tutorial.step >= STEP.ORDER;
  if (dow === ORDER_DAY_OF_WEEK && state.currentWeekPoBySite.hq == null && orderingUnlocked) {
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
  // Phase B: die Tutorial-Anfragen laufen über den konkreten Fisch-Leit-Artikel
  // (Lachsfilet) statt der Gruppe 'fisch' — der Kunde bezieht ja eine echte SKU.
  const fishArticle = defaultArticleOf('fisch').id;
  const product = getProduct(state, fishArticle);
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
      preferredProduct: fishArticle,
      suggestedVolume: rollLineVolume('small', fishArticle),
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
  // Konkreter Fleisch-Leit-Artikel (Rinderhack) statt der Gruppe 'fleisch'.
  const meatArticle = defaultArticleOf('fleisch').id;
  const product = getProduct(state, meatArticle);
  state.inquiries.push({
    id: TUTORIAL_MEAT_INQUIRY_ID,
    name: uniqueCustomerName(state, 'small'),
    emoji: CUSTOMER_EMOJI.small,
    type: 'small',
    preferredProduct: meatArticle,
    suggestedVolume: rollLineVolume('small', meatArticle),
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
        state.currentWeekPoBySite.hq != null ||
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
  processTransfers(state);
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
