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
  freeCapacity,
  freeDesks,
  hallExpansionFrontier,
  managers,
  officeExpansionFrontier,
  orderOutlook,
  placementBlocksAccess,
  shelfFree,
} from '../src/game/simulation.ts';
import {
  acceptInquiry,
  buildDesk,
  buildShelf,
  buildTable,
  counterOffer,
  expandHall,
  expandOffice,
  hireEmployee,
  placeWeeklyOrder,
} from '../src/game/actions.ts';
import {
  getProductDef,
  LARGE_UNLOCK_MONTHLY,
  MEDIUM_UNLOCK_MONTHLY,
  monthlyRevenue,
} from '../src/game/constants.ts';
import { weekOf } from '../src/game/util.ts';
import type { CustomerType, GameState } from '../src/game/types.ts';

type Strategy = 'greedy' | 'passiv' | 'sinnvoll' | 'kam_spam' | 'kam_spam_plus';

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
  placeWeeklyOrder(
    s,
    s.products.map((p) => ({ productId: p.id, quantity: orderOutlook(s, p.id).deficit })),
  );
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

/** The sinnvoll bot's growth step: expand whatever currently binds, but only
 * with spare cash — customer capacity (desk + KAM), shelf space (shelf or hall
 * expansion), prep throughput (tables). One action per bind and tick. */
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
  // 2. Shelf headroom vs the growing weekly volume.
  if (shelfFree(s) < 150 && s.cash > 6000) {
    const tile = freeStorageTile(s);
    if (tile) buildShelf(s, tile.gx, tile.gy);
    else {
      const blk = hallExpansionFrontier(s)[0];
      if (blk) expandHall(s, blk);
    }
  }
  // 3. Prep tables scale with the warehouse crew.
  const lager = s.employees.filter((e) => e.role === 'lager').length;
  if (s.warehouse.tables.length < Math.min(6, lager) && s.cash > 4000) {
    const tile = freeStorageTile(s);
    if (tile) buildTable(s, tile.gx, tile.gy);
  }
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
        // New customers need free capacity; expansions of existing ones don't.
        if (!inq.existingCustomerId && freeCapacity(s, inq.type) <= 0) continue;
        if (strategy === 'greedy') {
          acceptInquiry(s, inq.id); // takes everything at the wish price, lowballs included
        } else if (strategy === 'kam_spam' || strategy === 'kam_spam_plus') {
          // Spam: every SMALL inquiry at the wish price (incl. demand inquiries
          // of existing small customers — they're annehmbar and add volume).
          if (inq.type === 'small') acceptInquiry(s, inq.id);
        } else {
          // sinnvoll: reject clear lowballs, secure the target margin on the rest —
          // accept if the wish already meets it, else counter up to it (may be
          // rejected → irregular, earned growth). Def-based lookup: the inquiry
          // may target a product that isn't listed yet (accepting auto-lists it).
          const p = getProductDef(inq.preferredProduct);
          const wishMargin = inq.targetPrice > 0 ? ((inq.targetPrice - p.einkaufspreis) / inq.targetPrice) * 100 : 0;
          if (wishMargin < p.zielmarge * 0.7) continue; // lowball — not worth it
          const target = targetMarginPrice(inq.preferredProduct);
          if (inq.targetPrice >= target) acceptInquiry(s, inq.id);
          else counterOffer(s, inq.id, target);
        }
      }
    }

    // --- bot: order the deficit whenever the weekly window opens ---
    if (s.pendingOrderWeek != null) orderDeficit(s);

    // --- bot: sinnvoll (and the supported spam) hire a warehouse worker when
    // deliveries slip ---
    if ((strategy === 'sinnvoll' || strategy === 'kam_spam_plus') && s.stats.lateOrders > lastLate) {
      const lager = s.employees.filter((e) => e.role === 'lager').length;
      if (lager < 10) hireEmployee(s, 'lager');
    }
    lastLate = s.stats.lateOrders;

    // --- bot: sinnvoll (and the supported spam) grow the operation when
    // something binds ---
    if (strategy === 'sinnvoll' || strategy === 'kam_spam_plus') sinnvollGrowth(s);

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
