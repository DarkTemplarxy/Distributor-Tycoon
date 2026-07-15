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
  BASE_CUSTOMER_CAPACITY,
  BASE_PREP_DAYS_PER_PALETTE,
  CREDIT_INTEREST_RATE,
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_EMOJI,
  CUSTOMER_LEAD_WEEKS,
  CUSTOMER_NAME_POOL,
  CUSTOMER_VOLATILITY,
  CUSTOMER_VOLUME_RANGE,
  DAYS_PER_WEEK,
  EXPANSION_INQUIRY_CHANCE_PER_WEEK,
  EXPANSION_MIN_LOYALTY,
  INQUIRY_CHANCE_PER_WEEK,
  INQUIRY_EXPIRY_WEEKS,
  INQUIRY_FAMILIAR_PRODUCT_CHANCE,
  KAM_CAPACITY,
  LARGE_UNLOCK_REVENUE,
  MEDIUM_UNLOCK_REVENUE,
  PALETTE_SIZE,
  PAYMENT_DELAY_DAYS,
  PER_ARTICLE_PREP_FACTOR,
  PRODUCT_DEFS,
  SEASONAL_TREND,
  SECONDS_PER_DAY_AT_1X,
  SUPPLIER_INCREASE_CHANCE,
  SUPPLIER_INCREASE_RANGE,
  TRUCK_DAY_FRACTION,
  WEEKS_PER_YEAR,
  demandUpliftFromDiscount,
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
  Product,
  ProductId,
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
} from './util';

// --- Notifications ----------------------------------------------------------

export function notify(state: GameState, message: string, type: NotificationType = 'info'): void {
  state.notifications.push({
    id: uid('note'),
    day: Math.floor(state.totalDays),
    week: weekOf(state.totalDays),
    message,
    type,
  });
  // Keep the log bounded.
  if (state.notifications.length > 60) {
    state.notifications.splice(0, state.notifications.length - 60);
  }
}

// --- Inventory helpers ------------------------------------------------------

export function inventoryTotal(product: Product): number {
  return product.batches.reduce((sum, b) => sum + b.quantity, 0);
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

/** Remove `qty` units from a product using FIFO (soonest expiry first). */
function deductInventory(product: Product, qty: number): void {
  let remaining = qty;
  product.batches.sort((a, b) => a.expiryDay - b.expiryDay);
  for (const batch of product.batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    batch.quantity -= take;
    remaining -= take;
  }
  product.batches = product.batches.filter((b) => b.quantity > 0);
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
    }
  }
}

// --- Capacity helpers -------------------------------------------------------

export function kamCount(state: GameState): number {
  return state.employees.filter((e) => e.role === 'kam').length;
}

export function capacityFor(state: GameState, type: CustomerType): number {
  return BASE_CUSTOMER_CAPACITY[type] + kamCount(state) * KAM_CAPACITY[type];
}

export function usedCapacity(state: GameState, type: CustomerType): number {
  return state.customers.filter((c) => c.active && c.type === type).length;
}

export function freeCapacity(state: GameState, type: CustomerType): number {
  return capacityFor(state, type) - usedCapacity(state, type);
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

/** Rolling weekly revenue used to gate unlocks (best 4-week average). */
export function recentWeeklyRevenue(state: GameState): number {
  const last = state.reports.slice(-4);
  if (last.length === 0) return 0;
  return last.reduce((s, r) => s + r.revenue, 0) / last.length;
}

export function serviceStarsRecompute(state: GameState): void {
  const active = state.customers.filter((c) => c.active);
  if (active.length === 0) return;
  state.serviceStars = active.reduce((s, c) => s + c.serviceRating, 0) / active.length;
}

// --- Order preparation ------------------------------------------------------

function prepDaysFor(quantity: number, skill: number, bundleSize = 1): number {
  const palettes = quantity / PALETTE_SIZE;
  const bundleFactor = 1 + Math.max(0, bundleSize - 1) * PER_ARTICLE_PREP_FACTOR;
  return palettes * BASE_PREP_DAYS_PER_PALETTE * (100 / Math.max(1, skill)) * bundleFactor;
}

/**
 * Try to start preparing an order: needs enough inventory and a free worker.
 * Returns a reason string on failure, or null on success.
 */
export function tryPrepareOrder(state: GameState, order: Order): string | null {
  if (order.status !== 'pending') return 'Auftrag ist nicht offen.';
  const product = getProduct(state, order.productId);
  if (inventoryTotal(product) < order.quantity) return 'Nicht genug Lagerbestand.';
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
  const days = prepDaysFor(order.quantity, worker.skill, bundleSize);
  worker.task = { orderId: order.id, totalDays: days, remainingDays: days };
  return null;
}

function completePreparation(state: GameState, orderId: string): void {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = 'ready';
  const palette = state.palettes.find((p) => p.id === order.paletteId);
  if (palette) palette.status = 'ready';
  const cust = state.customers.find((c) => c.id === order.customerId);
  notify(state, `📦 Palette fertig: ${order.quantity}× für ${cust?.name ?? 'Kunde'} – wartet auf den Laster.`, 'success');
}

function updateEmployees(state: GameState, deltaDays: number): void {
  for (const emp of state.employees) {
    if (!emp.task) continue;
    emp.task.remainingDays -= deltaDays;
    if (emp.task.remainingDays <= 0) {
      const orderId = emp.task.orderId;
      emp.task = undefined;
      completePreparation(state, orderId);
    }
  }
}

/** Auto-assign idle workers to the oldest fulfillable pending order. */
function autoAssignWork(state: GameState): void {
  if (!state.settings.autoPrep) return;
  let idle = state.employees.filter((e) => e.role === 'lager' && !e.task).length;
  if (idle === 0) return;
  const pending = state.orders
    .filter((o) => o.status === 'pending')
    .sort((a, b) => a.dueWeek - b.dueWeek || a.createdDay - b.createdDay);
  for (const order of pending) {
    if (idle === 0) break;
    const product = getProduct(state, order.productId);
    if (inventoryTotal(product) < order.quantity) continue;
    const err = tryPrepareOrder(state, order);
    if (err === null) idle -= 1;
  }
}

// --- Customer orders --------------------------------------------------------

function generateCustomerOrder(state: GameState, customer: Customer, line: CustomerLine): void {
  const week = weekOf(state.totalDays);
  const seasonal = seasonalMultiplier(line.productId, week);
  const discountUplift = 1 + demandUpliftFromDiscount(customer.activeDiscount);
  const jitter = randRange(0.9, 1.1);
  const qty = Math.max(1, Math.round(line.volume * seasonal * discountUplift * jitter));
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
  );
}

// --- Monday truck pickup ----------------------------------------------------

function truckPickup(state: GameState, week: number): void {
  const ready = state.palettes.filter((p) => p.status === 'ready');
  let loaded = 0;

  for (const palette of ready) {
    const order = state.orders.find((o) => o.id === palette.orderId);
    if (!order) continue;
    order.status = 'delivered';
    loaded += 1;

    // Logistics cost per palette.
    spend(state, state.truck.costPerPallet);
    state.weekAcc.logistics += state.truck.costPerPallet;

    // Schedule the customer payment one week out.
    state.scheduledPayments.push({
      id: uid('pay'),
      customerId: order.customerId,
      orderId: order.id,
      amount: order.quantity * order.price,
      dueDay: state.totalDays + PAYMENT_DELAY_DAYS,
      label: `Zahlung ${order.quantity}× für Auftrag`,
    });

    state.stats.deliveredOrders += 1;
    state.weekAcc.deliveredOrders += 1;

    const cust = state.customers.find((c) => c.id === order.customerId);
    if (cust && !order.late) {
      cust.serviceRating = clamp(cust.serviceRating + 0.1, 1, 5);
      cust.loyalty = clamp(cust.loyalty + 3, 0, 100);
    }
  }

  // Remove loaded palettes from the warehouse.
  state.palettes = state.palettes.filter((p) => p.status !== 'ready');

  if (loaded > 0) {
    notify(state, `🚚 Laster abgefahren – ${loaded} Palette(n) geladen (Kosten ${loaded * state.truck.costPerPallet}€).`, 'success');
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
    // Return goods that were already picked to the shelf.
    if (order.status === 'preparing' || order.status === 'ready') {
      const product = getProduct(state, order.productId);
      product.batches.push({
        id: uid('batch'),
        productId: order.productId,
        quantity: order.quantity,
        expiryDay: state.totalDays + product.spoilageDays,
      });
    }
    // Free any worker who was preparing it.
    const worker = state.employees.find((e) => e.task?.orderId === order.id);
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
      state.weekAcc.spoilageLoss += loss;
      product.batches = product.batches.filter((b) => b.quantity > 0);
      notify(state, `🗑️ ${spoiledUnits}× ${product.name} verdorben (Verlust ${Math.round(loss)}€).`, 'error');
    }
  }
}

// --- Purchase orders & payments (checked every tick, idempotent) ------------

function receiveDuePurchaseOrders(state: GameState): void {
  for (const po of state.purchaseOrders) {
    if (po.status !== 'pending') continue;
    if (po.deliveryDay > state.totalDays) continue;
    for (const item of po.items) {
      const product = getProduct(state, item.productId);
      product.batches.push({
        id: uid('batch'),
        productId: item.productId,
        quantity: item.quantity,
        expiryDay: state.totalDays + product.spoilageDays,
      });
    }
    po.status = 'received';
    notify(state, `📥 Lieferung eingetroffen (Wert ${Math.round(po.totalCost)}€).`, 'success');
  }
  // Drop received POs to keep the list tidy.
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
    notify(state, `💰 Zahlung erhalten: ${Math.round(pay.amount)}€ von ${cust?.name ?? 'Kunde'}.`, 'success');
  }
  state.scheduledPayments = state.scheduledPayments.filter((p) => p.dueDay > state.totalDays);
}

// --- Auto restock -----------------------------------------------------------

function runAutoRestock(state: GameState): void {
  // Automatic restocking is the Einkäufer's job — until one is hired, procurement
  // is fully manual.
  if (!hasEinkaeufer(state)) return;
  for (const product of state.products) {
    const rule = product.autoRestock;
    if (!rule.enabled) continue;
    const projected = inventoryTotal(product) + incomingPO(state, product.id);
    if (projected >= rule.min) continue;
    const qty = Math.max(0, rule.target - projected);
    if (qty <= 0) continue;
    const supplierProduct = state.supplier.products.find((sp) => sp.productId === product.id);
    if (!supplierProduct) continue;
    const cost = qty * supplierProduct.price;
    if (state.cash + availableCredit(state) < cost) continue; // can't afford, skip quietly
    createPurchaseOrderInternal(state, [{ productId: product.id, quantity: qty }]);
    notify(state, `🔄 Auto-Nachbestellung: ${qty}× ${product.name}.`, 'info');
  }
}

/** Shared PO creation used by both the player action and auto-restock. */
export function createPurchaseOrderInternal(
  state: GameState,
  items: { productId: ProductId; quantity: number }[],
): boolean {
  let total = 0;
  const poItems = items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const sp = state.supplier.products.find((s) => s.productId === i.productId)!;
      total += i.quantity * sp.price;
      return { productId: i.productId, quantity: i.quantity, pricePerUnit: sp.price };
    });
  if (poItems.length === 0) return false;

  spend(state, total);
  state.weekAcc.purchases += total;
  state.purchaseOrders.push({
    id: uid('po'),
    items: poItems,
    orderDay: state.totalDays,
    deliveryDay: state.totalDays + 7,
    totalCost: total,
    status: 'pending',
  });
  return true;
}

// --- Inquiries --------------------------------------------------------------

function unlockedTypes(state: GameState): CustomerType[] {
  const rev = recentWeeklyRevenue(state);
  const types: CustomerType[] = ['small'];
  if (rev >= MEDIUM_UNLOCK_REVENUE) types.push('medium');
  if (rev >= LARGE_UNLOCK_REVENUE) types.push('large');
  return types;
}

/** Bias new inquiries toward products we already sell, so a new customer's
 * first order isn't guaranteed late by the supplier lead time. Only products in
 * the current assortment can ever be requested. */
function pickInquiryProduct(state: GameState): ProductId {
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

function maybeGenerateInquiry(state: GameState): void {
  if (Math.random() > INQUIRY_CHANCE_PER_WEEK) return;
  const week = weekOf(state.totalDays);
  // Prefer a type that currently has free capacity.
  const candidates = unlockedTypes(state).filter((t) => freeCapacity(state, t) > 0);
  const type = candidates.length > 0 ? pick(candidates) : 'small';
  const [minV, maxV] = CUSTOMER_VOLUME_RANGE[type];
  const preferred = pickInquiryProduct(state);
  const product = getProduct(state, preferred);
  const inquiry: Inquiry = {
    id: uid('inq'),
    name: uniqueCustomerName(state, type),
    emoji: CUSTOMER_EMOJI[type],
    type,
    preferredProduct: preferred,
    suggestedVolume: randInt(minV, maxV),
    targetPrice: Math.round(product.verkaufspreis * randRange(0.92, 1.02) * 2) / 2,
    createdWeek: week,
    expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
    status: 'open',
  };
  state.inquiries.push(inquiry);
  notify(state, `📨 Neue Kundenanfrage: ${inquiry.name} (${type}) sucht ${product.name}.`, 'info');
}

/** An existing loyal customer asks to add another in-assortment product line. */
function maybeGenerateExpansionInquiry(state: GameState): void {
  if (Math.random() > EXPANSION_INQUIRY_CHANCE_PER_WEEK) return;
  const week = weekOf(state.totalDays);
  const assortment = state.products.map((p) => p.id);
  const eligible = state.customers.filter(
    (c) =>
      c.active &&
      c.loyalty >= EXPANSION_MIN_LOYALTY &&
      assortment.some((pid) => !c.lines.some((l) => l.productId === pid)),
  );
  if (eligible.length === 0) return;
  const cust = pick(eligible);
  const missing = assortment.filter((pid) => !cust.lines.some((l) => l.productId === pid));
  const productId = pick(missing);
  const product = getProduct(state, productId);
  const [minV, maxV] = CUSTOMER_VOLUME_RANGE[cust.type];
  const inquiry: Inquiry = {
    id: uid('inq'),
    name: cust.name,
    emoji: cust.emoji,
    type: cust.type,
    existingCustomerId: cust.id,
    preferredProduct: productId,
    suggestedVolume: randInt(minV, maxV),
    targetPrice: Math.round(product.verkaufspreis * randRange(0.92, 1.02) * 2) / 2,
    createdWeek: week,
    expiryWeek: week + INQUIRY_EXPIRY_WEEKS,
    status: 'open',
  };
  state.inquiries.push(inquiry);
  notify(state, `🔁 ${cust.name} möchte zusätzlich ${product.emoji} ${product.name} beziehen.`, 'info');
}

function makeLine(inq: Inquiry, price: number): CustomerLine {
  return {
    productId: inq.preferredProduct,
    price, // accepted price (target price, or the player's counter offer)
    volume: inq.suggestedVolume, // fixed quantity
  };
}

/** Probability a customer accepts a counter offer at `price`. At or below the
 * target it's certain; above target it drops off the greedier the ask. */
export function counterAcceptChance(targetPrice: number, price: number): number {
  if (price <= targetPrice) return 1;
  return clamp(1 - (price / targetPrice - 1) * 2.5, 0.05, 1);
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
    notify(
      state,
      `🎉 ${cust.name} nimmt zusätzlich ${product.emoji} ${product.name} ab! ${inq.suggestedVolume}× @ ${price}€.`,
      'success',
    );
    return;
  }

  const customer: Customer = {
    id: uid('cust'),
    name: inq.name,
    emoji: inq.emoji,
    type: inq.type,
    lines: [makeLine(inq, price)],
    orderDayOfWeek: randInt(0, 5), // Mon-Sat
    nextOrderWeek: week + 1, // one-week grace to pre-stock before the first order
    serviceRating: 3,
    loyalty: 60,
    lateDeliveries: 0,
    deliveryLeadWeeks: CUSTOMER_LEAD_WEEKS[inq.type],
    volatility: CUSTOMER_VOLATILITY[inq.type],
    activeDiscount: 0,
    active: true,
  };
  state.customers.push(customer);
  inq.status = 'accepted';
  notify(state, `🎉 ${inq.name} ist jetzt Kunde! ${inq.suggestedVolume}× @ ${price}€.`, 'success');
}

function expireInquiries(state: GameState): void {
  const week = weekOf(state.totalDays);
  for (const inq of state.inquiries) {
    if (inq.status === 'open' && inq.expiryWeek <= week) {
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

  // 2. Supplier price increase (Einkäufer can soften it).
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
    if (skill > 0) {
      notify(
        state,
        `📈 ${product.name}: Lieferant wollte +${(pct * 100).toFixed(0)}%. Einkäufer verhandelt auf +${(effective * 100).toFixed(1)}% (${oldPrice}€ → ${sp.price}€).`,
        'warn',
      );
    } else {
      notify(
        state,
        `📈 Preiserhöhung ${product.name}: ${oldPrice}€ → ${sp.price}€ (+${(effective * 100).toFixed(0)}%). Ein Einkäufer könnte verhandeln.`,
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

  // 2. Close the ended week's report.
  const acc = state.weekAcc;
  const profit = acc.revenue - acc.purchases - acc.salaries - acc.logistics - acc.interest;
  state.stats.totalProfit += profit;
  state.reports.push({
    week: endedWeek,
    revenue: acc.revenue,
    purchases: acc.purchases,
    salaries: acc.salaries,
    logistics: acc.logistics,
    spoilageLoss: acc.spoilageLoss,
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
    logistics: 0,
    spoilageLoss: 0,
    interest: 0,
    deliveredOrders: 0,
    lateOrders: 0,
  };

  // 5. Quarterly triggers (start of a new quarter, not week 0).
  if (newWeek % 13 === 0 && newWeek > 0 && newWeek < WEEKS_PER_YEAR) {
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

  // 6. Customer acquisition pipeline.
  expireInquiries(state);
  const hasFreeCapacity = (['small', 'medium', 'large'] as CustomerType[]).some(
    (t) => freeCapacity(state, t) > 0,
  );
  if (hasFreeCapacity) maybeGenerateInquiry(state);
  maybeGenerateExpansionInquiry(state);

  // 7. Salaries for the new week.
  const totalSalary = state.employees.reduce((s, e) => s + e.salary, 0);
  spend(state, totalSalary);
  state.weekAcc.salaries += totalSalary;

  // 8. Weekly report notification.
  notify(
    state,
    `📊 Wochenreport W${endedWeek}: Gewinn ${profit >= 0 ? '+' : ''}${Math.round(profit)}€, Kasse ${Math.round(state.cash)}€.`,
    profit >= 0 ? 'success' : 'warn',
  );

  // 9. Year complete?
  if (newWeek >= WEEKS_PER_YEAR) {
    state.yearComplete = true;
    state.paused = true;
    notify(state, `🏁 Jahr geschafft! 52 Wochen abgeschlossen. Siehe Jahresbericht.`, 'success');
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

  runAutoRestock(state);
}

// --- Main advance -----------------------------------------------------------

export function advance(state: GameState, realDeltaMs: number): void {
  if (state.paused || state.gameOver || state.yearComplete) return;

  // Cap the delta so a long pause (e.g. hidden tab) can't skip events.
  const cappedMs = Math.min(realDeltaMs, 250);
  const deltaDays = (cappedMs / 1000 / SECONDS_PER_DAY_AT_1X) * state.speed;
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

  // Continuous & idempotent updates.
  updateEmployees(state, deltaDays);
  autoAssignWork(state);
  receiveDuePurchaseOrders(state);
  collectDuePayments(state);

  // Bankruptcy check.
  if (state.cash <= BANKRUPTCY_CASH && availableCredit(state) <= 0) {
    state.gameOver = true;
    state.paused = true;
    notify(state, `💀 Insolvenz! Das Geschäft ist pleite. Spiel vorbei.`, 'error');
  }
}
