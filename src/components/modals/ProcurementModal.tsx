import { useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, hasEinkaeufer, orderRecommendation } from '../../game/simulation';
import { placeWeeklyOrder, type ActionResult } from '../../game/actions';
import { euro } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

export function ProcurementModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const einkaeufer = hasEinkaeufer(state);

  // This week's already-placed order (auto by the Einkäufer or a manual order the
  // player made earlier this week). Present => show a summary + override.
  const currentPo = state.purchaseOrders.find(
    (p) => p.id === state.currentWeekPoId && p.status === 'pending',
  );
  const [editing, setEditing] = useState(false);

  // Recommendations are computed once when the screen opens (the game is paused
  // during the Saturday prompt, so they stay stable).
  const recs = useMemo(
    () => state.products.map((p) => ({ product: p, rec: orderRecommendation(state, p.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [qty, setQty] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const { product, rec } of recs) init[product.id] = rec.qty;
    return init;
  });

  const setQ = (id: string, v: number) => setQty((s) => ({ ...s, [id]: Math.max(0, Math.round(v)) }));

  const priceOf = (id: string) => state.supplier.products.find((sp) => sp.productId === id)?.price ?? 0;
  const total = state.products.reduce((sum, p) => sum + (qty[p.id] || 0) * priceOf(p.id), 0);
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
    const items = state.products.map((p) => ({ productId: p.id, quantity: qty[p.id] || 0 }));
    let result: ActionResult = { ok: false };
    mutate((s) => {
      result = placeWeeklyOrder(s, items);
    });
    if (result.ok) onClose();
  };

  return (
    <Modal title="Wocheneinkauf · Samstag" icon="🛒" onClose={onClose} wide>
      <p className="hint">
        Jeden <b>Samstag</b> bestellst du für die kommende Woche. Die Empfehlung nutzt die
        aktuelle Nachfrage deiner Kunden (nächste Woche) und deckt gut eine Woche Bedarf abzüglich
        Lager. Lieferung kommt <b>Montag</b>.
      </p>

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
              const sliderMax = Math.max(100, rec.qty * 3, rec.stock + rec.qty);
              // How long the stock lasts once this order lands (weeks of demand).
              const afterStock = rec.stock + rec.incoming + q;
              const coverage = rec.weekDemand > 0 ? afterStock / rec.weekDemand : Infinity;
              const covCls =
                rec.weekDemand <= 0
                  ? 'pill'
                  : coverage < 1
                    ? 'pill bad'
                    : coverage < 1.4
                      ? 'pill warn'
                      : 'pill good';
              const covText = rec.weekDemand <= 0 ? '—' : `reicht ~${coverage.toFixed(1)} Wo`;
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
                        <span>· 🛒 Nachfrage nächste Woche {Math.round(rec.weekDemand)}</span>
                        {rec.expiring > 0 && (
                          <span style={{ color: 'var(--warn)' }}>· ⏳ {rec.expiring} verfällt</span>
                        )}
                      </div>
                    </div>
                    <span className="pill good" style={{ fontWeight: 700 }} title="Empfohlene Bestellmenge">
                      Empfehlung {rec.qty}
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
                    {rec.qty !== q && (
                      <button
                        className="btn small ghost"
                        title="Auf Empfehlung zurücksetzen"
                        onClick={() => setQ(product.id, rec.qty)}
                      >
                        ↺
                      </button>
                    )}
                    <span className={covCls} style={{ minWidth: 92, textAlign: 'center' }} title="Reichweite nach Lieferung">
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
            <button className="btn primary" disabled={total > budget} onClick={submit}>
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
