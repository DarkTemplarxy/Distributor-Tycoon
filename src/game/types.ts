// ============================================================================
// Distributor Tycoon - Core type definitions
// All state is stored as plain, JSON-serialisable objects so the whole game
// can be saved to / loaded from localStorage without any custom (de)serialiser.
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

/** A single lot of goods with its own expiry moment. */
export interface Batch {
  id: string;
  productId: ProductId;
  quantity: number;
  /** Absolute game-day (state.totalDays) on which this batch spoils. */
  expiryDay: number;
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

/** One product a customer buys: its own price, weekly volume and order timing. */
export interface CustomerLine {
  productId: ProductId;
  /** Agreed price per unit. */
  price: number;
  /** Baseline units ordered per week. */
  volume: number;
  /** Day of week (0=Mon .. 5=Sat) this line places its weekly order. Re-randomised each week. */
  orderDayOfWeek: number;
  /** Next week index on which this line should place an order. */
  nextOrderWeek: number;
}

export interface Customer {
  id: string;
  name: string;
  emoji: string;
  type: CustomerType;
  /** The product lines this customer buys (grows over time via expansion offers). */
  lines: CustomerLine[];
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
  status: 'open' | 'offered' | 'accepted' | 'rejected' | 'expired';
  /** Present once the player sent an offer. */
  offer?: {
    price: number;
    volume: number;
    respondWeek: number;
  };
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

export interface Employee {
  id: string;
  name: string;
  role: Role;
  salary: number; // per week
  skill: number; // 0-100
  task?: {
    orderId: string;
    totalDays: number;
    remainingDays: number;
  };
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
  logistics: number;
  spoilageLoss: number;
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
  logistics: number;
  spoilageLoss: number;
  interest: number;
  deliveredOrders: number;
  lateOrders: number;
}

export interface GameStats {
  totalRevenue: number;
  totalProfit: number;
  deliveredOrders: number;
  lateOrders: number;
  spoiledUnits: number;
  spoilageLoss: number;
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
    paletteSlotsTotal: number;
    herrichtungTables: number;
    abholzone: number;
  };

  notifications: Notification[];
  reports: WeeklyReport[];
  weekAcc: WeekAccumulator;
  /** Weekly profit history used to compute the credit limit. */
  profitHistory: number[];

  stats: GameStats;
  settings: { autoPrep: boolean };

  /** Transient UI cue: game-day the truck animation should play until. */
  truckAnimUntil: number;

  gameOver: boolean;
  yearComplete: boolean;
}
