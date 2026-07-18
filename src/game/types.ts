// ============================================================================
// Distributor Tycoon - Core type definitions
// All state is stored as plain, JSON-serialisable objects (no class instances,
// methods, Maps, Sets or Dates) so the whole game can be persisted via the
// saveManager with a single stringify/parse — no custom (de)serialiser.
// ============================================================================

export type Speed = 0.5 | 1 | 2 | 4;

export type ProductId = 'fisch' | 'fleisch' | 'gemuese';

export type CustomerType = 'small' | 'medium' | 'large';

export type Role = 'lager' | 'einkaeufer' | 'kam' | 'admin';

export type OrderStatus =
  | 'pending' // waiting for inventory / worker
  | 'preparing' // worker is picking & packing
  | 'ready' // palette waiting for Monday truck
  | 'delivered'; // handed over to the truck

export type PaletteStatus = 'preparing' | 'ready';

export type NotificationType = 'info' | 'success' | 'warn' | 'error';

/** A single lot of goods with its own expiry moment. Freshly delivered goods
 * arrive in the inbound zone ('inbound') and are only available for orders once
 * a worker has put them away on a shelf ('shelf'). */
export interface Batch {
  id: string;
  productId: ProductId;
  quantity: number;
  /** Absolute game-day (state.totalDays) on which this batch spoils. */
  expiryDay: number;
  location: 'shelf' | 'inbound';
}

export interface Product {
  id: ProductId;
  name: string;
  emoji: string;
  /** Purchase price per unit (from supplier). */
  einkaufspreis: number;
  /** Sales price per unit (player configurable). */
  verkaufspreis: number;
  /** Target margin in percent (drives the "auto price" helper). */
  zielmarge: number;
  /** Shelf life in days. */
  spoilageDays: number;
  batches: Batch[];
  /** Optional auto-restock rule. */
  autoRestock: { enabled: boolean; min: number; target: number };
}

/** One product a customer buys: its own price and weekly volume. */
export interface CustomerLine {
  productId: ProductId;
  /** Agreed price per unit. */
  price: number;
  /** Baseline units ordered per week. */
  volume: number;
}

export interface Customer {
  id: string;
  name: string;
  emoji: string;
  type: CustomerType;
  /** The product lines this customer buys (grows over time via expansion offers). */
  lines: CustomerLine[];
  /** Day of week (0=Mon .. 5=Sat) the customer places its weekly order — ALL its
   * product lines order together on this day. Re-randomised each week. */
  orderDayOfWeek: number;
  /** Next week index on which this customer should place its order. */
  nextOrderWeek: number;
  /** 1-5 stars this specific customer gives us. */
  serviceRating: number;
  /** 0-100 loyalty. */
  loyalty: number;
  lateDeliveries: number;
  /** Delivery lead time in weeks (1 small / 2 medium / 3 large). */
  deliveryLeadWeeks: number;
  /** Annual volatility as a fraction (0.4 / 0.2 / 0.1). */
  volatility: number;
  /** Active discount fraction (0 - 0.20) the player granted. */
  activeDiscount: number;
  active: boolean;
}

export interface Inquiry {
  id: string;
  name: string;
  emoji: string;
  type: CustomerType;
  /** When set, this is an expansion request from an existing customer (add a product line). */
  existingCustomerId?: string;
  preferredProduct: ProductId;
  suggestedVolume: number;
  /** The price the potential customer is hoping for (per unit). */
  targetPrice: number;
  createdWeek: number;
  /** Week the inquiry disappears if untouched. */
  expiryWeek: number;
  status: 'open' | 'accepted' | 'expired';
}

export interface Order {
  id: string;
  customerId: string;
  productId: ProductId;
  quantity: number;
  /** Price per unit locked in at order time. */
  price: number;
  createdDay: number;
  /** Week by which the goods must be picked up by the truck. */
  dueWeek: number;
  status: OrderStatus;
  paletteId?: string;
  /** Set true once the delivery deadline has passed without shipment. */
  late: boolean;
}

export interface Palette {
  id: string;
  orderId: string;
  customerId: string;
  productId: ProductId;
  quantity: number;
  status: PaletteStatus;
}

export interface PurchaseOrderItem {
  productId: ProductId;
  quantity: number;
  pricePerUnit: number;
}

export interface PurchaseOrder {
  id: string;
  items: PurchaseOrderItem[];
  orderDay: number;
  deliveryDay: number;
  totalCost: number;
  status: 'pending' | 'received';
}

export interface ScheduledPayment {
  id: string;
  customerId: string;
  orderId: string;
  amount: number;
  dueDay: number;
  label: string;
}

/** A warehouse worker is either preparing an order for pickup ('prep') or
 * putting delivered goods away from the inbound zone onto a shelf ('putaway').
 * A task belongs to exactly ONE worker: prep is locked via the order's status
 * flip at assignment, putaway via the immediate inventory deduction. The
 * workstation indices bind each task to ONE prep table / inbound slot, so two
 * workers are never at the same station (also visually). */
export type WorkerTask =
  | {
      kind: 'prep';
      orderId: string;
      /** Index of the prep table this task occupies (exclusive per task). */
      tableIndex?: number;
      totalDays: number;
      remainingDays: number;
    }
  | {
      kind: 'putaway';
      productId: ProductId;
      quantity: number;
      /** Expiry carried with the pallet in transit from inbound to the shelf. */
      expiryDay: number;
      /** Index of the inbound slot this task works at (exclusive while free). */
      slotIndex?: number;
      totalDays: number;
      remainingDays: number;
    };

export interface Employee {
  id: string;
  name: string;
  role: Role;
  salary: number; // per week
  skill: number; // 0-100
  task?: WorkerTask;
}

export interface SupplierProduct {
  productId: ProductId;
  price: number;
  basePrice: number;
}

export interface Supplier {
  id: string;
  name: string;
  products: SupplierProduct[];
}

export interface Notification {
  id: string;
  day: number;
  week: number;
  message: string;
  type: NotificationType;
}

export interface WeeklyReport {
  week: number;
  revenue: number;
  purchases: number;
  salaries: number;
  rent: number;
  logistics: number;
  spoilageLoss: number;
  /** Units that spoiled this week (the loss above is these × purchase price). */
  spoiledUnits: number;
  interest: number;
  profit: number;
  cashEnd: number;
  customerCount: number;
  deliveredOrders: number;
  lateOrders: number;
  avgStars: number;
}

/** Costs/revenue accumulated during the currently-running week. */
export interface WeekAccumulator {
  revenue: number;
  purchases: number;
  salaries: number;
  rent: number;
  logistics: number;
  spoilageLoss: number;
  spoiledUnits: number;
  interest: number;
  deliveredOrders: number;
  lateOrders: number;
}

/** A completed year's headline figures — pure data, stored as the comparison
 * base for the next year's balance sheet ("beat yourself"). */
export interface YearStats {
  /** Display year number (1, 2, …) that just ended. */
  year: number;
  revenue: number;
  profit: number;
  cashEnd: number;
  customersEnd: number;
  deliveredOrders: number;
  lateOrders: number;
  spoiledUnits: number;
  spoilageLoss: number;
  milestonesAchieved: number;
}

export interface GameStats {
  totalRevenue: number;
  totalProfit: number;
  deliveredOrders: number;
  lateOrders: number;
  spoiledUnits: number;
  spoilageLoss: number;
}

/** Per-milestone progress — pure serialisable data. The title/description/
 * condition/uncle-comment live as constants (MILESTONE_DEFS), matched by `id`, so
 * the texts can change without breaking saves. `achievedWeek` is null until met. */
export interface MilestoneProgress {
  id: string;
  achievedWeek: number | null;
}

export interface GameState {
  version: number;
  /** Continuous elapsed game time in days (day 0.0 = Monday 00:00, week 0). */
  totalDays: number;
  speed: Speed;
  paused: boolean;

  cash: number;
  bankCredit: number;
  creditLimit: number;
  serviceStars: number;

  products: Product[];
  customers: Customer[];
  employees: Employee[];
  supplier: Supplier;
  truck: { costPerPallet: number };

  orders: Order[];
  palettes: Palette[];
  purchaseOrders: PurchaseOrder[];
  scheduledPayments: ScheduledPayment[];
  inquiries: Inquiry[];

  warehouse: {
    /** The footprint as grid tiles. 'ramp' tiles (front) host the inbound &
     * pickup pallets and the truck dock; 'storage' tiles host shelves & tables;
     * 'office' tiles (left) host the office desks. */
    tiles: { gx: number; gy: number; zone: 'storage' | 'ramp' | 'office' }[];
    /** Placed shelves; each holds SHELF_SLOTS pallets of PALETTE_SIZE units. */
    shelves: { id: string; gx: number; gy: number }[];
    /** Placed preparation tables — limit how many workers can prep in parallel. */
    tables: { gx: number; gy: number }[];
    /** Placed office desks — each seats one office employee; hiring office staff
     * (Einkäufer/KAM/Admin) needs a free desk. */
    desks: { gx: number; gy: number }[];
    /** Inbound (Wareneingang) pallet-slot capacity; buyable, ramp only. */
    inboundSlots: number;
    /** Pickup (Abhol) zone pallet capacity. */
    abholzone: number;
    /** Number of hall expansions bought (drives the rising expansion price). */
    expansions: number;
    /** Number of office-area expansions bought (drives the office expansion price). */
    officeExpansions: number;
  };

  notifications: Notification[];
  reports: WeeklyReport[];
  weekAcc: WeekAccumulator;
  /** Weekly profit history used to compute the credit limit. */
  profitHistory: number[];
  /** The previous completed year's figures — comparison base for the year-end
   * balance sheet. Null until the first year is done. */
  lastYearStats: YearStats | null;

  /** Weekly ordering (procurement runs once a week, on Monday). When set, a
   * manual Monday order is awaiting the player (no Einkäufer) — the UI opens the
   * order screen and pauses until it's handled. Null when nothing is pending. */
  pendingOrderWeek: number | null;
  /** Id of the purchase order placed for the current week (auto by the Einkäufer
   * or manually), so it can be shown as "already ordered" and overridden. */
  currentWeekPoId: string | null;
  /** Units demanded per product during the currently-running week (accumulates
   * as customer orders come in). Rolled into demandLog at the weekly rollover. */
  demandThisWeek: Partial<Record<ProductId, number>>;
  /** Per-product history of weekly demanded units (most recent last), used by the
   * order recommendation ("average of the last 2 weeks"). */
  demandLog: Partial<Record<ProductId, number[]>>;

  stats: GameStats;
  /** Progress on "Onkels Notizbuch" milestones (see MILESTONE_DEFS). Checks run
   * once the tutorial has ended. */
  milestones: MilestoneProgress[];
  /** Ids of just-achieved milestones queued for the celebration overlay. The UI
   * shows them one at a time and clears each as it's dismissed. */
  celebrateMilestones?: string[];
  settings: {
    autoPrep: boolean;
    /** The side orders panel is collapsed to a slim handle (persisted). */
    ordersPanelCollapsed: boolean;
  };

  /** Guided onboarding state. `active` runs the beat machine and gates the UI;
   * `step` is the current beat (see STEP in tutorial.ts). Null once the tutorial
   * is finished or skipped. Plain data so it serialises with the rest of state.
   * Optional fields (backward compatible within the save version):
   *  - celebrateAmount: the cash actually paid for the first delivery (drives the
   *    celebration count-up instead of a hardcoded number),
   *  - dismissedCoach: steps whose coach card was dismissed — persisted so a
   *    dismissed hint does not reappear after save/load. */
  tutorial: {
    active: boolean;
    step: number;
    celebrateAmount?: number;
    dismissedCoach?: number[];
    /** Marker: the ORDER beat's Saturday order window was raised at least once
     * (closing it unhandled then counts as "dealt with" — no reopen loop). */
    orderPromptSeen?: boolean;
    /** Same marker for the meat lesson's Saturday order window. */
    meatOrderPrompted?: boolean;
  } | null;

  /** Transient UI cue: game-day the truck animation should play until. */
  truckAnimUntil: number;

  gameOver: boolean;
  yearComplete: boolean;
}
