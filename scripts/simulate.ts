// ============================================================================
// Balancing harness — runs the real simulation WITHOUT any UI, driving a simple
// bot day-by-day through a 48-week year, and prints the weekly curve plus an
// aggregate over many runs. It's the tool for tuning the early game against the
// target curve; it adds no runtime dependency to the game (run via `npx tsx`).
//
//   npx tsx scripts/simulate.ts [greedy|passiv|sinnvoll|all] [runs]
//
// Strategies:
//   greedy   — accepts EVERY inquiry at its wish price, orders the deficit,
//              never hires or builds.
//   passiv   — accepts NO inquiries, orders the deficit.
//   sinnvoll — accepts an inquiry only if its wish price already reaches the
//              target margin AND there's free capacity; orders the deficit;
//              hires one warehouse worker when deliveries start slipping.
//
// simulation.ts / actions.ts use no DOM or browser APIs (localStorage lives only
// in save/BrowserStorage.ts, which the harness never touches), so the engine runs
// unchanged here.
// ============================================================================

import { createInitialState } from '../src/game/init.ts';
import {
  advance,
  freeCapacity,
  getProduct,
  orderOutlook,
} from '../src/game/simulation.ts';
import { acceptInquiry, hireEmployee, placeWeeklyOrder } from '../src/game/actions.ts';
import { weekOf } from '../src/game/util.ts';
import type { CustomerType, GameState } from '../src/game/types.ts';

type Strategy = 'greedy' | 'passiv' | 'sinnvoll';

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

/** Would accepting this inquiry at its wish price reach the product's target
 * margin? Used by the `sinnvoll` bot to only take deals worth taking. */
function wishPriceHitsTarget(s: GameState, preferredProduct: GameState['products'][number]['id'], wish: number): boolean {
  const p = getProduct(s, preferredProduct);
  const margin = wish > 0 ? ((wish - p.einkaufspreis) / wish) * 100 : 0;
  return margin >= p.zielmarge;
}

function runSim(strategy: Strategy): RunResult {
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
  let reportsSeen = 0;
  let lastLate = 0;
  let guard = 0;

  while (weekOf(s.totalDays) < 48 && guard++ < 2_000_000) {
    advance(s, 250);
    const wk = weekOf(s.totalDays);

    // --- bot: accept inquiries per strategy ---
    if (strategy !== 'passiv') {
      for (const inq of s.inquiries.filter((i) => i.status === 'open')) {
        if (inq.existingCustomerId) {
          // Expansion of an existing customer — greedy takes it, sinnvoll only if it pays.
          if (strategy === 'greedy' || wishPriceHitsTarget(s, inq.preferredProduct, inq.targetPrice)) {
            acceptInquiry(s, inq.id);
          }
          continue;
        }
        if (freeCapacity(s, inq.type) <= 0) continue;
        if (strategy === 'greedy') acceptInquiry(s, inq.id);
        else if (wishPriceHitsTarget(s, inq.preferredProduct, inq.targetPrice)) acceptInquiry(s, inq.id);
      }
    }

    // --- bot: order the deficit whenever the weekly window opens ---
    if (s.pendingOrderWeek != null) orderDeficit(s);

    // --- bot: sinnvoll hires a warehouse worker when deliveries slip ---
    if (strategy === 'sinnvoll' && s.stats.lateOrders > lastLate) {
      const lager = s.employees.filter((e) => e.role === 'lager').length;
      if (lager < 4) hireEmployee(s, 'lager');
    }
    lastLate = s.stats.lateOrders;

    // milestone celebrations pause via the UI layer; here just drain the queue
    s.celebrateMilestones = [];

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
      });
      reportsSeen = s.reports.length;
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
  };
}

// --- Formatting helpers -----------------------------------------------------

const pad = (v: string | number, w: number) => String(v).padStart(w);
const eur = (n: number) => Math.round(n).toLocaleString('de-DE');

function printWeeklyTable(res: RunResult) {
  console.log(
    [pad('W', 3), pad('Cash', 9), pad('Gewinn', 8), pad('k', 3), pad('m', 3), pad('g', 3), pad('Umsatz', 8), pad('Verderb', 8), pad('offen', 6), pad('spät', 5)].join(' '),
  );
  for (const r of res.rows) {
    console.log(
      [pad(r.week, 3), pad(eur(r.cash), 9), pad((r.profit >= 0 ? '+' : '') + eur(r.profit), 8), pad(r.k, 3), pad(r.m, 3), pad(r.g, 3), pad(eur(r.revenue), 8), pad(eur(r.spoilage), 8), pad(r.open, 6), pad(r.late, 5)].join(' '),
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

function aggregate(strategy: Strategy, N: number) {
  const runs = Array.from({ length: N }, () => runSim(strategy));
  const bankruptcies = runs.filter((r) => r.bankruptWeek != null);
  const firstProfits = runs.map((r) => r.firstProfitWeek).filter((w): w is number => w != null);

  console.log(`\n================  ${strategy.toUpperCase()}  ·  ${N} Läufe  ================`);
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
  return runs;
}

// --- Main -------------------------------------------------------------------

const arg = (process.argv[2] ?? 'all') as Strategy | 'all';
const N = Number(process.argv[3] ?? 25);
const strategies: Strategy[] = arg === 'all' ? ['passiv', 'greedy', 'sinnvoll'] : [arg];

for (const strat of strategies) {
  const runs = aggregate(strat, N);
  // Print one representative weekly table (the run whose end-cash is the median).
  const sorted = [...runs].sort((a, b) => a.endCash - b.endCash);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`\n--- Beispiel-Wochenverlauf (${strat}, Median-Lauf) ---`);
  printWeeklyTable(median);
}
