// ============================================================================
// Player actions. Each function mutates the GameState directly and returns a
// small result so the UI can show feedback. These are the only ways the player
// influences the simulation (everything else runs automatically in advance()).
// ============================================================================

import {
  getProductDef,
  HIRE_WEEKS_UPFRONT,
  ROLE_LABEL,
  ROLE_SALARY,
  TRAINING_COST,
  TRAINING_SKILL_GAIN,
} from './constants';
import type { GameState, ProductId, Role } from './types';
import {
  availableCredit,
  createPurchaseOrderInternal,
  freeCapacity,
  getProduct,
  isInAssortment,
  notify,
  spend,
  tryPrepareOrder,
} from './simulation';
import { buildProduct } from './init';
import { clamp, uid, weekOf } from './util';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

// --- Purchasing -------------------------------------------------------------

export function createPurchaseOrder(
  state: GameState,
  items: { productId: ProductId; quantity: number }[],
): ActionResult {
  const valid = items.filter((i) => i.quantity > 0);
  if (valid.length === 0) return { ok: false, message: 'Keine Menge angegeben.' };

  let total = 0;
  for (const item of valid) {
    const sp = state.supplier.products.find((s) => s.productId === item.productId)!;
    total += item.quantity * sp.price;
  }
  if (state.cash + availableCredit(state) < total) {
    return { ok: false, message: `Nicht genug Kapital (${Math.round(total)}€ nötig).` };
  }

  createPurchaseOrderInternal(state, valid);
  notify(state, `🛒 Bestellung aufgegeben (${Math.round(total)}€, Lieferung in 1 Woche).`, 'info');
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

/** Buy exactly the shortfall needed to fulfil an order. */
export function restockForOrder(state: GameState, orderId: string): ActionResult {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: 'Auftrag nicht gefunden.' };
  const product = getProduct(state, order.productId);
  const have = product.batches.reduce((s, b) => s + b.quantity, 0);
  const shortfall = Math.max(0, order.quantity - have);
  if (shortfall === 0) return { ok: false, message: 'Genug Bestand vorhanden.' };
  return createPurchaseOrder(state, [{ productId: order.productId, quantity: shortfall }]);
}

// --- Employees --------------------------------------------------------------

export function hireEmployee(state: GameState, role: Role): ActionResult {
  const salary = ROLE_SALARY[role];
  const upfront = salary * HIRE_WEEKS_UPFRONT;
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
  if (emp.task) return { ok: false, message: 'Mitarbeiter arbeitet gerade an einem Auftrag.' };
  state.employees = state.employees.filter((e) => e.id !== employeeId);
  notify(state, `👋 ${emp.name} wurde entlassen.`, 'info');
  return { ok: true };
}

// --- Customers --------------------------------------------------------------

export function setDiscount(state: GameState, customerId: string, discount: number): void {
  const cust = state.customers.find((c) => c.id === customerId);
  if (!cust) return;
  cust.activeDiscount = clamp(discount, 0, 0.2);
}

// --- Inquiries --------------------------------------------------------------

export function sendOffer(
  state: GameState,
  inquiryId: string,
  price: number,
  volume: number,
): ActionResult {
  const inq = state.inquiries.find((i) => i.id === inquiryId);
  if (!inq) return { ok: false, message: 'Anfrage nicht gefunden.' };
  if (inq.status !== 'open' && inq.status !== 'rejected') {
    return { ok: false, message: 'Anfrage kann nicht (mehr) beboten werden.' };
  }
  // Expansions of existing customers don't need KAM capacity.
  if (!inq.existingCustomerId && freeCapacity(state, inq.type) <= 0) {
    return { ok: false, message: 'Keine KAM-Kapazität für diesen Kundentyp frei.' };
  }
  inq.offer = { price: Math.max(1, price), volume: Math.max(1, Math.round(volume)), respondWeek: weekOf(state.totalDays) + 1 };
  inq.status = 'offered';
  notify(state, `📤 Angebot an ${inq.name} gesendet: ${Math.round(volume)}× @ ${price}€. Antwort in 1 Woche.`, 'info');
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
