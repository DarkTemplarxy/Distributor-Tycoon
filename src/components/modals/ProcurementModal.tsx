import { useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  availableCredit,
  branchOpen,
  hasActiveContract,
  hasEinkaeufer,
  orderOutlook,
  supplierUnitPrice,
} from '../../game/simulation';
import type { SiteId } from '../../game/types';
import {
  cancelSupplyContract,
  placeWeeklyOrder,
  signSupplyContract,
  type ActionResult,
} from '../../game/actions';
import { CONTRACT_PREMIUM, CONTRACT_WEEKS, SITE_META, supplierDeliversTo, VOLUME_DISCOUNT_TIERS } from '../../game/constants';
import { euro, weekOf } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

export function ProcurementModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const einkaeufer = hasEinkaeufer(state);
  const hasBranch = branchOpen(state);
  // L3: für welchen Standort diese Bestellung gilt — jeder Standort hat sein
  // eigenes Wochen-Bestellfenster (der Lieferant liefert direkt dorthin).
  const [orderSite, setOrderSite] = useState<SiteId>('hq');

  // This week's already-placed order (auto by the Einkäufer or a manual order the
  // player made earlier this week). Present => show a summary + override.
  const currentPoId = orderSite === 'sued' ? state.currentWeekPoIdSued : state.currentWeekPoId;
  const currentPo = state.purchaseOrders.find(
    (p) => p.id === currentPoId && p.status === 'pending',
  );
  const [editing, setEditing] = useState(false);

  // Facts are computed per site when the screen opens/switches. Regional-
  // exklusive Produkte (Fisch nur Nord, Wein/Oliven nur Süd) erscheinen nur im
  // Fenster ihres Standorts.
  const recs = useMemo(
    () =>
      state.products
        .filter((p) => supplierDeliversTo(p.id, orderSite))
        .map((p) => ({ product: p, rec: orderOutlook(state, p.id, orderSite) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderSite],
  );

  const [qty, setQty] = useState<Record<string, number>>({});

  const setQ = (id: string, v: number) => setQty((s) => ({ ...s, [id]: Math.max(0, Math.round(v)) }));

  const priceOf = (id: string) => supplierUnitPrice(state, id as never);
  const week = weekOf(state.totalDays);
  const bestTier = VOLUME_DISCOUNT_TIERS[VOLUME_DISCOUNT_TIERS.length - 1]; // smallest threshold
  const total = recs.reduce((sum, { product: p }) => sum + (qty[p.id] || 0) * priceOf(p.id), 0);
  const refundable = currentPo ? currentPo.totalCost : 0;
  const budget = state.cash + availableCredit(state) + refundable;

  const showSummary = !!currentPo && !editing;

  const startOverride = () => {
    const next: Record<string, number> = {};
    for (const p of state.products) next[p.id] = 0;
    for (const it of currentPo!.items) next[it.productId] = it.quantity;
    setQty(next);
    setEditing(true);
  };

  const submit = () => {
    const items = recs.map(({ product: p }) => ({ productId: p.id, quantity: qty[p.id] || 0 }));
    let result: ActionResult = { ok: false };
    mutate((s) => {
      result = placeWeeklyOrder(s, items, orderSite);
    });
    if (result.ok) {
      if (orderSite === 'hq' && hasBranch) {
        // Nach der Nord-Bestellung direkt zum Süd-Fenster wechseln.
        setOrderSite('sued');
        setQty({});
        setEditing(false);
      } else onClose();
    }
  };

  return (
    <Modal title="Wocheneinkauf · Samstag" icon="🛒" onClose={onClose} wide>
      <p className="hint">
        Jeden <b>Samstag</b> bestellst du für die kommende Woche — <b>du entscheidest die
        Menge</b>. Pro Produkt siehst du, wie viel <b>nächste Woche fix weggeht</b> (die
        Bestellmengen deiner Kunden), was auf Lager ist und was zuläuft. Lieferung kommt{' '}
        <b>Montag</b>.
      </p>

      {hasBranch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="sub">Bestellung für Standort:</span>
          {(['hq', 'sued'] as const).map((st) => (
            <button
              key={st}
              className={`btn small${orderSite === st ? ' primary' : ' ghost'}`}
              onClick={() => {
                setOrderSite(st);
                setQty({});
                setEditing(false);
              }}
            >
              {SITE_META[st].emoji} {SITE_META[st].short}
            </button>
          ))}
          <span className="sub" style={{ fontStyle: 'italic' }}>
            {orderSite === 'sued'
              ? 'Süd bekommt 🍷/🫒 exklusiv – Fisch nur per Transfer aus Nord.'
              : 'Nord bekommt 🐟 exklusiv – Wein/Oliven nur per Transfer aus Süd.'}
          </span>
        </div>
      )}

      <div
        className="row"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginBottom: 12 }}
      >
        <div className="title" style={{ fontSize: 13 }}>
          📝 Lieferverträge{' '}
          <span className="sub" style={{ fontWeight: 400 }}>
            · Preis {CONTRACT_WEEKS} Wochen fixieren (+{Math.round(CONTRACT_PREMIUM * 100)}% Prämie) – schützt vor Erhöhungen
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.supplier.products.map((sp) => {
            const p = state.products.find((pr) => pr.id === sp.productId);
            const active = hasActiveContract(state, sp.productId);
            const left = active ? sp.contract!.untilWeek - week : 0;
            return (
              <div
                key={sp.productId}
                className="row"
                style={{ padding: '6px 9px', gap: 8, flex: '1 1 200px', minWidth: 190 }}
              >
                <span style={{ fontSize: 16 }}>{p?.emoji}</span>
                <div className="grow">
                  <div className="sub" style={{ color: PRODUCT_COLOR[sp.productId], fontWeight: 600 }}>
                    {p?.name}
                  </div>
                  <div className="sub">
                    {active
                      ? `Vertrag €${sp.contract!.price.toFixed(2)} · noch ${left} Wo`
                      : `Spot €${sp.price.toFixed(2)}`}
                  </div>
                </div>
                {active ? (
                  <button className="btn small ghost" onClick={() => mutate((s) => cancelSupplyContract(s, sp.productId))}>
                    Beenden
                  </button>
                ) : (
                  <button className="btn small" onClick={() => mutate((s) => signSupplyContract(s, sp.productId))}>
                    Fixieren
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="sub" style={{ fontStyle: 'italic' }}>
          💡 Mengenrabatt: ab {bestTier.min}× eines Produkts sinkt der Stückpreis (bis −
          {Math.round(VOLUME_DISCOUNT_TIERS[0].discount * 100)}% bei {VOLUME_DISCOUNT_TIERS[0].min}×).
        </div>
      </div>

      {showSummary ? (
        // ---- Order already placed this week (auto or manual) ----
        <div className="row" style={{ borderColor: 'var(--good)', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22 }}>✓</span>
          <div className="grow">
            <div className="title" style={{ fontSize: 14 }}>
              {einkaeufer ? 'Einkäufer hat automatisch bestellt' : 'Diese Woche bereits bestellt'}
            </div>
            <div className="sub" style={{ marginTop: 4 }}>
              {currentPo!.items.map((it) => {
                const p = state.products.find((pr) => pr.id === it.productId);
                return (
                  <span key={it.productId} style={{ marginRight: 10 }}>
                    {p?.emoji} {it.quantity}× {p?.name ?? it.productId}
                  </span>
                );
              })}
            </div>
            <div className="sub" style={{ marginTop: 2 }}>Gesamt {euro(currentPo!.totalCost)}</div>
          </div>
          <button className="btn small" onClick={startOverride}>
            ÜBERSCHREIBEN
          </button>
        </div>
      ) : (
        // ---- Order editor: one preset slider per product ----
        <>
          <div className="rows">
            {recs.map(({ product, rec }) => {
              const q = qty[product.id] || 0;
              const price = priceOf(product.id);
              const sliderMax = Math.max(100, Math.round(rec.fixDemand * 3), rec.stock + Math.round(rec.fixDemand));
              // How long the stock lasts once this order lands (weeks of fixed demand).
              const afterStock = rec.stock + rec.incoming + q;
              const coverage = rec.fixDemand > 0 ? afterStock / rec.fixDemand : Infinity;
              const covCls =
                rec.fixDemand <= 0
                  ? 'pill'
                  : coverage < 1
                    ? 'pill bad'
                    : coverage < 1.4
                      ? 'pill warn'
                      : 'pill good';
              const covText = rec.fixDemand <= 0 ? '—' : `reicht ~${coverage.toFixed(1)} Wo`;
              return (
                <div
                  key={product.id}
                  className="row"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{product.emoji}</span>
                    <div className="grow">
                      <div className="title" style={{ color: PRODUCT_COLOR[product.id] }}>
                        {product.name} <span className="sub">· EK {price}€/Stk</span>
                      </div>
                      <div
                        className="sub"
                        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
                      >
                        <span>📦 Lager {rec.stock}</span>
                        {rec.incoming > 0 && <span>· 🚚 {rec.incoming} im Zulauf</span>}
                        {rec.backlog > 0 && (
                          <span style={{ color: 'var(--warn)' }}>· 📋 {rec.backlog} offene Aufträge</span>
                        )}
                        {rec.expiring > 0 && (
                          <span style={{ color: 'var(--warn)' }}>· ⏳ {rec.expiring} verfällt</span>
                        )}
                      </div>
                    </div>
                    <span
                      className="pill"
                      style={{ fontWeight: 700 }}
                      title="Summe der fixen Kundenbestellungen nächste Woche"
                    >
                      🛒 Fix weg nächste Woche: {Math.round(rec.fixDemand)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={5}
                      value={Math.min(q, sliderMax)}
                      onChange={(e) => setQ(product.id, Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="num-input"
                      type="number"
                      min={0}
                      step={5}
                      value={q}
                      onChange={(e) => setQ(product.id, Number(e.target.value))}
                    />
                    <span className={covCls} style={{ minWidth: 92, textAlign: 'center' }} title="Reichweite nach Lieferung (in Wochen fixer Nachfrage)">
                      {covText}
                    </span>
                    <span style={{ width: 82, textAlign: 'right', color: 'var(--text-dim)' }}>
                      {euro(q * price)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 14,
              justifyContent: 'flex-end',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16 }}>Gesamt: {euro(total)}</div>
            <button
              className={`btn primary${
                // Glows whenever the tutorial raised this order window (ordering
                // beat or the meat lesson) — the next step is confirming here.
                total <= budget && state.tutorial?.active && state.pendingOrderWeek != null
                  ? ' tut-glow'
                  : ''
              }`}
              disabled={total > budget}
              onClick={submit}
            >
              BESTELLEN
            </button>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 14, fontStyle: 'italic' }}>
        Lieferung nächsten Montag
      </p>
    </Modal>
  );
}
