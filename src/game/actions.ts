// ============================================================================
// Player actions. Each function mutates the GameState directly and returns a
// small result so the UI can show feedback. These are the only ways the player
// influences the simulation (everything else runs automatically in advance()).
// ============================================================================

import {
  DESK_PRICE,
  EXPRESS_PO_LEAD_DAYS,
  EXPRESS_RESTOCK_SURCHARGE,
  getProductDef,
  hallExpansionPrice,
  HIRE_WEEKS_UPFRONT,
  INBOUND_SLOT_PRICE,
  officeExpansionPrice,
  PALETTE_SIZE,
  ROLE_LABEL,
  ROLE_SALARY,
  SHELF_PRICE,
  SHELF_SLOTS,
  TABLE_PRICE,
  TRAINING_COST,
  TRAINING_SKILL_GAIN,
} from './constants';
import type { GameState, ProductId, Role } from './types';
import {
  acceptInquiry as onboardInquiry,
  availableCredit,
  commitWeeklyOrder,
  counterAcceptChance,
  createPurchaseOrderInternal,
  freeCapacity,
  freeDesks,
  getProduct,
  isFrontierBlock,
  isInAssortment,
  notify,
  releaseWorkerTask,
  spend,
  tryPrepareOrder,
} from './simulation';
import { buildProduct } from './init';
import { clamp, uid, weekOf } from './util';
import { STEP } from './tutorial';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

// --- Purchasing -------------------------------------------------------------

/**
 * Place (or override) the current week's order — the [BESTELLEN] action of the
 * Monday order screen. Sends all products in one shot; any order already placed
 * this week is refunded and replaced, so this doubles as the [ÜBERSCHREIBEN]
 * action. Ordering nothing is allowed and simply clears the week's prompt.
 */
export function placeWeeklyOrder(
  state: GameState,
  items: { productId: ProductId; quantity: number }[],
): ActionResult {
  const valid = items.filter((i) => i.quantity > 0);
  let total = 0;
  for (const item of valid) {
    const sp = state.supplier.products.find((s) => s.productId === item.productId)!;
    total += item.quantity * sp.price;
  }
  // commitWeeklyOrder refunds this week's existing order first, so that amount is
  // available again toward the new one.
  const current = state.purchaseOrders.find(
    (p) => p.id === state.currentWeekPoId && p.status === 'pending',
  );
  const refundable = current ? current.totalCost : 0;
  if (state.cash + availableCredit(state) + refundable < total) {
    return { ok: false, message: `Nicht genug Kapital (${Math.round(total)}€ nötig).` };
  }

  const po = commitWeeklyOrder(state, valid);
  if (po) {
    notify(
      state,
      `🛒 Wochenbestellung aufgegeben (${Math.round(po.totalCost)}€) – Lieferung nächsten Montag.`,
      'info',
    );
  } else {
    notify(state, `➖ Diese Woche nichts bestellt.`, 'info');
  }
  return { ok: true };
}

// --- Pricing ----------------------------------------------------------------

export function setSalesPrice(state: GameState, productId: ProductId, price: number): void {
  const product = getProduct(state, productId);
  product.verkaufspreis = Math.max(0, Math.round(price * 100) / 100);
}

export function setTargetMargin(state: GameState, productId: ProductId, margin: number): void {
  const product = getProduct(state, productId);
  product.zielmarge = clamp(margin, 0, 90);
}

/** Set the sales price from the target margin: price = cost / (1 - margin). */
export function applyAutoPrice(state: GameState, productId: ProductId): void {
  const product = getProduct(state, productId);
  const m = clamp(product.zielmarge, 0, 89) / 100;
  const price = product.einkaufspreis / (1 - m);
  product.verkaufspreis = Math.round(price * 2) / 2;
}

export function setAutoRestock(
  state: GameState,
  productId: ProductId,
  rule: { enabled: boolean; min: number; target: number },
): void {
  const product = getProduct(state, productId);
  product.autoRestock = {
    enabled: rule.enabled,
    min: Math.max(0, Math.round(rule.min)),
    target: Math.max(0, Math.round(rule.target)),
  };
}

// --- Assortment -------------------------------------------------------------

/** Add a newly unlocked product group to the assortment (pays the listing fee,
 * adds the supplier offering). The player can then pre-stock it before taking on
 * customers for it. */
export function addProduct(state: GameState, productId: ProductId): ActionResult {
  if (isInAssortment(state, productId)) {
    return { ok: false, message: 'Produkt ist bereits im Sortiment.' };
  }
  const def = getProductDef(productId);
  if (weekOf(state.totalDays) < def.unlockWeek) {
    return { ok: false, message: `Erst ab Woche ${def.unlockWeek + 1} verfügbar.` };
  }
  if (state.cash + availableCredit(state) < def.listingFee) {
    return { ok: false, message: `Listungsgebühr ${def.listingFee}€ nicht bezahlbar.` };
  }

  state.products.push(buildProduct(def));
  state.supplier.products.push({
    productId: def.id,
    price: def.einkaufspreis,
    basePrice: def.einkaufspreis,
  });
  if (def.listingFee > 0) {
    spend(state, def.listingFee);
    state.weekAcc.purchases += def.listingFee;
  }
  notify(
    state,
    `🧺 ${def.emoji} ${def.name} ins Sortiment aufgenommen! Jetzt einkaufen & bevorraten, bevor du Kunden gewinnst.`,
    'success',
  );
  return { ok: true };
}

// --- Order fulfilment (manual) ----------------------------------------------

export function prepareOrder(state: GameState, orderId: string): ActionResult {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: 'Auftrag nicht gefunden.' };
  const err = tryPrepareOrder(state, order);
  if (err) return { ok: false, message: err };
  notify(state, `👷 Herrichtung gestartet: ${order.quantity}× Auftrag.`, 'info');
  return { ok: true };
}

/**
 * Emergency express restock for one order's shortfall. Off the weekly Monday
 * cycle, so it ships fast — but the purchase price carries a +20% surcharge.
 */
export function restockForOrder(state: GameState, orderId: string): ActionResult {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: 'Auftrag nicht gefunden.' };
  const product = getProduct(state, order.productId);
  const have = product.batches.reduce((s, b) => s + b.quantity, 0);
  const shortfall = Math.max(0, order.quantity - have);
  if (shortfall === 0) return { ok: false, message: 'Genug Bestand vorhanden.' };

  const sp = state.supplier.products.find((s) => s.productId === order.productId)!;
  const surcharge = 1 + EXPRESS_RESTOCK_SURCHARGE;
  const cost = shortfall * sp.price * surcharge;
  if (state.cash + availableCredit(state) < cost) {
    return { ok: false, message: `Express-Nachbestellung ${Math.round(cost)}€ nicht bezahlbar.` };
  }

  createPurchaseOrderInternal(state, [{ productId: order.productId, quantity: shortfall }], {
    priceMultiplier: surcharge,
    leadDays: EXPRESS_PO_LEAD_DAYS,
  });
  notify(
    state,
    `🚀 Express-Nachbestellung: ${shortfall}× ${product.name} (+${Math.round(EXPRESS_RESTOCK_SURCHARGE * 100)}% Aufschlag = ${Math.round(cost)}€, Lieferung in ${EXPRESS_PO_LEAD_DAYS} Tagen).`,
    'warn',
  );
  return { ok: true };
}

// --- Employees --------------------------------------------------------------

export function hireEmployee(state: GameState, role: Role): ActionResult {
  const salary = ROLE_SALARY[role];
  const upfront = salary * HIRE_WEEKS_UPFRONT;
  // Office roles need a free desk to sit at (warehouse workers don't).
  if (role !== 'lager' && freeDesks(state) <= 0) {
    return { ok: false, message: 'Kein freier Arbeitsplatz – baue erst einen Schreibtisch im Büro.' };
  }
  if (state.cash + availableCredit(state) < upfront) {
    return { ok: false, message: `Einstellung kostet ${upfront}€ (4 Wochen im Voraus).` };
  }
  const count = state.employees.filter((e) => e.role === role).length + 1;
  const name = `${ROLE_LABEL[role]} ${count}`;
  spend(state, upfront);
  state.weekAcc.salaries += upfront;
  state.employees.push({
    id: uid('emp'),
    name,
    role,
    salary,
    skill: 45,
  });
  notify(state, `🧑‍💼 ${name} eingestellt (${salary}€/Woche, ${upfront}€ Vorkasse).`, 'success');

  // A newly hired Einkäufer takes over the weekly Monday order: from now on the
  // recommended quantities are ordered automatically (the player can still
  // override). No more manual Monday prompt.
  if (role === 'einkaeufer') {
    state.pendingOrderWeek = null;
    notify(
      state,
      `📦 ${name} übernimmt ab jetzt die wöchentliche Bestellung (jeden Montag automatisch).`,
      'info',
    );
  }
  return { ok: true };
}

export function trainEmployee(state: GameState, employeeId: string): ActionResult {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, message: 'Mitarbeiter nicht gefunden.' };
  if (emp.skill >= 100) return { ok: false, message: 'Skill bereits bei 100.' };
  if (state.cash + availableCredit(state) < TRAINING_COST) {
    return { ok: false, message: `Training kostet ${TRAINING_COST}€.` };
  }
  spend(state, TRAINING_COST);
  state.weekAcc.salaries += TRAINING_COST;
  emp.skill = Math.min(100, emp.skill + TRAINING_SKILL_GAIN);
  notify(state, `🎓 ${emp.name} trainiert – Skill jetzt ${emp.skill}.`, 'success');
  return { ok: true };
}

export function fireEmployee(state: GameState, employeeId: string): ActionResult {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, message: 'Mitarbeiter nicht gefunden.' };
  // A running task is released cleanly (order back to the queue, goods
  // returned) instead of blocking the dismissal — nothing is lost or duplicated.
  const hadTask = !!emp.task;
  if (hadTask) releaseWorkerTask(state, employeeId);
  state.employees = state.employees.filter((e) => e.id !== employeeId);
  notify(
    state,
    `👋 ${emp.name} wurde entlassen.${hadTask ? ' Die laufende Aufgabe geht zurück in die Warteschlange.' : ''}`,
    'info',
  );
  return { ok: true };
}

// --- Customers --------------------------------------------------------------

export function setDiscount(state: GameState, customerId: string, discount: number): void {
  const cust = state.customers.find((c) => c.id === customerId);
  if (!cust) return;
  cust.activeDiscount = clamp(discount, 0, 0.2);
}

/**
 * Change the agreed price on one of a customer's product lines. Raising it (to
 * defend a margin the supplier has eroded) costs loyalty, scaled by how steep the
 * hike is and dampened by the customer's satisfaction (service stars): a happy
 * customer swallows more. Uses only the existing loyalty lever — no new mechanic.
 * Small hikes (< 2 %) and price cuts are free.
 */
export function setCustomerLinePrice(
  state: GameState,
  customerId: string,
  productId: ProductId,
  newPrice: number,
): ActionResult {
  const cust = state.customers.find((c) => c.id === customerId);
  if (!cust) return { ok: false, message: 'Kunde nicht gefunden.' };
  const line = cust.lines.find((l) => l.productId === productId);
  if (!line) return { ok: false, message: 'Produktlinie nicht gefunden.' };

  const oldPrice = line.price;
  const price = Math.max(0, Math.round(newPrice * 100) / 100);
  line.price = price;

  const increase = oldPrice > 0 ? price / oldPrice - 1 : 0;
  if (increase > 0.02) {
    // Stars above 3 dampen the hit, below 3 amplify it; clamp to a sane band.
    const starDamp = clamp(1 - (cust.serviceRating - 3) * 0.15, 0.4, 1.3);
    const penalty = clamp(increase * 120 * starDamp, 0, 40);
    if (penalty >= 1) {
      cust.loyalty = clamp(cust.loyalty - penalty, 0, 100);
      notify(
        state,
        `⚠️ ${cust.name} akzeptiert den höheren Preis (+${Math.round(increase * 100)}%) widerwillig – Loyalität −${Math.round(penalty)}%.`,
        'warn',
      );
    }
  }
  return { ok: true };
}

// --- Inquiries --------------------------------------------------------------

/** Accept an inquiry directly: the product is unlocked for the customer
 * immediately, at the inquiry's desired price and fixed volume. */
export function acceptInquiry(state: GameState, inquiryId: string): ActionResult {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq) return { ok: false, message: 'Anfrage nicht gefunden.' };
  if (inq.status !== 'open') {
    return { ok: false, message: 'Anfrage ist nicht mehr offen.' };
  }
  // New customers need free KAM capacity; expansions of existing customers don't.
  if (!inq.existingCustomerId && freeCapacity(state, inq.type) <= 0) {
    return { ok: false, message: 'Keine KAM-Kapazität für diesen Kundentyp frei.' };
  }
  onboardInquiry(state, inq);
  return { ok: true };
}

/** Counter an inquiry with your own price (fixed volume). Resolves immediately:
 * the customer accepts (onboarding at your price) with a chance that drops the
 * higher you push above their target; on rejection the deal falls through. */
export function counterOffer(state: GameState, inquiryId: string, price: number): ActionResult {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq) return { ok: false, message: 'Anfrage nicht gefunden.' };
  if (inq.status !== 'open') {
    return { ok: false, message: 'Anfrage ist nicht mehr offen.' };
  }
  if (!inq.existingCustomerId && freeCapacity(state, inq.type) <= 0) {
    return { ok: false, message: 'Keine KAM-Kapazität für diesen Kundentyp frei.' };
  }
  const offered = Math.max(1, Math.round(price * 100) / 100);
  // During the tutorial's growth beat the customer deliberately says yes, so the
  // player's first negotiation is a guaranteed success.
  const tutorialForcesYes = state.tutorial?.active && state.tutorial.step === STEP.GROWTH;
  if (tutorialForcesYes || Math.random() < counterAcceptChance(inq.targetPrice, offered)) {
    onboardInquiry(state, inq, offered);
    return { ok: true };
  }
  inq.status = 'expired';
  notify(state, `✗ ${inq.name} lehnt dein Gegenangebot (${offered}€) ab – der Deal ist geplatzt.`, 'warn');
  return { ok: true };
}

export function dismissInquiry(state: GameState, inquiryId: string): void {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (inq) inq.status = 'expired';
}

// --- Finance ----------------------------------------------------------------

export function takeCredit(state: GameState, amount: number): ActionResult {
  const avail = availableCredit(state);
  const amt = Math.min(Math.max(0, amount), avail);
  if (amt <= 0) return { ok: false, message: 'Kein Kreditrahmen verfügbar.' };
  state.bankCredit += amt;
  state.cash += amt;
  notify(state, `🏦 Kredit aufgenommen: ${Math.round(amt)}€.`, 'info');
  return { ok: true };
}

export function repayCredit(state: GameState, amount: number): ActionResult {
  const amt = Math.min(Math.max(0, amount), state.bankCredit, Math.max(0, state.cash));
  if (amt <= 0) return { ok: false, message: 'Nichts zurückzuzahlen oder kein Bargeld.' };
  state.bankCredit -= amt;
  state.cash -= amt;
  notify(state, `🏦 Kredit getilgt: ${Math.round(amt)}€.`, 'success');
  return { ok: true };
}

// --- Build mode (warehouse) -------------------------------------------------

function tileFree(state: GameState, gx: number, gy: number): boolean {
  return (
    !state.warehouse.shelves.some((s) => s.gx === gx && s.gy === gy) &&
    !state.warehouse.tables.some((t) => t.gx === gx && t.gy === gy) &&
    !state.warehouse.desks.some((d) => d.gx === gx && d.gy === gy)
  );
}

/** Build a shelf (+4 pallet slots) on a free storage tile. Fixed price. */
export function buildShelf(state: GameState, gx: number, gy: number): ActionResult {
  const tile = state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'storage') return { ok: false, message: 'Nur in der Lagerzone platzierbar.' };
  if (!tileFree(state, gx, gy)) return { ok: false, message: 'Kachel bereits belegt.' };
  if (state.cash + availableCredit(state) < SHELF_PRICE) return { ok: false, message: `Regal kostet ${SHELF_PRICE}€.` };
  spend(state, SHELF_PRICE);
  state.warehouse.shelves.push({ id: uid('shelf'), gx, gy });
  notify(state, `🧱 Regal gebaut (${SHELF_PRICE}€) – +${SHELF_SLOTS * PALETTE_SIZE} Lagerplätze.`, 'info');
  return { ok: true };
}

/** Build a prep table on a free storage tile — more parallel Herrichtung. */
export function buildTable(state: GameState, gx: number, gy: number): ActionResult {
  const tile = state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'storage') return { ok: false, message: 'Nur in der Lagerzone platzierbar.' };
  if (!tileFree(state, gx, gy)) return { ok: false, message: 'Kachel bereits belegt.' };
  if (state.cash + availableCredit(state) < TABLE_PRICE) return { ok: false, message: `Tisch kostet ${TABLE_PRICE}€.` };
  spend(state, TABLE_PRICE);
  state.warehouse.tables.push({ gx, gy });
  notify(state, `🔧 Vorbereitungstisch gebaut (${TABLE_PRICE}€) – mehr paralleles Herrichten.`, 'info');
  return { ok: true };
}

/** Add an inbound pallet slot (Wareneingang +1) on a free ramp tile. */
export function buildInboundSlot(state: GameState, gx: number, gy: number): ActionResult {
  const tile = state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'ramp') return { ok: false, message: 'Nur im Rampenbereich platzierbar.' };
  const rampCount = state.warehouse.tiles.filter((t) => t.zone === 'ramp').length;
  if (state.warehouse.inboundSlots + state.warehouse.abholzone >= rampCount) {
    return { ok: false, message: 'Kein Platz mehr im Rampenbereich.' };
  }
  if (state.cash + availableCredit(state) < INBOUND_SLOT_PRICE) return { ok: false, message: `Anlieferungsplatz kostet ${INBOUND_SLOT_PRICE}€.` };
  spend(state, INBOUND_SLOT_PRICE);
  state.warehouse.inboundSlots += 1;
  notify(state, `📥 Anlieferungsplatz gebaut (${INBOUND_SLOT_PRICE}€) – Wareneingang +${PALETTE_SIZE}.`, 'info');
  return { ok: true };
}

/** Expand the hall by one 2×2 block (4 storage tiles). Only scaling cost. The
 * block must be on the current expansion frontier (dynamically recomputed from
 * the hall shape), so UI and mutation can never disagree. */
export function expandHall(state: GameState, block: { gx: number; gy: number }[]): ActionResult {
  if (!isFrontierBlock(state, 'hall', block)) {
    return { ok: false, message: 'Hier kann die Halle nicht erweitert werden.' };
  }
  const price = hallExpansionPrice(state.warehouse.expansions);
  if (state.cash + availableCredit(state) < price) return { ok: false, message: `Erweiterung kostet ${price}€.` };
  for (const c of block) {
    if (!state.warehouse.tiles.some((t) => t.gx === c.gx && t.gy === c.gy)) {
      state.warehouse.tiles.push({ gx: c.gx, gy: c.gy, zone: 'storage' });
    }
  }
  spend(state, price);
  state.warehouse.expansions += 1;
  notify(state, `🏗️ Halle erweitert (${price}€) – 4 neue Lagerkacheln.`, 'info');
  return { ok: true };
}

/** Build an office desk on a free office tile — seats one office employee. */
export function buildDesk(state: GameState, gx: number, gy: number): ActionResult {
  const tile = state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'office') return { ok: false, message: 'Nur im Bürobereich platzierbar.' };
  if (!tileFree(state, gx, gy)) return { ok: false, message: 'Kachel bereits belegt.' };
  if (state.cash + availableCredit(state) < DESK_PRICE) return { ok: false, message: `Arbeitsplatz kostet ${DESK_PRICE}€.` };
  spend(state, DESK_PRICE);
  state.warehouse.desks.push({ gx, gy });
  notify(state, `🪑 Arbeitsplatz gebaut (${DESK_PRICE}€) – Platz für einen Büro-Mitarbeiter.`, 'info');
  return { ok: true };
}

/** Expand the office by one 2×2 block (4 office tiles). Only scaling cost. The
 * block must be on the current office expansion frontier. */
export function expandOffice(state: GameState, block: { gx: number; gy: number }[]): ActionResult {
  if (!isFrontierBlock(state, 'office', block)) {
    return { ok: false, message: 'Hier kann das Büro nicht erweitert werden.' };
  }
  const price = officeExpansionPrice(state.warehouse.officeExpansions);
  if (state.cash + availableCredit(state) < price) return { ok: false, message: `Bürogebiet kostet ${price}€.` };
  for (const c of block) {
    if (!state.warehouse.tiles.some((t) => t.gx === c.gx && t.gy === c.gy)) {
      state.warehouse.tiles.push({ gx: c.gx, gy: c.gy, zone: 'office' });
    }
  }
  spend(state, price);
  state.warehouse.officeExpansions += 1;
  notify(state, `🏢 Bürogebiet erweitert (${price}€) – 4 neue Bürokacheln.`, 'info');
  return { ok: true };
}
