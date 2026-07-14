# 🏭 Distributor Tycoon — MVP Phase 1

A top-down **food-distribution business simulation** (in the spirit of *Software Inc.* /
*Two Point Hospital*). You take over your uncle's small wholesale business — 2 customers,
1 supplier, 2 warehouse workers — and try to grow it through a **52-week** season.

Built with **React + TypeScript + Vite**. Graphics are intentionally ultra-simple for this
phase (colored boxes, text and emoji 👷 📦 🚚); sprites come later. The focus of Phase 1 is
that **all the economic mechanics actually work**.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc only
```

The whole game state is saved to **localStorage** every few seconds (and on tab close), so a
52-week session can be paused and resumed. Use 💾 to save manually and 🔄 to start a new game.

---

## How to play

- **▶ / speed** (`0.5× 1× 2× 4×`, or **Spacebar** to pause): time runs in real time.
  1 in-game day ≈ 12 s at 1×.
- Customers place **weekly orders** with a delivery deadline. The 🚚 truck comes by **every day
  at 18:00** and picks up whatever palettes are ready — so goods ship as soon as they're
  prepared (payment then follows a week after that delivery).
- **🧺 Sortiment**: you start with **only Fischfilet**. New product groups unlock over time
  (**Fleisch ab Woche 3, Gemüse ab Woche 8**); add them to your assortment for a small listing
  fee, then **pre-stock** them before winning customers for them.
- **🛒 Einkauf**: order stock from the supplier (1-week lead time). Optionally enable
  **auto-restock** per product (fish is on by default).
- **👷 Herrichtung**: workers prepare palettes automatically ("Auto-Herrichten" toggle), or
  start one manually from the order card. Each customer order = its own palette.
- **💰 Payment** arrives **1 week after** delivery.
- **📨 Anfragen**: make offers to potential customers (cheaper = higher chance). New customers
  need free **Key-Account-Manager** capacity.
- **🏦 Finanzen**: take/repay bank credit (2 %/week interest; limit scales with your profit).
- **🏷️ Preise / 🤝 Kunden**: set sales prices / target margins, and grant discounts (which
  progressively raise demand).

Watch out for **⏰ late deliveries** (3 strikes → the customer quits, more if your service
stars are high) and **🗑️ spoilage** (fish 21 d, meat 42 d, veg 56 d).

---

## Mechanics implemented (Phase 1 scope)

- ✅ Real-time sim with a day/week/quarter clock and 0.5×–4× speed
- ✅ Inventory with per-batch expiry, FIFO consumption and spoilage (visual warnings)
- ✅ Dynamic customer orders (seasonal trends, volatility, discounts, delivery deadlines)
- ✅ Order fulfilment: worker assignment, skill-based prep time, palette creation
- ✅ Daily 18:00 truck pickup with per-palette logistics cost, shown in the isometric scene
- ✅ Top-down isometric warehouse scene (canvas): shelves fill with pallets, workers walk & prep, truck drives in
- ✅ Payment scheduling (1-week delay), shown in the finance modal
- ✅ Product pricing with configurable target margins + auto-price
- ✅ Assortment expansion: start with fish only, unlock & add Fleisch/Gemüse mid-game (listing fee, pre-stocking)
- ✅ Supplier procurement with lead time; quarterly price increases (an Einkäufer negotiates them down)
- ✅ Employee hiring / training / firing (Lager, KAM, Einkäufer) with capacity constraints
- ✅ Service stars per customer, tolerance & termination on repeated lateness
- ✅ Bank credit (2 %/week, profit-scaled limit, auto-draw to avoid overdraft)
- ✅ Weekly reports + statistics (revenue, costs, profit chart, alerts)
- ✅ Customer-inquiry / offer workflow (1-week response)
- ✅ Save / load to localStorage; year-end report; bankruptcy / game-over

Later phases: multiple suppliers, product-group expansion beyond the start, Spediteur
negotiation, marketing manager, scenarios, real sprites/animations.

---

## Architecture

```
src/
  game/
    types.ts         # all state shapes (plain JSON-serialisable objects)
    constants.ts     # every tunable number (prices, salaries, seasonality, thresholds…)
    init.ts          # the "Der Onkel" starting scenario
    simulation.ts    # advance(state, dtMs): the whole tick engine (pure, no React/DOM)
    actions.ts       # player actions (buy, hire, price, offer, credit…)
    storage.ts       # localStorage save/load
    util.ts          # ids, RNG, time math, € formatting
  state/
    GameProvider.tsx # owns state in a ref, drives the setInterval game loop, exposes useGame()
  components/        # TopBar, IsometricWarehouse (canvas scene), OrdersPanel, ActionBar, Toasts
    modals/          # Inventory, Sortiment, Procurement, Pricing, Customers,
                     #   Inquiries, Employees, Finance, Reports, Log
```

The simulation is a **pure module**: `advance(state, realDeltaMs)` mutates a plain state
object and fires every discrete event (day starts, weekly rollovers, daily 18:00 pickups, PO
deliveries, payments, spoilage, worker progress) that fell inside the elapsed interval. The
React layer only calls it on a fixed `setInterval` loop and renders the result — which makes
the economy testable headlessly, independent of the UI.

### Balance notes

A few constants in `constants.ts` were tuned away from the spec's illustrative values so a
full 52-week session is actually survivable and winnable for a careful player (validated by
running the pure engine headlessly for a full season):

- Starting cash `€10,000` and a `€4,000` credit floor — real working capital for the ramp
  (inventory is bought up-front while customer payments lag a week).
- Base capacity of 8 small customers before a KAM is required.
- Medium/large unlock thresholds lowered to `€4k` / `€20k` weekly revenue so those mechanics
  are reachable within one season.
- New inquiries are biased toward products you already stock, and new customers get a
  one-week grace before their first order — otherwise a new customer's first order is always
  late (the supply lead time equals the delivery deadline).

All of these are single numbers, easy to re-tune for later balancing passes.
