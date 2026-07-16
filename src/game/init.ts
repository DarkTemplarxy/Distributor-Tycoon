// ============================================================================
// Initial game state — the "Der Onkel" starting scenario.
// ============================================================================

import {
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_LEAD_WEEKS,
  CUSTOMER_VOLATILITY,
  PRODUCT_DEFS,
  SAVE_VERSION,
  STARTING_CASH,
  STARTING_STARS,
  TRUCK_COST_PER_PALLET,
  type ProductDef,
} from './constants';
import type { Batch, Customer, Employee, GameState, Product, Supplier } from './types';
import { uid } from './util';

/** Build a fresh Product from a catalog definition. Reused by the start scenario
 * and by the runtime "add to assortment" action, so both stay in sync. */
export function buildProduct(
  def: ProductDef,
  opts?: { batches?: Batch[]; autoRestock?: Product['autoRestock'] },
): Product {
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    einkaufspreis: def.einkaufspreis,
    verkaufspreis: def.verkaufspreis,
    zielmarge: def.zielmarge,
    spoilageDays: def.spoilageDays,
    batches: opts?.batches ?? [],
    autoRestock: opts?.autoRestock ?? { enabled: false, min: 40, target: 120 },
  };
}

function makeProducts(): Product[] {
  // Only products unlocked at the start (fish) are in the assortment initially.
  return PRODUCT_DEFS.filter((def) => def.unlockWeek === 0).map((def) => {
    const batches: Batch[] = [];
    // Give the player two starter palettes of fish (80 units) so the very first
    // (now larger) orders can be fulfilled immediately from stock — an easier start.
    if (def.id === 'fisch') {
      batches.push({
        id: uid('batch'),
        productId: 'fisch',
        quantity: 80,
        expiryDay: def.spoilageDays, // created on day 0
      });
    }
    return buildProduct(def, {
      batches,
      // Procurement starts fully MANUAL — automatic restocking only kicks in once
      // the player hires an Einkäufer. Sensible min/target are pre-filled for then
      // (fisch scaled to the doubled weekly demand).
      autoRestock:
        def.id === 'fisch'
          ? { enabled: false, min: 90, target: 160 }
          : { enabled: false, min: 40, target: 120 },
    });
  });
}

function makeCustomers(): Customer[] {
  const base = {
    serviceRating: 3,
    loyalty: 70,
    lateDeliveries: 0,
    activeDiscount: 0,
    active: true,
    nextOrderWeek: 0,
    volatility: CUSTOMER_VOLATILITY.small,
    deliveryLeadWeeks: CUSTOMER_LEAD_WEEKS.small,
    type: 'small' as const,
    emoji: '🍕',
  };
  return [
    {
      ...base,
      id: 'cust_giuseppe',
      name: 'Pizza Giuseppe',
      // Fixed early weekday (Tue) — day 0/Mon never fires a day-start, so a Monday
      // slot would slip the first order into week 2. Tue guarantees week 1.
      orderDayOfWeek: 1,
      lines: [{ productId: 'fisch', price: 33.5, volume: 30 }],
    },
    {
      ...base,
      id: 'cust_urban',
      name: 'Restaurant Urban',
      emoji: '🍽️',
      // Staggered a couple of days after Giuseppe, still safely inside week 1.
      orderDayOfWeek: 3,
      lines: [{ productId: 'fisch', price: 33.5, volume: 32 }],
    },
  ];
}

function makeEmployees(): Employee[] {
  return [
    { id: 'emp_hans', name: 'Hans', role: 'lager', salary: 400, skill: 55 },
    { id: 'emp_maria', name: 'Maria', role: 'lager', salary: 400, skill: 50 },
  ];
}

function makeSupplier(): Supplier {
  return {
    id: 'supp_seafood',
    name: 'GroßMarkt Nord',
    // The supplier only lists products that are in the assortment; adding a
    // product later also adds its supplier offering.
    products: PRODUCT_DEFS.filter((def) => def.unlockWeek === 0).map((def) => ({
      productId: def.id,
      price: def.einkaufspreis,
      basePrice: def.einkaufspreis,
    })),
  };
}

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    totalDays: 0,
    speed: 1,
    paused: true,

    cash: STARTING_CASH,
    bankCredit: 0,
    creditLimit: CREDIT_LIMIT_FLOOR,
    serviceStars: STARTING_STARS,

    products: makeProducts(),
    customers: makeCustomers(),
    employees: makeEmployees(),
    supplier: makeSupplier(),
    truck: { costPerPallet: TRUCK_COST_PER_PALLET },

    orders: [],
    palettes: [],
    purchaseOrders: [],
    scheduledPayments: [],
    inquiries: [],

    warehouse: {
      paletteSlotsTotal: 12,
      herrichtungTables: 1,
      abholzone: 3,
    },

    notifications: [
      {
        id: uid('note'),
        day: 0,
        week: 0,
        message:
          'Willkommen! Du hast das Geschäft vom Onkel übernommen: 2 Kunden, 1 Lieferant, 2 Lagermitarbeiter. Drücke ▶ zum Starten.',
        type: 'info',
      },
    ],
    reports: [],
    weekAcc: {
      revenue: 0,
      purchases: 0,
      salaries: 0,
      rent: 0,
      logistics: 0,
      spoilageLoss: 0,
      interest: 0,
      deliveredOrders: 0,
      lateOrders: 0,
    },
    profitHistory: [],

    stats: {
      totalRevenue: 0,
      totalProfit: 0,
      deliveredOrders: 0,
      lateOrders: 0,
      spoiledUnits: 0,
      spoilageLoss: 0,
    },
    settings: { autoPrep: true },

    truckAnimUntil: 0,
    gameOver: false,
    yearComplete: false,
  };
}
