// ============================================================================
// Initial game state — the "Der Onkel" starting scenario.
// ============================================================================

import {
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_LEAD_WEEKS,
  CUSTOMER_VOLATILITY,
  MILESTONE_DEFS,
  PRODUCT_DEFS,
  SAVE_VERSION,
  STARTING_CASH,
  STARTING_STARS,
  TRUCK_COST_PER_PALLET,
  type ProductDef,
} from './constants';
import type { Batch, Customer, Employee, GameState, Order, Product, Supplier } from './types';
import { uid } from './util';
import { STARTING_CUSTOMER_IDS, STEP, TUTORIAL_ORDER_ID } from './tutorial';

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
        location: 'shelf', // starter stock is already shelved
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
      id: STARTING_CUSTOMER_IDS[0],
      name: 'Pizza Giuseppe',
      // Giuseppe's week-0 order IS the pre-placed tutorial starter order, so his
      // regular subscription only kicks in from week 1 — otherwise week-0 demand
      // (starter 30 + Giuseppe ~27 + Urban ~27) would exceed the 80 starter fish
      // and Urban could go short during the guided phase.
      orderDayOfWeek: 1,
      nextOrderWeek: 1,
      lines: [{ productId: 'fisch', price: 33.5, volume: 30 }],
    },
    {
      ...base,
      id: STARTING_CUSTOMER_IDS[1],
      name: 'Restaurant Urban',
      emoji: '🍽️',
      // Thursday, week 0 — day 0/Mon never fires a day-start, so an early fixed
      // weekday guarantees an organic order inside the very first week.
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

/** The starting hall: an 8×6 rectangle with a 2-row ramp at the front (inbound +
 * pickup + dock) and a storage area behind it holding 5 narrow shelves and 2
 * prep tables, with the middle kept clear for flow. A small office (2×3 tiles)
 * sits to the LEFT with 2 starting desks. */
function makeWarehouse(): GameState['warehouse'] {
  const tiles: GameState['warehouse']['tiles'] = [];
  for (let gy = 0; gy <= 5; gy++) {
    for (let gx = 0; gx <= 7; gx++) {
      tiles.push({ gx, gy, zone: gy >= 4 ? 'ramp' : 'storage' });
    }
  }
  // Office field to the left of the hall (gx −3,−2 × gy 0..2).
  for (let gy = 0; gy <= 2; gy++) {
    for (let gx = -3; gx <= -2; gx++) {
      tiles.push({ gx, gy, zone: 'office' });
    }
  }
  const shelves = [1, 2, 3, 4, 5].map((gx) => ({ id: uid('shelf'), gx, gy: 0 }));
  const tables = [
    { gx: 2, gy: 3 },
    { gx: 4, gy: 3 },
  ];
  const desks = [
    { gx: -3, gy: 0 },
    { gx: -2, gy: 0 },
  ];
  return { tiles, shelves, tables, desks, inboundSlots: 6, abholzone: 3, expansions: 0, officeExpansions: 0 };
}

/** The one order that is already open when the game starts — the tutorial's very
 * first action (BEAT 0: press Herrichten). Small customer, covered by the 80
 * starter fish, so it can be prepared and shipped immediately. */
function makeStartingOrders(): Order[] {
  return [
    {
      id: TUTORIAL_ORDER_ID,
      customerId: STARTING_CUSTOMER_IDS[0],
      productId: 'fisch',
      quantity: 30,
      price: 33.5,
      createdDay: 0,
      dueWeek: 1,
      status: 'pending',
      late: false,
    },
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

    orders: makeStartingOrders(),
    palettes: [],
    purchaseOrders: [],
    scheduledPayments: [],
    inquiries: [],

    warehouse: makeWarehouse(),

    notifications: [
      {
        id: uid('note'),
        day: 0,
        week: 0,
        message:
          'Willkommen! Du hast das Geschäft vom Onkel übernommen: 2 Kunden, 1 Lieferant, 2 Lagermitarbeiter. Folge seiner Anleitung.',
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
      spoiledUnits: 0,
      interest: 0,
      deliveredOrders: 0,
      lateOrders: 0,
    },
    profitHistory: [],
    lastYearStats: null,

    // The first order window opens on the first Saturday (once the player has
    // seen the opening week's demand); the 80 starting fish cover until then.
    pendingOrderWeek: null,
    currentWeekPoId: null,
    demandThisWeek: {},
    demandLog: {},

    stats: {
      totalRevenue: 0,
      totalProfit: 0,
      deliveredOrders: 0,
      lateOrders: 0,
      spoiledUnits: 0,
      spoilageLoss: 0,
    },
    milestones: MILESTONE_DEFS.map((d) => ({ id: d.id, achievedWeek: null })),
    // Auto-prep starts OFF so the tutorial's first beat teaches manual Herrichten;
    // it is switched on once the first delivery is celebrated (see advanceTutorial).
    settings: { autoPrep: false, ordersPanelCollapsed: false },

    tutorial: { active: true, step: STEP.INTRO },

    truckAnimUntil: 0,
    gameOver: false,
    yearComplete: false,
  };
}
