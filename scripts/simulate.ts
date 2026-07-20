// ============================================================================
// Balancing harness — runs the real simulation WITHOUT any UI, driving a simple
// bot day-by-day through a 48-week year, and prints the weekly curve plus an
// aggregate over many runs. It's the tool for tuning the early game against the
// target curve; it adds no runtime dependency to the game (run via `npx tsx`).
//
//   npx tsx scripts/simulate.ts [greedy|passiv|sinnvoll|kam_spam|all] [runs] [weeks]
//
// Strategies:
//   greedy   — accepts EVERY inquiry at its wish price, orders the deficit,
//              never hires or builds.
//   passiv   — accepts NO inquiries, orders the deficit.
//   sinnvoll — rejects lowballs, secures the target margin (accept or counter);
//              orders the deficit; grows the operation when it binds: warehouse
//              worker on slipping deliveries, KAM + desk when customer capacity
//              is full, shelf/table/hall expansion when storage or prep binds.
//   kam_spam — MESS-BOT (Messauftrag KAM-Spam): accepts every SMALL inquiry at
//              its wish price, hires another KAM the moment total free slots
//              drop below 2 (building desks/office as needed, no cash buffer),
//              but trails warehouse staff deliberately late (one Lager hire only
//              after a week with ≥ 1 late order) and never builds shelves or
//              tables — to expose whether prep capacity brakes the spam.
//   kam_spam_plus — MESS-BOT variant: the same aggressive small-customer spam
//              and KAM hiring, but with sinnvoll's infrastructure growth
//              (lager on lateness, shelves/tables/hall/office). Answers whether
//              spam dominates once the warehouse is allowed to keep up.
//
// simulation.ts / actions.ts use no DOM or browser APIs (localStorage lives only
// in save/BrowserStorage.ts, which the harness never touches), so the engine runs
// unchanged here.
// ============================================================================

import { createInitialState } from '../src/game/init.ts';
import {
  advance,
  branchOpen,
  buyerCapacity,
  coldChainGap,
  coldShelfCapacity,
  coldShelfFree,
  equipmentLevel,
  freeCapacity,
  freeDesks,
  hallExpansionFrontier,
  inboundFree,
  managers,
  officeExpansionFrontier,
  orderOutlook,
  placementBlocksAccess,
  shelfCapacity,
  shelfFree,
} from '../src/game/simulation.ts';
import {
  acceptInquiry,
  acceptBigOrder,
  addProduct,
  buildCoolZone,
  buildDesk,
  buildInboundSlot,
  buildShelf,
  buildTable,
  buyEquipment,
  counterOffer,
  openBranch,
  expandHall,
  expandOffice,
  hireEmployee,
  placeWeeklyOrder,
  repriceCooldownLeft,
  setCustomerLinePrice,
  trainEmployee,
} from '../src/game/actions.ts';
import {
  BRANCH_PRICE,
  BUYER_PRODUCT_CAPACITY,
  EQUIPMENT_DEFS,
  getProductDef,
  LARGE_UNLOCK_MONTHLY,
  MEDIUM_UNLOCK_MONTHLY,
  monthlyRevenue,
  PRODUCT_DEFS,
} from '../src/game/constants.ts';
import { weekOf } from '../src/game/util.ts';
import type { CustomerType, GameState } from '../src/game/types.ts';

type Strategy = 'greedy' | 'passiv' | 'sinnvoll' | 'kam_spam' | 'kam_spam_plus' | 'maxeff' | 'ambitioniert';

interface WeekRow {
  week: number;
  cash: number;
  profit: number;
  k: number;
  m: number;
  g: number;
  revenue: number;
  spoilage: number;
  open: number;
  late: number;
  /** Staffing + service trajectory (Messauftrag KAM-Spam). */
  kams: number;
  lager: number;
  stars: number;
  /** Customers lost during this week (lateness churn + demand churn). */
  churned: number;
  /** Average concurrently-busy prep workers over the week vs available tables. */
  prepBusy: number;
  tables: number;
}

interface RunResult {
  rows: WeekRow[];
  firstProfitWeek: number | null;
  minCash: number;
  minCashWeek: number;
  bankruptWeek: number | null;
  endCash: number;
  endCustomers: number;
  /** Week the Nth customer became active (index 3,4,5 → weeks). */
  customerWeek: Record<number, number | null>;
  /** Checkpoint: week the rolling MONTHLY revenue first crossed the unlocks. */
  month120kWeek: number | null;
  month600kWeek: number | null;
  endMonthly: number;
  /** Product groups listed at the end — does the demand engine pull the shop to
   * 2-3 groups organically? (Wachstumsmotor Test-Kriterium 6) */
  endProducts: number;
  /** Demand-path outcomes over the run. */
  ultimatumsHeld: number;
  demandChurns: number;
  /** Customers lost over the whole run (any churn path). */
  totalChurned: number;
  endKams: number;
  endLager: number;
  /** Ø product lines per active customer at the end — measures whether growth
   * came from developing existing customers (Ziel: Richtung 2+). */
  endLinesPerCustomer: number;
}

const activeByType = (s: GameState, t: CustomerType) =>
  s.customers.filter((c) => c.active && c.type === t).length;
const activeCustomers = (s: GameState) => s.customers.filter((c) => c.active).length;

/** Order the deficit for every product — the "order the recommendation" step. */
function orderDeficit(s: GameState) {
  // Je Standort bestellen (der Lieferant liefert direkt dorthin); exklusive
  // Produkte filtert placeWeeklyOrder selbst heraus.
  for (const site of (branchOpen(s) ? (['hq', 'sued'] as const) : (['hq'] as const))) {
    placeWeeklyOrder(
      s,
      s.products.map((p) => ({ productId: p.id, quantity: orderOutlook(s, p.id, site).deficit })),
      site,
    );
  }
  s.pendingOrderWeek = null;
}

/** The sales price that yields a product's target margin (rounded to 0.5). The
 * `sinnvoll` bot secures this: it accepts a wish already at/above it, else
 * counter-offers up to it (taking the rejection risk — the growth brake).
 * Def-based, so it also works for inquiries targeting not-yet-listed products. */
function targetMarginPrice(preferredProduct: GameState['products'][number]['id']): number {
  const p = getProductDef(preferredProduct);
  return Math.round((p.einkaufspreis / (1 - p.zielmarge / 100)) * 2) / 2;
}

/** A free storage tile (no shelf/table) for the sinnvoll bot's build steps.
 * Must respect the walkability rule (R2) — the first free tile may be one that
 * would wall in a neighbour, and the build action would refuse it silently. */
function freeStorageTile(s: GameState): { gx: number; gy: number } | null {
  for (const t of s.warehouse.tiles) {
    if (t.zone !== 'storage') continue;
    if (s.warehouse.shelves.some((x) => x.gx === t.gx && x.gy === t.gy)) continue;
    if (s.warehouse.tables.some((x) => x.gx === t.gx && x.gy === t.gy)) continue;
    if (placementBlocksAccess(s, t.gx, t.gy)) continue;
    return t;
  }
  return null;
}
/** A free, walkability-legal office tile (no desk) for desk builds. */
function freeOfficeTile(s: GameState): { gx: number; gy: number } | null {
  for (const t of s.warehouse.tiles) {
    if (t.zone !== 'office') continue;
    if (s.warehouse.desks.some((d) => d.gx === t.gx && d.gy === t.gy)) continue;
    if (placementBlocksAccess(s, t.gx, t.gy)) continue;
    return t;
  }
  return null;
}

/** kam_spam staffing (Messauftrag): the moment fewer than 2 slots are free
 * across ALL managers, hire another KAM immediately — building a desk (and, if
 * the office is full, an office expansion) as needed. No cash buffer beyond
 * what the actions themselves refuse; warehouse staff is handled elsewhere
 * (deliberately late, one hire per late week). */
function kamSpamStaffing(s: GameState) {
  const totalFree = managers(s).reduce((sum, m) => sum + m.free, 0);
  if (totalFree >= 2) return;
  if (freeDesks(s) <= 0) {
    const tile = freeOfficeTile(s);
    if (tile) buildDesk(s, tile.gx, tile.gy);
    else {
      const blk = officeExpansionFrontier(s)[0];
      if (blk) expandOffice(s, blk);
    }
  }
  if (freeDesks(s) > 0) hireEmployee(s, 'kam');
}

/** Units the active customer base orders per week — the bot's infrastructure
 * reactions scale with this (fixed thresholds under-build once the volume
 * factors make lines bigger). */
function weeklyDemandUnits(s: GameState): number {
  return s.customers
    .filter((c) => c.active)
    .reduce((sum, c) => sum + c.lines.reduce((a, l) => a + l.volume, 0), 0);
}

/** The sinnvoll bot's growth step: expand whatever currently binds, but only
 * with spare cash — customer capacity (desk + KAM), shelf space (shelf or hall
 * expansion), prep throughput (tables), inbound dock. One action per bind and
 * tick. */
function sinnvollGrowth(s: GameState) {
  const monthly = monthlyRevenue(s);
  // 1. Customer capacity: small full, or medium unlocked & full → desk + KAM.
  const capacityBound =
    freeCapacity(s, 'small') <= 0 ||
    (monthly >= MEDIUM_UNLOCK_MONTHLY && freeCapacity(s, 'medium') <= 0);
  if (capacityBound && s.cash > 8000) {
    if (freeDesks(s) <= 0) {
      const tile = freeOfficeTile(s);
      if (tile) buildDesk(s, tile.gx, tile.gy);
      else {
        const blk = officeExpansionFrontier(s)[0];
        if (blk) expandOffice(s, blk);
      }
    }
    if (freeDesks(s) > 0) hireEmployee(s, 'kam');
  }
  // 2. Shelf headroom vs the growing weekly volume. Early game keeps the fixed
  // threshold (spending the thin starting cash on infrastructure kills runs);
  // from mid-game (40k monthly) it scales with actual demand, because fixed
  // 150 under-builds once the volume factors make lines bigger.
  const shelfTarget = monthly > 40_000 ? Math.max(150, weeklyDemandUnits(s) * 0.6) : 150;
  if (shelfFree(s) < shelfTarget && s.cash > 6000) {
    const tile = freeStorageTile(s);
    if (tile) buildShelf(s, tile.gx, tile.gy);
    else {
      const blk = hallExpansionFrontier(s)[0];
      if (blk) expandHall(s, blk);
    }
  }
  // 3. Prep tables scale with the warehouse crew.
  const lager = s.employees.filter((e) => e.role === 'lager').length;
  if (s.warehouse.tables.length < Math.min(8, lager) && s.cash > 4000) {
    const tile = freeStorageTile(s);
    if (tile) buildTable(s, tile.gx, tile.gy);
  }
  // 4. Inbound dock (mid-game on): keep two pallets of unloading buffer free,
  // so Monday deliveries don't jam for days at the fixed starting 6 slots.
  if (monthly > 40_000 && inboundFree(s) < 80 && s.cash > 8000) {
    const ramp = s.warehouse.tiles.find((t) => t.zone === 'ramp');
    if (ramp) buildInboundSlot(s, ramp.gx, ramp.gy);
  }
}

/** The sinnvoll bot renegotiates contract prices the way the game intends
 * since the reprice rework: entry prices sit below target, and with good
 * service (≥ 4★) it pushes lines toward the target margin in modest +5 %
 * steps per cooldown window — the honest counterpart of a real player. */
function sinnvollReprice(s: GameState) {
  for (const cust of s.customers) {
    if (!cust.active || cust.serviceRating < 4) continue;
    for (const line of cust.lines) {
      const target = targetMarginPrice(line.productId);
      if (line.price >= target) continue;
      if (repriceCooldownLeft(s, line) > 0) continue;
      const step = Math.min(target, Math.round(line.agreedPrice * 1.05 * 2) / 2);
      if (step > line.price) setCustomerLinePrice(s, cust.id, line.productId, step);
    }
  }
}

/** A free storage tile at a given site (branch-aware) for maxeff builds. */
function freeStorageTileAt(s: GameState, site: 'hq' | 'sued'): { gx: number; gy: number } | null {
  const w = site === 'sued' && s.branches?.sued ? s.branches.sued : s.warehouse;
  for (const t of w.tiles) {
    if (t.zone !== 'storage') continue;
    if (w.shelves.some((x) => x.gx === t.gx && x.gy === t.gy)) continue;
    if (w.tables.some((x) => x.gx === t.gx && x.gy === t.gy)) continue;
    if (placementBlocksAccess(s, t.gx, t.gy, site)) continue;
    return t;
  }
  return null;
}

/** Ensure ONE free office desk exists (build or expand office). Office staff
 * (KAM/Einkäufer/Sales) all sit centrally at HQ. */
function ensureDesk(s: GameState) {
  if (freeDesks(s) > 0) return;
  const tile = freeOfficeTile(s);
  if (tile) buildDesk(s, tile.gx, tile.gy);
  else {
    const blk = officeExpansionFrontier(s)[0];
    if (blk) {
      expandOffice(s, blk);
      const t2 = freeOfficeTile(s);
      if (t2) buildDesk(s, t2.gx, t2.gy);
    }
  }
}

/**
 * MAX-EFFICIENCY bot — the optimal-play ceiling. Models how a perfect, NON-reckless
 * operator scales, to measure whether the endgame trivialises. Two insights drive it:
 *
 *   • Survival first. It plays the proven sinnvoll reactive baseline throughout, so
 *     the fragile early/mid game is nursed exactly like the healthy baseline bot.
 *   • Throughput BEFORE demand. The binding constraint is warehouse throughput —
 *     prep tables + equipment. sinnvoll self-caps at 8 tables and never buys gear, so
 *     it plateaus ~120k/month. maxeff runs two tiers instead:
 *       TIER 1 "scaling"   (modest health): raise the throughput ceiling — build prep
 *                          tables past 8, buy prep equipment, staff/shelf/dock to volume.
 *       TIER 2 "expansion" (fortress only): only from a throughput fortress does it ADD
 *                          demand — breadth, sales reps, slot buffer, branch, big orders.
 *     Adding demand before throughput is the over-extension trap the game punishes.
 *
 * Every discretionary spend respects a cash `reserve`, so it can never over-extend.
 */
function maxEff(s: GameState, profile: 'max' | 'ambi' = 'max') {
  const monthly = monthlyRevenue(s);
  const ambi = profile === 'ambi';
  s.settings.buyerOrderBuffer = 0.15;

  // Survival baseline (runs always): the proven sinnvoll reactive growth (HQ
  // capacity/shelf/table/inbound + desk+KAM on a bind) plus the main-loop lager-on-
  // lateness and cold-zone blocks (generalized to maxeff). This IS the healthy bot.
  sinnvollGrowth(s);

  const volAt = (site: 'hq' | 'sued') =>
    s.customers
      .filter((c) => c.active && (c.region ?? 'hq') === site)
      .reduce((a, c) => a + c.lines.reduce((x, l) => x + l.volume, 0), 0);
  const crewAt = (site: 'hq' | 'sued') =>
    s.employees.filter((e) => e.role === 'lager' && (e.siteId ?? 'hq') === site).length;
  const sites = () => (branchOpen(s) ? (['hq', 'sued'] as const) : (['hq'] as const));
  const whOf = (site: 'hq' | 'sued') => (site === 'sued' && s.branches?.sued ? s.branches.sued : s.warehouse);

  // ============ TIER 1 — THROUGHPUT (raise the ceiling before adding demand) ============
  // Modest health gate: a stable, mildly profitable operation. Everything here FIXES
  // the bottleneck (more prep tables, faster gear, staff/space to match volume) → less
  // lateness → better service → survival. Reserve kept low so it can build during the
  // mid-game crunch, which is exactly when throughput needs raising.
  // Der ambitionierte Bot bleibt in Jahr 1 schlank (nur sinnvollGrowth) und beginnt
  // die aggressive Skalierung erst NACH der Jahr-1-Durchsatz-/Kassenklippe (ab 55k),
  // sonst überbaut er die Nachfrage und stirbt (wie maxeff).
  const scaling = monthly > (ambi ? 55_000 : 25_000) && s.serviceStars >= 3.8;
  if (scaling) {
    // Reserve MUST exceed a week's inventory buy, or scaling spend starves the stock
    // order → stockout → idle prep → late → churn (the year-2 death cliff). Tie it to
    // turnover: a bigger operation buys more stock each week and needs a fatter cushion.
    // Der ambitionierte Bot skaliert genauso aggressiv, hält aber eine deutlich
    // dickere Reserve — er soll die Decke ERREICHEN und dabei ÜBERLEBEN (nicht wie
    // maxeff die Über-Extension messen).
    const reserve = ambi ? Math.max(30_000, monthly * 0.5) : Math.max(18_000, monthly * 0.35);
    const afford = (cost: number) => s.cash - cost >= reserve;

    for (const site of sites()) {
      const crew = crewAt(site);
      const vol = volAt(site);
      const w = whOf(site);
      // Proactive lager sized to volume (~180 units/worker/week), PER SITE.
      if (crew < Math.min(18, Math.max(site === 'hq' ? 2 : 1, Math.ceil(vol / 180))) && afford(6_000)) {
        hireEmployee(s, 'lager', site);
      }
      // Prep tables BEYOND sinnvoll's 8-cap — the real throughput lever. One per
      // 2 lager, so headcount and prep stations grow together.
      if (w.tables.length < Math.min(20, Math.floor(crewAt(site) / 1.5)) && afford(4_000)) {
        const t = freeStorageTileAt(s, site);
        if (t) buildTable(s, t.gx, t.gy, site);
      }
      // Cold + normal shelf headroom vs volume.
      const carriesCold = s.products.some(
        (p) => getProductDef(p.id).requiresCooling && supplierAtSite(p.id, site),
      );
      if (carriesCold && coldShelfFree(s, site) < 120 && afford(4_000)) {
        const t = freeStorageTileAt(s, site);
        if (t) { buildCoolZone(s, t.gx, t.gy, site); buildShelf(s, t.gx, t.gy, site); }
      }
      if (shelfFree(s, site) < Math.max(200, vol * 0.7) && afford(5_000)) {
        const t = freeStorageTileAt(s, site);
        if (t) buildShelf(s, t.gx, t.gy, site);
        else {
          const blk = hallExpansionFrontier(s, site)[0];
          if (blk) expandHall(s, blk, site);
        }
      }
      // Inbound dock so Monday deliveries don't jam.
      if (inboundFree(s, site) < 80 && afford(8_000)) {
        const ramp = w.tiles.find((t) => t.zone === 'ramp');
        if (ramp) buildInboundSlot(s, ramp.gx, ramp.gy, site);
      }
    }

    // Training: skill DIRECTLY multiplies prep speed — a fully-trained worker (skill
    // 100) preps 2× as fast as a fresh skill-45 hire, for only ~1.4k total. It is by
    // far the cheapest throughput lever and BOTH baseline bots ignore it, hiring slow
    // bodies instead. Train the crew toward skill ~90, least-skilled first.
    const lagerCrew = s.employees.filter((e) => e.role === 'lager');
    const avgSkill = lagerCrew.reduce((a, e) => a + e.skill, 0) / (lagerCrew.length || 1);
    if (avgSkill < 90) {
      const trainee = lagerCrew.filter((e) => e.skill < 100).sort((a, b) => a.skill - b.skill)[0];
      if (trainee && s.cash > 8_000) trainEmployee(s, trainee.id);
    }

    // Equipment: prep-speed / per-worker gear up to crew, facilities to max. This is
    // the OTHER throughput lever sinnvoll never touches — it lifts the plateau.
    const crewTotal = s.employees.filter((e) => e.role === 'lager').length;
    for (const def of EQUIPMENT_DEFS) {
      const owned = equipmentLevel(s, def.id);
      if (owned >= def.max) continue;
      const target = def.kind === 'perWorker' ? Math.min(def.max, crewTotal) : def.max;
      if (owned < target && afford(def.price(owned + 1))) buyEquipment(s, def.id);
    }

    // One Einkäufer per BUYER_PRODUCT_CAPACITY groups (auto-order + reprice damping).
    const buyersNeeded = Math.ceil(s.products.length / BUYER_PRODUCT_CAPACITY);
    if (
      s.products.length > BUYER_PRODUCT_CAPACITY &&
      s.employees.filter((e) => e.role === 'einkaeufer').length < buyersNeeded &&
      afford(12_000)
    ) {
      ensureDesk(s);
      if (freeDesks(s) > 0) hireEmployee(s, 'einkaeufer');
    }
  }

  // ============ TIER 2 — DEMAND (only from a throughput FORTRESS) ============
  // Strong turnover AND healthy service, or a deep war-chest. Only now does the bot
  // ADD demand: breadth, active acquisition, spare slots, the branch. Doing this on a
  // shaky base is precisely the over-extension trap — sinnvoll survives the mid-game
  // lateness wall *because* it never piles this on there.
  const fortress = (monthly > 90_000 && s.serviceStars >= 4.2) || s.cash > 150_000;
  if (!fortress) return;
  // Even fatter cushion before ADDING demand — a new customer/product raises the
  // weekly stock buy immediately, so keep well clear of the inventory-starve cliff.
  const reserve = ambi ? Math.max(50_000, monthly * 0.7) : Math.max(35_000, monthly * 0.5);
  const afford = (cost: number) => s.cash - cost >= reserve;

  // Product breadth — ONE group at a time, only with healthy service and cold-shelf
  // headroom (a new SKU needs stock + cold shelving before its orders land).
  const coldTight = s.products.some((p) => getProductDef(p.id).requiresCooling) && coldShelfFree(s) < 80;
  if (s.serviceStars >= 4.3 && !coldTight) {
    for (const def of PRODUCT_DEFS) {
      if (s.products.some((p) => p.id === def.id)) continue;
      if (def.exclusiveSite === 'sued' && !branchOpen(s)) continue;
      if (weekOf(s.totalDays) < def.unlockWeek) continue;
      if (afford(def.listingFee + 30_000)) { addProduct(s, def.id); break; }
    }
  }

  // Sales reps enlarge the reachable market (diminishing returns). Der ambitionierte
  // Bot geht auf mehr Reps, weil die Akquise-Rate (nicht der Durchsatz) der Engpass
  // Richtung 600k ist — so messen wir, ob der Markt überhaupt genug hergibt.
  if (s.employees.filter((e) => e.role === 'sales').length < (ambi ? 5 : 2) && afford(15_000)) {
    ensureDesk(s);
    if (freeDesks(s) > 0) hireEmployee(s, 'sales');
  }

  // Proactive customer-slot buffer so no inquiry is refused for lack of capacity.
  // NUR klein/mittel — Großkunden laufen über den Regional-KAM im Regionalbüro, ein
  // zentraler KAM gibt dafür KEINE Kapazität (sonst endloses nutzloses KAM-Hiring).
  const wantMed = monthly >= MEDIUM_UNLOCK_MONTHLY;
  const slotShort =
    freeCapacity(s, 'small') < 3 ||
    (wantMed && freeCapacity(s, 'medium') < 2);
  if (slotShort && afford(10_000)) {
    ensureDesk(s);
    if (freeDesks(s) > 0) hireEmployee(s, 'kam');
  }

  // Branch: open once affordable with a fat buffer (opening + ramp-up cost real cash).
  if (!branchOpen(s) && afford(BRANCH_PRICE + (ambi ? 40_000 : 30_000))) openBranch(s);
}

/** Does the supplier deliver this product to this site (mirror of the game rule,
 * kept local to avoid another import churn)? */
function supplierAtSite(id: GameState['products'][number]['id'], site: 'hq' | 'sued'): boolean {
  const def = getProductDef(id);
  if (def.exclusiveSite) return def.exclusiveSite === site;
  if (id === 'fisch') return site === 'hq';
  return true;
}

function runSim(strategy: Strategy, weeks: number): RunResult {
  const s = createInitialState();
  s.tutorial = null; // skip onboarding — isolate the steady-state economy
  s.settings.autoPrep = true;
  s.paused = false;
  s.speed = 4;

  const rows: WeekRow[] = [];
  const customerWeek: Record<number, number | null> = { 3: null, 4: null, 5: null };
  let minCash = s.cash;
  let minCashWeek = 0;
  let bankruptWeek: number | null = null;
  let month120kWeek: number | null = null;
  let month600kWeek: number | null = null;
  let reportsSeen = 0;
  let lastLate = 0;
  let demandChurns = 0;
  let totalChurned = 0;
  let weekChurned = 0;
  let prepSamples = 0;
  let tickSamples = 0;
  const seenNotes = new Set<string>();
  let guard = 0;

  while (weekOf(s.totalDays) < weeks && guard++ < 6_000_000) {
    advance(s, 250);
    const wk = weekOf(s.totalDays);

    // --- bot: handle inquiries per strategy ---
    if (strategy !== 'passiv') {
      for (const inq of s.inquiries.filter((i) => i.status === 'open')) {
        // Großaufträge (Paket 5) are a one-off BET on being able to fulfil in
        // time — a blind bot can't judge that, so the baseline bots decline them
        // (a sensible operator would too). The maxeff ceiling-bot, by contrast,
        // builds capacity far ahead of demand and takes every big-order bet — it
        // measures the upside a perfect operator captures.
        if (inq.bigOrder) {
          // The maxeff ceiling-bot takes big-order bets, but only from a FORTRESS
          // (robust turnover + healthy service, or a deep war-chest) — a big
          // commitment on a fragile base is the over-extension trap, not optimal
          // play. Mirrors the `fortress` gate in maxEff(). Others always decline.
          const est = (monthlyRevenue(s) > 90_000 && s.serviceStars >= 4.2) || s.cash > 150_000;
          if ((strategy === 'maxeff' || strategy === 'ambitioniert') && est) acceptBigOrder(s, inq.id);
          continue;
        }
        // New customers need free capacity; expansions of existing ones don't.
        if (!inq.existingCustomerId && freeCapacity(s, inq.type) <= 0) continue;
        if (strategy === 'greedy') {
          acceptInquiry(s, inq.id); // takes everything at the wish price, lowballs included
        } else if (strategy === 'kam_spam' || strategy === 'kam_spam_plus') {
          // Spam: every SMALL inquiry at the wish price (incl. demand inquiries
          // of existing small customers — they're annehmbar and add volume).
          if (inq.type === 'small') acceptInquiry(s, inq.id);
        } else {
          // sinnvoll & maxeff: reject clear lowballs, secure the target margin on
          // the rest — accept if the wish already meets it, else counter up to it
          // (may be rejected → irregular, earned growth). Def-based lookup: the
          // inquiry may target a product that isn't listed yet (accepting auto-lists it).
          const p = getProductDef(inq.preferredProduct);
          // A new product (not yet listed) means paying its listing fee AND tying
          // up cash in expensive stock. A sensible operator paces that expansion:
          // only list when there's a healthy cash buffer beyond the fee. (maxeff
          // pre-lists its whole assortment proactively once established, in maxEff().)
          const alreadyListed = s.products.some((pp) => pp.id === p.id);
          if (!alreadyListed && s.cash < p.listingFee + 20000) continue;
          const wishMargin = inq.targetPrice > 0 ? ((inq.targetPrice - p.einkaufspreis) / inq.targetPrice) * 100 : 0;
          if (wishMargin < p.zielmarge * 0.7) continue; // lowball — not worth it
          const target = targetMarginPrice(inq.preferredProduct);
          if (inq.targetPrice >= target) acceptInquiry(s, inq.id);
          else counterOffer(s, inq.id, target);
        }
      }
    }

    // --- bot: Konzern-Expansion (L3) — der besonnene Bot eröffnet den Standort
    // Süd erst mit dickem Kassenpuffer (Eröffnung + Anlauf kosten real mehr)
    // und stellt dann dort Lagerkräfte ein.
    if (strategy === 'sinnvoll' && !branchOpen(s) && s.cash > BRANCH_PRICE + 60000) {
      openBranch(s);
    }
    if (strategy === 'sinnvoll' && branchOpen(s)) {
      const suedCrew = s.employees.filter((e) => e.role === 'lager' && e.siteId === 'sued').length;
      const suedCustomers = s.customers.filter((c) => c.active && c.region === 'sued').length;
      if (suedCrew < Math.min(4, 1 + Math.ceil(suedCustomers / 4)) && s.cash > 8000) {
        hireEmployee(s, 'lager', 'sued');
      }
    }

    // --- bot: a sensible operator builds a cool zone + shelf once it carries a
    // cold-chain product (Käse/Tiefkühl/Feinkost) — the ware can ONLY be stored
    // in shelves on cool tiles; without one it spoils fast in inbound. Also
    // extend the zone when cold shelf space runs low. ---
    if (strategy === 'sinnvoll' || strategy === 'maxeff' || strategy === 'ambitioniert') {
      const needsColdSpace =
        coldChainGap(s) ||
        (s.products.some((p) => getProductDef(p.id).requiresCooling) && coldShelfFree(s) < 40);
      if (needsColdSpace && s.cash > 4000) {
        const t = freeStorageTile(s);
        if (t) {
          buildCoolZone(s, t.gx, t.gy);
          buildShelf(s, t.gx, t.gy);
        }
      }
    }

    // --- bot: order the deficit whenever the weekly window opens ---
    if (s.pendingOrderWeek != null) orderDeficit(s);

    // --- bot: sinnvoll (and the supported spam) hire a warehouse worker when
    // deliveries slip ---
    if ((strategy === 'sinnvoll' || strategy === 'kam_spam_plus' || strategy === 'maxeff' || strategy === 'ambitioniert') && s.stats.lateOrders > lastLate) {
      const lager = s.employees.filter((e) => e.role === 'lager').length;
      // maxeff/ambitioniert build prep tables past 8, so more lager can actually
      // prep; the reactive baselines keep their proven 12-cap.
      const cap = strategy === 'maxeff' || strategy === 'ambitioniert' ? 20 : 12;
      if (lager < cap) hireEmployee(s, 'lager');
    }
    lastLate = s.stats.lateOrders;

    // --- bot: sinnvoll (and the supported spam) grow the operation when
    // something binds ---
    if (strategy === 'sinnvoll' || strategy === 'kam_spam_plus') sinnvollGrowth(s);

    // --- bot: sinnvoll earns its margin through service-backed renegotiation ---
    if (strategy === 'sinnvoll') sinnvollReprice(s);

    // --- bot: maxeff plays every lever proactively (list/hire/build/equip/branch)
    // and pushes prices to target margin — the optimal-play ceiling measurement ---
    if (strategy === 'maxeff') {
      maxEff(s);
      sinnvollReprice(s);
    }
    // --- bot: ambitioniert — dieselben aggressiven Durchsatz-Hebel wie maxeff
    // (endlos Tische/Crew/Training/Ausrüstung + Standort Süd), aber mit dicker
    // Kassenreserve, damit er die 600k ERREICHT und überlebt. ---
    if (strategy === 'ambitioniert') {
      maxEff(s, 'ambi');
      sinnvollReprice(s);
    }

    // --- bot: the spam bots hire KAMs aggressively (naked kam_spam trails the
    // warehouse only per-week, see the report block below — deliberately too
    // late/too little) ---
    if (strategy === 'kam_spam' || strategy === 'kam_spam_plus') kamSpamStaffing(s);

    // --- measurement: average concurrent prep workers per week ---
    prepSamples += s.employees.filter((e) => e.task?.kind === 'prep').length;
    tickSamples += 1;

    // Churn is only visible in the notification stream (scanned incrementally —
    // the log is capped, an end-of-run scan misses early ones). Lateness churn
    // says "hat gekündigt", demand churn "zum Konkurrenten gewechselt".
    for (const note of s.notifications) {
      if (seenNotes.has(note.id)) continue;
      seenNotes.add(note.id);
      if (note.message.includes('zum Konkurrenten gewechselt')) {
        demandChurns++;
        totalChurned++;
        weekChurned++;
      } else if (note.message.includes('hat gekündigt')) {
        totalChurned++;
        weekChurned++;
      }
    }

    // milestone celebrations pause via the UI layer; here just drain the queue
    s.celebrateMilestones = [];
    // Multi-year runs: continue past the year-end pause (like "Weiterspielen").
    if (s.yearComplete) {
      s.yearComplete = false;
      s.paused = false;
    }

    // --- track customer-growth timing ---
    const n = activeCustomers(s);
    for (const target of [3, 4, 5]) {
      if (customerWeek[target] == null && n >= target) customerWeek[target] = wk;
    }
    if (s.cash < minCash) {
      minCash = s.cash;
      minCashWeek = wk;
    }

    // --- record one row per closed weekly report ---
    if (s.reports.length > reportsSeen) {
      const monthly = monthlyRevenue(s);
      if (month120kWeek == null && monthly >= MEDIUM_UNLOCK_MONTHLY) month120kWeek = wk;
      if (month600kWeek == null && monthly >= LARGE_UNLOCK_MONTHLY) month600kWeek = wk;
      const r = s.reports[s.reports.length - 1];
      rows.push({
        week: r.week,
        cash: r.cashEnd,
        profit: r.profit,
        k: activeByType(s, 'small'),
        m: activeByType(s, 'medium'),
        g: activeByType(s, 'large'),
        revenue: r.revenue,
        spoilage: r.spoilageLoss,
        open: s.orders.filter((o) => o.status === 'pending').length,
        late: r.lateOrders,
        kams: s.employees.filter((e) => e.role === 'kam').length,
        lager: s.employees.filter((e) => e.role === 'lager').length,
        stars: s.serviceStars,
        churned: weekChurned,
        prepBusy: tickSamples > 0 ? prepSamples / tickSamples : 0,
        tables: s.warehouse.tables.length,
      });
      weekChurned = 0;
      prepSamples = 0;
      tickSamples = 0;
      reportsSeen = s.reports.length;

      // kam_spam: deliberately minimal warehouse staffing — ONE extra Lager hire,
      // and only after a week that provably ended with ≥ 1 late order.
      if (strategy === 'kam_spam' && r.lateOrders >= 1) hireEmployee(s, 'lager');
    }

    if (s.gameOver) {
      bankruptWeek = wk;
      break;
    }
  }

  const firstProfit = rows.find((r) => r.profit > 0);
  return {
    rows,
    firstProfitWeek: firstProfit ? firstProfit.week : null,
    minCash,
    minCashWeek,
    bankruptWeek,
    endCash: s.cash,
    endCustomers: activeCustomers(s),
    customerWeek,
    month120kWeek,
    month600kWeek,
    endMonthly: monthlyRevenue(s),
    endProducts: s.products.length,
    ultimatumsHeld: s.stats.ultimatumsHeld,
    demandChurns,
    totalChurned,
    endKams: s.employees.filter((e) => e.role === 'kam').length,
    endLager: s.employees.filter((e) => e.role === 'lager').length,
    endLinesPerCustomer: (() => {
      const act = s.customers.filter((c) => c.active);
      return act.length ? act.reduce((sum, c) => sum + c.lines.length, 0) / act.length : 0;
    })(),
  };
}

// --- Formatting helpers -----------------------------------------------------

const pad = (v: string | number, w: number) => String(v).padStart(w);
const eur = (n: number) => Math.round(n).toLocaleString('de-DE');

function printWeeklyTable(res: RunResult) {
  console.log(
    [pad('W', 3), pad('Cash', 9), pad('Gewinn', 8), pad('kum.Gew', 9), pad('k', 3), pad('m', 3), pad('g', 3), pad('KAM', 3), pad('Lag', 3), pad('⭐', 4), pad('spät', 5), pad('churn', 5), pad('prep', 7), pad('Verderb', 8)].join(' '),
  );
  let cum = 0;
  for (const r of res.rows) {
    cum += r.profit;
    console.log(
      [pad(r.week, 3), pad(eur(r.cash), 9), pad((r.profit >= 0 ? '+' : '') + eur(r.profit), 8), pad((cum >= 0 ? '+' : '') + eur(cum), 9), pad(r.k, 3), pad(r.m, 3), pad(r.g, 3), pad(r.kams, 3), pad(r.lager, 3), pad(r.stars.toFixed(1), 4), pad(r.late, 5), pad(r.churned, 5), pad(`${r.prepBusy.toFixed(1)}/${r.tables}`, 7), pad(eur(r.spoilage), 8)].join(' '),
    );
  }
}

// --- Aggregate over many runs (single runs are noisy) -----------------------

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function weekMetric(runs: RunResult[], week: number, pick: (r: WeekRow) => number): number {
  const vals = runs.map((run) => run.rows.find((r) => r.week === week)).filter(Boolean).map((r) => pick(r!));
  return avg(vals);
}

function aggregate(strategy: Strategy, N: number, weeks: number) {
  const runs = Array.from({ length: N }, () => runSim(strategy, weeks));
  const bankruptcies = runs.filter((r) => r.bankruptWeek != null);
  const firstProfits = runs.map((r) => r.firstProfitWeek).filter((w): w is number => w != null);

  console.log(`\n================  ${strategy.toUpperCase()}  ·  ${N} Läufe · ${weeks} Wochen  ================`);
  console.log('Wochengewinn Ø:  ' + [1, 2, 3, 4, 8, 12].map((w) => `W${w} ${weekMetric(runs, w, (r) => r.profit) >= 0 ? '+' : ''}${eur(weekMetric(runs, w, (r) => r.profit))}€`).join(' · '));
  console.log('Cash Ø:          ' + [2, 4, 8, 12, 24, 47].map((w) => `W${w} ${eur(weekMetric(runs, w, (r) => r.cash))}€`).join(' · '));
  console.log('Kunden Ø:        ' + [4, 8, 12, 24, 47].map((w) => `W${w} ${weekMetric(runs, w, (r) => r.k + r.m + r.g).toFixed(1)}`).join(' · '));
  console.log('Kunde #3 Ø Woche: ' + avg(runs.map((r) => r.customerWeek[3]).filter((w): w is number => w != null)).toFixed(1)
    + ' · #4 ' + avg(runs.map((r) => r.customerWeek[4]).filter((w): w is number => w != null)).toFixed(1)
    + ' · #5 ' + avg(runs.map((r) => r.customerWeek[5]).filter((w): w is number => w != null)).toFixed(1));
  console.log('Erste Gewinnwoche Ø: ' + (firstProfits.length ? avg(firstProfits).toFixed(1) : '—') + `  (in ${firstProfits.length}/${N} Läufen)`);
  console.log('Min-Cash Ø:      ' + eur(avg(runs.map((r) => r.minCash))) + '€  (Ø Woche ' + avg(runs.map((r) => r.minCashWeek)).toFixed(1) + ')');
  console.log('End-Cash Ø:      ' + eur(avg(runs.map((r) => r.endCash))) + '€ · End-Kunden Ø ' + avg(runs.map((r) => r.endCustomers)).toFixed(1));
  console.log('Bankrott:        ' + bankruptcies.length + '/' + N + (bankruptcies.length ? ` (Ø Woche ${avg(bankruptcies.map((r) => r.bankruptWeek!)).toFixed(1)})` : ''));
  // Unlock checkpoint (Entscheidungen R2/R3): rolling monthly revenue 120k/600k.
  const w120 = runs.map((r) => r.month120kWeek).filter((w): w is number => w != null);
  const w600 = runs.map((r) => r.month600kWeek).filter((w): w is number => w != null);
  console.log(
    'Checkpoint 120k: ' + (w120.length ? `Ø Woche ${avg(w120).toFixed(1)}` : 'nicht erreicht') + ` (${w120.length}/${N} Läufen)` +
    '  ·  600k: ' + (w600.length ? `Ø Woche ${avg(w600).toFixed(1)}` : 'nicht erreicht') + ` (${w600.length}/${N})` +
    '  ·  Monatsumsatz Ende Ø ' + eur(avg(runs.map((r) => r.endMonthly))) + '€',
  );
  // Wachstumsmotor: pulls the shop organically toward 2-3 product groups?
  console.log(
    'Wachstumsmotor:  Produktgruppen Ende Ø ' + avg(runs.map((r) => r.endProducts)).toFixed(1) +
    ' · Ultimaten gehalten Ø ' + avg(runs.map((r) => r.ultimatumsHeld)).toFixed(1) +
    ' · Demand-Abwanderungen Ø ' + avg(runs.map((r) => r.demandChurns)).toFixed(1) +
    ' · Linien/Kunde Ende Ø ' + avg(runs.map((r) => r.endLinesPerCustomer)).toFixed(2),
  );

  // --- Messauftrag KAM-Spam: Verlaufs- und Grenzertrags-Kennzahlen -----------
  const cumProfitAt = (run: RunResult, w: number) =>
    run.rows.filter((r) => r.week <= w).reduce((sum, r) => sum + r.profit, 0);
  const cps = [12, 24, 36, 48, 72, 95].filter((w) => w < weeks);
  console.log(
    'Kum. Gewinn Ø:   ' + cps.map((w) => `W${w} ${eur(avg(runs.map((r) => cumProfitAt(r, w))))}€`).join(' · '),
  );
  console.log(
    'Sterne Ø:        ' + cps.map((w) => `W${w} ${weekMetric(runs, w, (r) => r.stars).toFixed(1)}`).join(' · ') +
    '  ·  spät/Woche Ø: ' + cps.map((w) => `W${w} ${weekMetric(runs, w, (r) => r.late).toFixed(1)}`).join(' · '),
  );
  console.log(
    'Abwanderungen gesamt Ø: ' + avg(runs.map((r) => r.totalChurned)).toFixed(1) +
    ' · KAMs Ende Ø ' + avg(runs.map((r) => r.endKams)).toFixed(1) +
    ' · Lager Ende Ø ' + avg(runs.map((r) => r.endLager)).toFixed(1),
  );
  // Erste Woche, ab der Verspätungen REGELMÄSSIG auftreten (≥1 spät in zwei
  // aufeinanderfolgenden Wochen) + Kundenzahl an dem Punkt.
  const regular = runs
    .map((run) => {
      for (let i = 0; i + 1 < run.rows.length; i++) {
        if (run.rows[i].late >= 1 && run.rows[i + 1].late >= 1) return run.rows[i];
      }
      return null;
    })
    .filter((r): r is WeekRow => r != null);
  console.log(
    'Regelmäßig spät ab: ' + (regular.length
      ? `Ø Woche ${avg(regular.map((r) => r.week)).toFixed(1)} bei Ø ${avg(regular.map((r) => r.k + r.m + r.g)).toFixed(1)} Kunden (${regular.length}/${N} Läufen)`
      : `nie (${N} Läufe)`),
  );
  // Grenzertrag je KAM-Stufe: Ø Wochengewinn und Ø Kundenzahl, solange k KAMs
  // beschäftigt waren (über alle Läufe gepoolt; Wochen mit Stufenwechsel zählen
  // zur neuen Stufe).
  const byKams = new Map<number, { profits: number[]; customers: number[] }>();
  for (const run of runs) {
    for (const r of run.rows) {
      const b = byKams.get(r.kams) ?? { profits: [], customers: [] };
      b.profits.push(r.profit);
      b.customers.push(r.k + r.m + r.g);
      byKams.set(r.kams, b);
    }
  }
  console.log('Gewinn nach KAM-Zahl (Ø Woche · Ø Kunden · n Wochen):');
  for (const k of [...byKams.keys()].sort((a, b) => a - b)) {
    const b = byKams.get(k)!;
    console.log(
      `  ${k} KAM: ${(avg(b.profits) >= 0 ? '+' : '') + eur(avg(b.profits))}€ · ${avg(b.customers).toFixed(1)} Kunden · ${b.profits.length} Wo.`,
    );
  }
  return runs;
}

// --- Main -------------------------------------------------------------------

const arg = (process.argv[2] ?? 'all') as Strategy | 'all';
const N = Number(process.argv[3] ?? 25);
const WEEKS = Number(process.argv[4] ?? 48);
const strategies: Strategy[] = arg === 'all' ? ['passiv', 'greedy', 'sinnvoll', 'kam_spam'] : [arg];

for (const strat of strategies) {
  const runs = aggregate(strat, N, WEEKS);
  // Print one representative weekly table (the run whose end-cash is the median).
  const sorted = [...runs].sort((a, b) => a.endCash - b.endCash);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`\n--- Beispiel-Wochenverlauf (${strat}, Median-Lauf) ---`);
  printWeeklyTable(median);
}
