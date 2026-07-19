// ============================================================================
// Player actions. Each function mutates the GameState directly and returns a
// small result so the UI can show feedback. These are the only ways the player
// influences the simulation (everything else runs automatically in advance()).
// ============================================================================

import {
  CONTRACT_PREMIUM,
  CONTRACT_WEEKS,
  COOL_TILE_PRICE,
  DEMOLISH_REFUND,
  DESK_PRICE,
  EXPRESS_PO_LEAD_DAYS,
  EXPRESS_RESTOCK_SURCHARGE,
  getEquipmentDef,
  getProductDef,
  getStrategyDef,
  hallExpansionPrice,
  HIRE_WEEKS_UPFRONT,
  INBOUND_SLOT_PRICE,
  officeExpansionPrice,
  PALETTE_SIZE,
  RENT_PER_EXPANSION,
  REPRICE_COOLDOWN_WEEKS,
  REPRICE_FAIL_LOYALTY_COST,
  REPRICE_SUCCESS_LOYALTY_COST,
  REPRICE_TOLERANCE,
  ROLE_LABEL,
  ROLE_SALARY,
  SHELF_PRICE,
  SLOT_COST,
  SHELF_SLOTS,
  STRATEGY_COOLDOWN_WEEKS,
  supplierDeliversTo,
  SITE_META,
  BRANCH_PRICE,
  BRANCH_UNLOCK_MONTHLY,
  monthlyRevenue,
  TRANSFER_COST_PER_PALLET,
  TRANSFER_DAYS,
  TABLE_PRICE,
  TRAINING_COST,
  TRAINING_SKILL_GAIN,
} from './constants';
import type { CustomerLine, EquipmentId, GameState, Order, ProductId, Role, SiteId, StrategyId } from './types';
import {
  acceptInquiry as onboardInquiry,
  availableCredit,
  coldShelfCapacity,
  coldShelfUsed,
  commitWeeklyOrder,
  counterAcceptChance,
  createPurchaseOrderInternal,
  equipmentLevel,
  isCoolTile,
  normalShelfCapacity,
  normalShelfUsed,
  freeCapacity,
  freeDesks,
  getProduct,
  hasActiveContract,
  isFrontierBlock,
  isInAssortment,
  managers,
  notify,
  placementBlocksAccess,
  releaseWorkerTask,
  repriceAcceptChance,
  resolveDemandRejection,
  branchOpen,
  siteOfOrder,
  shelfStock,
  warehouseOf,
  spend,
  supplierUnitPrice,
  tryPrepareOrder,
} from './simulation';
import { buildProduct, makeBranchWarehouse } from './init';
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
  site: SiteId = 'hq',
): ActionResult {
  const valid = items.filter((i) => i.quantity > 0 && supplierDeliversTo(i.productId, site));
  let total = 0;
  for (const item of valid) {
    const sp = state.supplier.products.find((s) => s.productId === item.productId)!;
    total += item.quantity * sp.price;
  }
  // commitWeeklyOrder refunds this week's existing order first, so that amount is
  // available again toward the new one.
  const currentId = site === 'sued' ? state.currentWeekPoIdSued : state.currentWeekPoId;
  const current = state.purchaseOrders.find(
    (p) => p.id === currentId && p.status === 'pending',
  );
  const refundable = current ? current.totalCost : 0;
  if (state.cash + availableCredit(state) + refundable < total) {
    return { ok: false, message: `Nicht genug Kapital (${Math.round(total)}€ nötig).` };
  }

  const po = commitWeeklyOrder(state, valid, site);
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
  if (def.requiresCooling && coldShelfCapacity(state) === 0) {
    notify(
      state,
      `❄️ ${def.name} ist kühlpflichtig – markiere im Bau-Modus einen Kühlbereich (${COOL_TILE_PRICE}€/Kachel) und stelle Regale hinein, sonst verdirbt die Ware schnell!`,
      'warn',
    );
  }
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

  const site = siteOfOrder(state, order);
  if (!supplierDeliversTo(order.productId, site)) {
    return {
      ok: false,
      message: `Der Lieferant bringt ${product.name} nicht nach ${SITE_META[site].short} – per 🚚 Transfer vom anderen Standort beschaffen.`,
    };
  }
  createPurchaseOrderInternal(state, [{ productId: order.productId, quantity: shortfall }], {
    priceMultiplier: surcharge,
    leadDays: EXPRESS_PO_LEAD_DAYS,
    siteId: site,
  });
  notify(
    state,
    `🚀 Express-Nachbestellung: ${shortfall}× ${product.name} (+${Math.round(EXPRESS_RESTOCK_SURCHARGE * 100)}% Aufschlag = ${Math.round(cost)}€, Lieferung in ${EXPRESS_PO_LEAD_DAYS} Tagen).`,
    'warn',
  );
  return { ok: true };
}

// --- Employees --------------------------------------------------------------

export function hireEmployee(state: GameState, role: Role, site: SiteId = 'hq'): ActionResult {
  const salary = ROLE_SALARY[role];
  const upfront = salary * HIRE_WEEKS_UPFRONT;
  // Office roles need a free desk to sit at (warehouse workers don't) — die
  // Verwaltung sitzt IMMER zentral im Hauptlager (Konzern-Regel, L3).
  if (role !== 'lager' && freeDesks(state) <= 0) {
    return { ok: false, message: 'Kein freier Arbeitsplatz – baue erst einen Schreibtisch im Büro.' };
  }
  if (role !== 'lager' && site !== 'hq') {
    return { ok: false, message: 'Büro-Personal sitzt zentral im Hauptlager.' };
  }
  if (site === 'sued' && !state.branchWarehouse) {
    return { ok: false, message: 'Standort Süd ist noch nicht eröffnet.' };
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
    siteId: role === 'lager' && site === 'sued' ? 'sued' : undefined,
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

/** Try to move all of `managerId`'s active customers to the other managers
 * (largest slot cost first, fullest-fitting target). Plans first, applies only
 * if EVERY customer finds room — never loses a customer. */
function redistributeCustomers(state: GameState, managerId: string): boolean {
  const others = managers(state).filter((m) => m.id !== managerId);
  const free = new Map(others.map((m) => [m.id, m.free]));
  const moving = state.customers
    .filter((c) => c.active && c.managerId === managerId)
    .sort((a, b) => SLOT_COST[b.type] - SLOT_COST[a.type]);
  const plan: [string, string][] = [];
  for (const c of moving) {
    const cost = SLOT_COST[c.type];
    let best: string | null = null;
    for (const [id, f] of free) {
      if (f >= cost && (best === null || f > free.get(best)!)) best = id;
    }
    if (best === null) return false;
    free.set(best, free.get(best)! - cost);
    plan.push([c.id, best]);
  }
  for (const [cid, mid] of plan) {
    state.customers.find((c) => c.id === cid)!.managerId = mid;
  }
  return true;
}

export function fireEmployee(state: GameState, employeeId: string): ActionResult {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, message: 'Mitarbeiter nicht gefunden.' };
  // A departing KAM's customers move to managers with free slots — if they
  // don't all fit, the player must re-distribute or hire first (no customer is
  // ever dropped).
  const hadCustomers =
    emp.role === 'kam' && state.customers.some((c) => c.active && c.managerId === emp.id);
  if (hadCustomers && !redistributeCustomers(state, emp.id)) {
    return {
      ok: false,
      message: 'Die Kunden dieses KAM haben bei niemandem Platz – erst Kunden umverteilen oder einen KAM einstellen.',
    };
  }
  // A running task is released cleanly (order back to the queue, goods
  // returned) instead of blocking the dismissal — nothing is lost or duplicated.
  const hadTask = !!emp.task;
  if (hadTask) releaseWorkerTask(state, employeeId);
  state.employees = state.employees.filter((e) => e.id !== employeeId);
  notify(
    state,
    `👋 ${emp.name} wurde entlassen.${hadCustomers ? ' Die betreuten Kunden wurden umverteilt.' : ''}${hadTask ? ' Die laufende Aufgabe geht zurück in die Warteschlange.' : ''}`,
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

/** Move a customer to another manager (Chef or a KAM). The target needs the
 * customer's slot cost free — the minimal re-distribution tool that makes
 * fragmentation dead-ends solvable. */
export function assignCustomerManager(state: GameState, customerId: string, managerId: string): ActionResult {
  const cust = state.customers.find((c) => c.id === customerId);
  if (!cust) return { ok: false, message: 'Kunde nicht gefunden.' };
  if (cust.managerId === managerId) return { ok: true };
  const target = managers(state).find((m) => m.id === managerId);
  if (!target) return { ok: false, message: 'Manager nicht gefunden.' };
  const cost = SLOT_COST[cust.type];
  if (target.free < cost) {
    return { ok: false, message: `${target.name} hat nur ${target.free} freie Slots (${cost} nötig).` };
  }
  cust.managerId = managerId;
  notify(state, `🔀 ${cust.name} wird jetzt von ${target.isChef ? 'dir' : target.name} betreut.`, 'info');
  return { ok: true };
}

/**
 * Change the agreed price on one of a customer's product lines. Raising it (to
 * defend a margin the supplier has eroded) costs loyalty, scaled by how steep the
 * hike is and dampened by the customer's satisfaction (service stars): a happy
 * customer swallows more. Uses only the existing loyalty lever — no new mechanic.
 * Small hikes (< 2 %) and price cuts are free.
 */
/** Weeks until a line may be renegotiated again (0 = free now). */
export function repriceCooldownLeft(state: GameState, line: CustomerLine): number {
  if (line.lastNegotiationWeek == null) return 0;
  return Math.max(0, line.lastNegotiationWeek + REPRICE_COOLDOWN_WEEKS - weekOf(state.totalDays));
}

/**
 * Change a contract line's price. Decreases (and micro-raises inside the
 * tolerance vs the AGREED price) simply apply. A real raise is a NEGOTIATION —
 * the mirror image of the counter offer: the customer may refuse (price stays,
 * loyalty drops), and every attempt locks the line for REPRICE_COOLDOWN_WEEKS.
 * Judged against the last agreed price, so salami steps don't dodge it.
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

  const price = Math.max(0, Math.round(newPrice * 100) / 100);
  if (price === line.price) return { ok: true };

  // Decreases and tolerance-level adjustments are always fine — and become the
  // new agreed baseline (a voluntary cut is a real concession, not a trick).
  if (price <= line.agreedPrice * (1 + REPRICE_TOLERANCE)) {
    line.price = price;
    if (price < line.agreedPrice) line.agreedPrice = price;
    return { ok: true };
  }

  const cooldown = repriceCooldownLeft(state, line);
  if (cooldown > 0) {
    return {
      ok: false,
      message: `${cust.name} will über diesen Preis erst in ${cooldown} Wochen wieder verhandeln.`,
    };
  }

  const week = weekOf(state.totalDays);
  line.lastNegotiationWeek = week;
  const increase = price / line.agreedPrice - 1;
  if (Math.random() < repriceAcceptChance(state, cust, line, price)) {
    line.price = price;
    line.agreedPrice = price;
    cust.loyalty = clamp(cust.loyalty - REPRICE_SUCCESS_LOYALTY_COST, 0, 100);
    notify(
      state,
      `🤝 ${cust.name} akzeptiert den neuen Preis (+${Math.round(increase * 100)}% → ${price}€).`,
      'success',
    );
    return { ok: true };
  }
  cust.loyalty = clamp(cust.loyalty - REPRICE_FAIL_LOYALTY_COST, 0, 100);
  notify(
    state,
    `✗ ${cust.name} lehnt die Preiserhöhung (+${Math.round(increase * 100)}%) ab – der Preis bleibt bei ${line.price}€, Loyalität leidet.`,
    'warn',
  );
  return { ok: false, message: `${cust.name} lehnt ab – frühestens in ${REPRICE_COOLDOWN_WEEKS} Wochen wieder.` };
}

// --- Inquiries --------------------------------------------------------------

/** An inquiry may target a listable-but-unlisted product (Wachstumsmotor A) —
 * accepting then lists it (fee) in the same flow. `dryRun` only validates
 * (unlockWeek + affordability) without paying, so a counter offer can check
 * upfront but only pays once the customer actually says yes. */
function ensureInquiryProductListed(
  state: GameState,
  productId: ProductId,
  opts?: { dryRun?: boolean },
): ActionResult {
  if (isInAssortment(state, productId)) return { ok: true };
  const def = getProductDef(productId);
  const prefix = `Erfordert Listung von ${def.name} (Gebühr ${def.listingFee}€)`;
  if (weekOf(state.totalDays) < def.unlockWeek) {
    return { ok: false, message: `${prefix} – erst ab Woche ${def.unlockWeek + 1} möglich.` };
  }
  if (state.cash + availableCredit(state) < def.listingFee) {
    return { ok: false, message: `${prefix} – Gebühr nicht bezahlbar.` };
  }
  if (opts?.dryRun) return { ok: true };
  const res = addProduct(state, productId);
  if (!res.ok) return { ok: false, message: `${prefix} – ${res.message}` };
  return { ok: true };
}

/** Accept an inquiry directly: the product is unlocked for the customer
 * immediately, at the inquiry's desired price and fixed volume. */
export function acceptInquiry(state: GameState, inquiryId: string): ActionResult {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq) return { ok: false, message: 'Anfrage nicht gefunden.' };
  if (inq.status !== 'open') {
    return { ok: false, message: 'Anfrage ist nicht mehr offen.' };
  }
  // A Großauftrag (Paket 5) is a one-off order, not a new customer relationship —
  // no slots, no new line; the normal pipeline delivers it (or misses it).
  if (inq.bigOrder) return acceptBigOrder(state, inq.id);
  // New customers need SLOT_COST[type] free slots at ONE manager; expansions of
  // existing customers don't (their manager keeps them).
  if (!inq.existingCustomerId && freeCapacity(state, inq.type) <= 0) {
    return {
      ok: false,
      message: `Kein Manager hat ${SLOT_COST[inq.type]} freie Slots – stelle einen KAM ein oder verteile Kunden um.`,
    };
  }
  const listed = ensureInquiryProductListed(state, inq.preferredProduct);
  if (!listed.ok) return listed;
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
  // A Großauftrag is take-it-or-leave-it at the offered price — no haggling.
  if (inq.bigOrder) return { ok: false, message: 'Ein Großauftrag ist nicht verhandelbar – annehmen oder ablehnen.' };
  if (!inq.existingCustomerId && freeCapacity(state, inq.type) <= 0) {
    return {
      ok: false,
      message: `Kein Manager hat ${SLOT_COST[inq.type]} freie Slots – stelle einen KAM ein oder verteile Kunden um.`,
    };
  }
  // Validate listability upfront, but only PAY the fee if the customer accepts —
  // a rejected counter must not leave the player 500€ lighter.
  const listable = ensureInquiryProductListed(state, inq.preferredProduct, { dryRun: true });
  if (!listable.ok) return listable;
  const offered = Math.max(1, Math.round(price * 100) / 100);
  // During the tutorial's growth beat the customer deliberately says yes, so the
  // player's first negotiation is a guaranteed success.
  const tutorialForcesYes = state.tutorial?.active && state.tutorial.step === STEP.GROWTH;
  if (tutorialForcesYes || Math.random() < counterAcceptChance(inq.targetPrice, offered)) {
    const listed = ensureInquiryProductListed(state, inq.preferredProduct);
    if (!listed.ok) return listed;
    onboardInquiry(state, inq, offered);
    return { ok: true };
  }
  inq.status = 'expired';
  notify(state, `✗ ${inq.name} lehnt dein Gegenangebot (${offered}€) ab – der Deal ist geplatzt.`, 'warn');
  // A failed counter on a demand inquiry counts as a rejection: the wish
  // escalates, the ultimatum churns (the player knowingly took the gamble).
  if (inq.demand) resolveDemandRejection(state, inq);
  return { ok: true };
}

/** Accept a Großauftrag (Paket 5): create ONE one-off order for the offering
 * customer, due next week at the premium price. Fulfilment and payment run
 * through the normal order pipeline; missing the deadline hits service like any
 * late order. No slot check, no recurring line. */
export function acceptBigOrder(state: GameState, inquiryId: string): ActionResult {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq || inq.status !== 'open' || !inq.bigOrder) {
    return { ok: false, message: 'Großauftrag ist nicht mehr offen.' };
  }
  const cust = state.customers.find((c) => c.id === inq.existingCustomerId);
  if (!cust || !cust.active) {
    inq.status = 'expired';
    return { ok: false, message: 'Der Kunde ist nicht mehr aktiv.' };
  }
  const listed = ensureInquiryProductListed(state, inq.preferredProduct);
  if (!listed.ok) return listed;

  const order: Order = {
    id: uid('order'),
    customerId: cust.id,
    productId: inq.preferredProduct,
    quantity: inq.bigOrder.quantity,
    price: inq.targetPrice,
    createdDay: state.totalDays,
    dueWeek: inq.bigOrder.dueWeek,
    status: 'pending',
    late: false,
  };
  state.orders.push(order);
  inq.status = 'accepted';
  const product = getProduct(state, inq.preferredProduct);
  notify(
    state,
    `📦 Großauftrag angenommen: ${inq.bigOrder.quantity}× ${product.emoji} ${product.name} für ${cust.name} @ ${inq.targetPrice}€ – bis Woche ${inq.bigOrder.dueWeek} liefern!`,
    'success',
  );
  return { ok: true };
}

export function dismissInquiry(state: GameState, inquiryId: string): void {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq || inq.status !== 'open') return;
  // Dismissing a demand inquiry is an explicit rejection — escalate or churn.
  if (inq.demand) {
    resolveDemandRejection(state, inq);
    return;
  }
  inq.status = 'expired';
}

// --- Investitionen & Ausrüstung (Paket 2) -----------------------------------

/** Buy one more of a piece of equipment: another unit (per-worker device) or the
 * next level (facility). Flat/rising price per the def, capped at def.max. */
export function buyEquipment(state: GameState, id: EquipmentId): ActionResult {
  const def = getEquipmentDef(id);
  const owned = equipmentLevel(state, id);
  if (owned >= def.max) {
    return { ok: false, message: def.kind === 'perWorker' ? 'Maximale Anzahl erreicht.' : 'Bereits voll ausgebaut.' };
  }
  const price = def.price(owned + 1);
  if (state.cash + availableCredit(state) < price) {
    return { ok: false, message: `${def.name} kostet ${price}€ – nicht bezahlbar.` };
  }
  spend(state, price);
  if (!state.equipment) state.equipment = {};
  state.equipment[id] = owned + 1;
  const what = def.kind === 'perWorker' ? `#${owned + 1}` : `Stufe ${owned + 1}`;
  notify(state, `${def.icon} ${def.name} ${what} gekauft (${price}€): ${def.effectLabel(owned + 1)}.`, 'success');
  return { ok: true };
}

// --- Firmen-Strategie (Paket 4) ---------------------------------------------

/** Switch the company strategy. Only every STRATEGY_COOLDOWN_WEEKS weeks, so a
 * stance is a commitment, not a per-week min-max toggle. */
export function setStrategy(state: GameState, id: StrategyId): ActionResult {
  if ((state.strategy ?? 'full') === id) return { ok: true };
  const week = weekOf(state.totalDays);
  const since = week - (state.strategyChangedWeek ?? 0);
  if (state.strategyChangedWeek != null && since < STRATEGY_COOLDOWN_WEEKS) {
    return { ok: false, message: `Strategiewechsel erst in ${STRATEGY_COOLDOWN_WEEKS - since} Woche(n) wieder möglich.` };
  }
  const def = getStrategyDef(id);
  state.strategy = id;
  state.strategyChangedWeek = week;
  notify(state, `${def.icon} Neue Ausrichtung: ${def.name}. ${def.tagline}`, 'info');
  return { ok: true };
}

// --- Liefervertrag (Paket 3) ------------------------------------------------

/** Lock a supply contract: fix today's price (+ a small premium) for
 * CONTRACT_WEEKS weeks, shielding the product from quarterly hikes. */
export function signSupplyContract(state: GameState, productId: ProductId): ActionResult {
  const sp = state.supplier.products.find((s) => s.productId === productId);
  if (!sp) return { ok: false, message: 'Produkt nicht beim Lieferanten.' };
  if (hasActiveContract(state, productId)) return { ok: false, message: 'Es läuft bereits ein Vertrag.' };
  const week = weekOf(state.totalDays);
  const price = Math.round(supplierUnitPrice(state, productId) * (1 + CONTRACT_PREMIUM) * 100) / 100;
  sp.contract = { price, untilWeek: week + CONTRACT_WEEKS };
  const def = getProductDef(productId);
  notify(
    state,
    `📝 Liefervertrag für ${def.name}: EK für ${CONTRACT_WEEKS} Wochen auf €${price.toFixed(2)} fixiert (+${Math.round(CONTRACT_PREMIUM * 100)}% Prämie) – geschützt vor Erhöhungen.`,
    'success',
  );
  return { ok: true };
}

/** Cancel a running supply contract (back to the spot price). */
export function cancelSupplyContract(state: GameState, productId: ProductId): ActionResult {
  const sp = state.supplier.products.find((s) => s.productId === productId);
  if (!sp?.contract) return { ok: false, message: 'Kein Vertrag aktiv.' };
  delete sp.contract;
  const def = getProductDef(productId);
  notify(state, `📝 Liefervertrag für ${def.name} beendet – wieder Spotpreis.`, 'info');
  return { ok: true };
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

function tileFree(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): boolean {
  const w = warehouseOf(state, site);
  return (
    !w.shelves.some((s) => s.gx === gx && s.gy === gy) &&
    !w.tables.some((t) => t.gx === gx && t.gy === gy) &&
    !w.desks.some((d) => d.gx === gx && d.gy === gy)
  );
}

/** Build a shelf (+4 pallet slots) on a free storage tile. Fixed price. */
/** Markiert eine Lager-Kachel als ❄️ Kühlbereich (COOL_TILE_PRICE). Erlaubt auf
 * leeren Lager-Kacheln UND unter bestehenden Regalen (das Regal wird damit zum
 * Kühlregal). Kühlware lagert ausschließlich in Regalen auf solchen Kacheln. */
export function buildCoolZone(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  const tile = w.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'storage') return { ok: false, message: 'Nur in der Lagerzone markierbar.' };
  if (isCoolTile(state, gx, gy, site)) return { ok: false, message: 'Kachel ist bereits Kühlbereich.' };
  if (w.tables.some((t) => t.gx === gx && t.gy === gy)) {
    return { ok: false, message: 'Auf Vorbereitungstischen kein Kühlbereich.' };
  }
  if (state.cash + availableCredit(state) < COOL_TILE_PRICE) {
    return { ok: false, message: `Kühlbereich kostet ${COOL_TILE_PRICE}€ pro Kachel.` };
  }
  spend(state, COOL_TILE_PRICE);
  if (!w.coolTiles) w.coolTiles = [];
  w.coolTiles.push({ gx, gy });
  const hasShelf = w.shelves.some((s) => s.gx === gx && s.gy === gy);
  notify(
    state,
    `❄️ Kühlbereich markiert (${COOL_TILE_PRICE}€)${hasShelf ? ' – das Regal hier ist jetzt ein Kühlregal.' : ' – ein Regal darauf wird zum Kühlregal.'}`,
    'info',
  );
  return { ok: true };
}

export function buildShelf(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  const tile = w.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'storage') return { ok: false, message: 'Nur in der Lagerzone platzierbar.' };
  if (!tileFree(state, gx, gy, site)) return { ok: false, message: 'Kachel bereits belegt.' };
  const access = placementBlocksAccess(state, gx, gy, site);
  if (access) return { ok: false, message: access };
  if (state.cash + availableCredit(state) < SHELF_PRICE) return { ok: false, message: `Regal kostet ${SHELF_PRICE}€.` };
  spend(state, SHELF_PRICE);
  w.shelves.push({ id: uid('shelf'), gx, gy });
  notify(state, `🧱 Regal gebaut (${SHELF_PRICE}€) – +${SHELF_SLOTS * PALETTE_SIZE} Lagerplätze.`, 'info');
  return { ok: true };
}

/** Build a prep table on a free storage tile — more parallel Herrichtung. */
export function buildTable(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  const tile = w.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'storage') return { ok: false, message: 'Nur in der Lagerzone platzierbar.' };
  if (!tileFree(state, gx, gy, site)) return { ok: false, message: 'Kachel bereits belegt.' };
  const access = placementBlocksAccess(state, gx, gy, site);
  if (access) return { ok: false, message: access };
  if (state.cash + availableCredit(state) < TABLE_PRICE) return { ok: false, message: `Tisch kostet ${TABLE_PRICE}€.` };
  spend(state, TABLE_PRICE);
  w.tables.push({ gx, gy });
  notify(state, `🔧 Vorbereitungstisch gebaut (${TABLE_PRICE}€) – mehr paralleles Herrichten.`, 'info');
  return { ok: true };
}

/** Tear down the shelf, table or desk on a tile and refund part of its price.
 * Refuses (with a reason) if the structure is in use or holding stock. */
// --- Standorte (L3) ---------------------------------------------------------

/** Eröffnet den Standort Süd: neue Halle, neuer Regionalmarkt, Regionalprodukte.
 * Freigeschaltet ab BRANCH_UNLOCK_MONTHLY Monatsumsatz — bewusst bevor man es
 * sich bequem leisten kann (Übernahme-Risiko ist Teil des Spiels). */
export function openBranch(state: GameState): ActionResult {
  if (state.branchWarehouse) return { ok: false, message: 'Standort Süd ist bereits eröffnet.' };
  if (monthlyRevenue(state) < BRANCH_UNLOCK_MONTHLY) {
    return {
      ok: false,
      message: `Ab ${Math.round(BRANCH_UNLOCK_MONTHLY / 1000)}k € Monatsumsatz möglich.`,
    };
  }
  if (state.cash + availableCredit(state) < BRANCH_PRICE) {
    return { ok: false, message: `Eröffnung kostet ${BRANCH_PRICE}€.` };
  }
  spend(state, BRANCH_PRICE);
  state.branchWarehouse = makeBranchWarehouse();
  state.branchOpenedWeek = weekOf(state.totalDays);
  notify(
    state,
    `🎉 ${SITE_META.sued.name} eröffnet (${BRANCH_PRICE}€)! Neue Region: Süd-Kunden fragen bald an, 🍷 Wein & 🫒 Oliven sind dort listbar. Lagerkräfte einstellen (Personal → Standort Süd) und bestellen nicht vergessen.`,
    'success',
  );
  return { ok: true };
}

/** LKW-Transfer zwischen den Standorten: nimmt Regal-Bestand am Absender und
 * liefert ihn nach TRANSFER_DAYS in den Wareneingang des Ziels (Haltbarkeit
 * bleibt erhalten; dort muss er normal eingelagert werden). */
export function transferStock(
  state: GameState,
  productId: ProductId,
  quantity: number,
  fromSite: SiteId,
  toSite: SiteId,
): ActionResult {
  if (!branchOpen(state)) return { ok: false, message: 'Standort Süd ist noch nicht eröffnet.' };
  if (fromSite === toSite) return { ok: false, message: 'Gleicher Standort.' };
  const product = getProduct(state, productId);
  const qty = Math.round(quantity);
  if (qty <= 0) return { ok: false, message: 'Menge ungültig.' };
  if (shelfStock(product, fromSite) < qty) {
    return { ok: false, message: `Nur ${shelfStock(product, fromSite)}× ${product.name} im Regal ${SITE_META[fromSite].short}.` };
  }
  const cost = Math.ceil(qty / PALETTE_SIZE) * TRANSFER_COST_PER_PALLET;
  if (state.cash + availableCredit(state) < cost) {
    return { ok: false, message: `Transport kostet ${cost}€ – nicht bezahlbar.` };
  }
  // Bestand FIFO am Absender entnehmen; die früheste Haltbarkeit reist mit
  // (konservativ — kein Frische-Reset durch Umlagern).
  let earliest = Infinity;
  for (const b of product.batches) {
    if (b.location === 'shelf' && (b.siteId ?? 'hq') === fromSite) {
      earliest = Math.min(earliest, b.expiryDay);
    }
  }
  const deduct = qty;
  let remaining = deduct;
  product.batches.sort((a, b) => a.expiryDay - b.expiryDay);
  for (const b of product.batches) {
    if (remaining <= 0) break;
    if (b.location !== 'shelf' || (b.siteId ?? 'hq') !== fromSite) continue;
    const take = Math.min(b.quantity, remaining);
    b.quantity -= take;
    remaining -= take;
  }
  product.batches = product.batches.filter((b) => b.quantity > 0);
  spend(state, cost);
  state.weekAcc.logistics += cost;
  if (!state.transfers) state.transfers = [];
  state.transfers.push({
    id: uid('trans'),
    productId,
    quantity: qty,
    fromSite,
    toSite,
    expiryDay: earliest === Infinity ? state.totalDays + product.spoilageDays : earliest,
    arrivalDay: state.totalDays + TRANSFER_DAYS,
    cost,
  });
  notify(
    state,
    `🚚 Transfer unterwegs: ${qty}× ${product.emoji} ${product.name} ${SITE_META[fromSite].short} → ${SITE_META[toSite].short} (${cost}€, ~${TRANSFER_DAYS} Tag).`,
    'info',
  );
  return { ok: true };
}

export function demolishAt(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  const refundBack = (price: number) => {
    state.cash += Math.round(price * DEMOLISH_REFUND);
  };

  const shelf = w.shelves.find((s) => s.gx === gx && s.gy === gy);
  if (shelf) {
    // Removing a shelf must not strand stock — checked in ITS zone (a cool-tile
    // shelf only holds cold ware, a normal shelf only normal ware).
    const unit = SHELF_SLOTS * PALETTE_SIZE;
    const cold = isCoolTile(state, gx, gy, site);
    const stranded = cold
      ? coldShelfUsed(state, site) > coldShelfCapacity(state, site) - unit
      : normalShelfUsed(state, site) > normalShelfCapacity(state, site) - unit;
    if (stranded) {
      return { ok: false, message: 'Regal (mit-)belegt – erst Bestand abverkaufen/umlagern, sonst geht Ware verloren.' };
    }
    w.shelves = w.shelves.filter((s) => s !== shelf);
    refundBack(SHELF_PRICE);
    notify(state, `🧹 ${cold ? 'Kühlregal' : 'Regal'} abgerissen – ${Math.round(SHELF_PRICE * DEMOLISH_REFUND)}€ zurück.`, 'info');
    return { ok: true };
  }

  const table = w.tables.find((t) => t.gx === gx && t.gy === gy);
  if (table) {
    // Table indices are referenced by active prep tasks — only remove when idle.
    if (state.employees.some((e) => e.task?.kind === 'prep' && (e.siteId ?? 'hq') === site)) {
      return { ok: false, message: 'Es wird gerade hergerichtet – erst abwarten, dann Tisch abreißen.' };
    }
    w.tables = w.tables.filter((t) => t !== table);
    refundBack(TABLE_PRICE);
    notify(state, `🧹 Vorbereitungstisch abgerissen – ${Math.round(TABLE_PRICE * DEMOLISH_REFUND)}€ zurück.`, 'info');
    return { ok: true };
  }

  const desk = w.desks.find((d) => d.gx === gx && d.gy === gy);
  if (desk) {
    // A desk in use seats an office employee — free one first.
    if (freeDesks(state) <= 0) {
      return { ok: false, message: 'Alle Arbeitsplätze belegt – erst Büro-Personal entlassen.' };
    }
    w.desks = w.desks.filter((d) => d !== desk);
    refundBack(DESK_PRICE);
    notify(state, `🧹 Arbeitsplatz abgerissen – ${Math.round(DESK_PRICE * DEMOLISH_REFUND)}€ zurück.`, 'info');
    return { ok: true };
  }

  // Leere Kühlbereich-Kachel: Markierung entfernen (Regal darauf würde oben als
  // Kühlregal-Abriss greifen — danach kann die Markierung selbst weg).
  if (isCoolTile(state, gx, gy, site)) {
    w.coolTiles = (w.coolTiles ?? []).filter((t) => !(t.gx === gx && t.gy === gy));
    refundBack(COOL_TILE_PRICE);
    notify(state, `🧹 Kühlbereich-Markierung entfernt – ${Math.round(COOL_TILE_PRICE * DEMOLISH_REFUND)}€ zurück.`, 'info');
    return { ok: true };
  }

  return { ok: false, message: 'Hier steht nichts zum Abreißen.' };
}

/** Add an inbound pallet slot (Wareneingang +1) on a free ramp tile. */
export function buildInboundSlot(state: GameState, gx: number, gy: number, site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  const tile = w.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'ramp') return { ok: false, message: 'Nur im Rampenbereich platzierbar.' };
  const rampCount = w.tiles.filter((t) => t.zone === 'ramp').length;
  if (w.inboundSlots + w.abholzone >= rampCount) {
    return { ok: false, message: 'Kein Platz mehr im Rampenbereich.' };
  }
  if (state.cash + availableCredit(state) < INBOUND_SLOT_PRICE) return { ok: false, message: `Anlieferungsplatz kostet ${INBOUND_SLOT_PRICE}€.` };
  spend(state, INBOUND_SLOT_PRICE);
  w.inboundSlots += 1;
  notify(state, `📥 Anlieferungsplatz gebaut (${INBOUND_SLOT_PRICE}€) – Wareneingang +${PALETTE_SIZE}.`, 'info');
  return { ok: true };
}

/** Expand the hall by one 2×2 block (4 storage tiles). Only scaling cost. The
 * block must be on the current expansion frontier (dynamically recomputed from
 * the hall shape), so UI and mutation can never disagree. */
export function expandHall(state: GameState, block: { gx: number; gy: number }[], site: SiteId = 'hq'): ActionResult {
  const w = warehouseOf(state, site);
  if (!isFrontierBlock(state, 'hall', block, site)) {
    return { ok: false, message: 'Hier kann die Halle nicht erweitert werden.' };
  }
  const price = hallExpansionPrice(w.expansions);
  if (state.cash + availableCredit(state) < price) return { ok: false, message: `Erweiterung kostet ${price}€.` };
  for (const c of block) {
    if (!w.tiles.some((t) => t.gx === c.gx && t.gy === c.gy)) {
      w.tiles.push({ gx: c.gx, gy: c.gy, zone: 'storage' });
    }
  }
  spend(state, price);
  w.expansions += 1;
  notify(state, `🏗️ Halle erweitert (${price}€) – 4 neue Lagerkacheln, Miete +${RENT_PER_EXPANSION}€/Monat.`, 'info');
  return { ok: true };
}

/** Build an office desk on a free office tile — seats one office employee. */
export function buildDesk(state: GameState, gx: number, gy: number): ActionResult {
  const tile = state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
  if (!tile || tile.zone !== 'office') return { ok: false, message: 'Nur im Bürobereich platzierbar.' };
  if (!tileFree(state, gx, gy)) return { ok: false, message: 'Kachel bereits belegt.' };
  const access = placementBlocksAccess(state, gx, gy);
  if (access) return { ok: false, message: access };
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
  notify(state, `🏢 Bürogebiet erweitert (${price}€) – 4 neue Bürokacheln, Miete +${RENT_PER_EXPANSION}€/Monat.`, 'info');
  return { ok: true };
}
