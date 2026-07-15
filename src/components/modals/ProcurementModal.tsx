import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  availableCredit,
  hasEinkaeufer,
  incomingPO,
  inventoryTotal,
  weeklyDemand,
} from '../../game/simulation';
import { createPurchaseOrder, setAutoRestock, type ActionResult } from '../../game/actions';
import { euro } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

export function ProcurementModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const total = state.supplier.products.reduce((sum, sp) => sum + (qty[sp.productId] || 0) * sp.price, 0);
  const budget = state.cash + availableCredit(state);
  const einkaeufer = hasEinkaeufer(state);
  const pendingPOs = state.purchaseOrders.filter((po) => po.status === 'pending');

  const setQ = (id: string, v: number) => setQty((s) => ({ ...s, [id]: Math.max(0, Math.round(v)) }));

  const order = () => {
    const items = state.supplier.products.map((sp) => ({
      productId: sp.productId,
      quantity: qty[sp.productId] || 0,
    }));
    let result: ActionResult = { ok: false };
    mutate((s) => {
      result = createPurchaseOrder(s, items);
    });
    if (result.ok) {
      setQty({});
      setMsg('✅ Bestellung aufgegeben – Lieferung in 1 Woche.');
    } else {
      setMsg('⚠️ ' + (result.message ?? 'Fehler'));
    }
  };

  return (
    <Modal title="Einkauf · Beschaffung" icon="🛒" onClose={onClose} wide>
      <p className="hint">
        Lieferant <b>{state.supplier.name}</b> · Lieferzeit 1 Woche · Zahlung sofort. Plane pro
        Produkt anhand von <b>Bedarf</b> und <b>Lagerstand</b>. Bezahlbar bis {euro(budget)} (inkl.
        Kredit).
      </p>

      <div className="rows">
        {state.supplier.products.map((sp) => {
          const product = state.products.find((p) => p.id === sp.productId)!;
          const stock = inventoryTotal(product);
          const incoming = incomingPO(state, sp.productId);
          const demand = weeklyDemand(state, sp.productId);
          const coverage = demand > 0 ? (stock + incoming) / demand : Infinity;
          const covCls = demand === 0 ? 'pill' : coverage < 1 ? 'pill bad' : coverage < 2 ? 'pill warn' : 'pill good';
          const covText = demand === 0 ? '—' : `${coverage.toFixed(1)} Wo`;
          const q = qty[sp.productId] || 0;
          const cover = (weeks: number) => setQ(sp.productId, Math.max(0, demand * weeks - stock - incoming));

          return (
            <div key={sp.productId} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{product.emoji}</span>
                <div className="grow">
                  <div className="title" style={{ color: PRODUCT_COLOR[sp.productId] }}>
                    {product.name} <span className="sub">· EK {sp.price}€/Stk</span>
                  </div>
                  <div className="sub" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>📦 Lager {stock}</span>
                    {incoming > 0 && <span>· 🚚 {incoming} unterwegs</span>}
                    <span>· Bedarf {demand}/Wo</span>
                    <span className={covCls} title="Reichweite (Lager + unterwegs)">Reichweite {covText}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn small" disabled={demand <= 0} onClick={() => cover(2)}>
                  Bedarf 2 Wo
                </button>
                <button className="btn small ghost" disabled={demand <= 0} onClick={() => cover(4)}>
                  4 Wo
                </button>
                <button className="btn small ghost" onClick={() => setQ(sp.productId, q + 40)}>
                  +40
                </button>
                <input
                  className="num-input"
                  type="number"
                  min={0}
                  step={10}
                  value={q}
                  onChange={(e) => setQ(sp.productId, Number(e.target.value))}
                />
                <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>{euro(q * sp.price)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'flex-end' }}>
        {msg && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{msg}</span>}
        <div style={{ fontWeight: 700, fontSize: 16 }}>Gesamt: {euro(total)}</div>
        <button className="btn primary" disabled={total <= 0 || total > budget} onClick={order}>
          Bestellen
        </button>
      </div>

      {pendingPOs.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>🚚 Nächste Lieferungen</h3>
          <div className="rows">
            {pendingPOs
              .slice()
              .sort((a, b) => a.deliveryDay - b.deliveryDay)
              .map((po) => (
                <div key={po.id} className="row" style={{ padding: '8px 10px' }}>
                  <div className="grow">
                    <div className="title" style={{ fontSize: 13 }}>
                      {po.items.map((i) => {
                        const p = state.products.find((pr) => pr.id === i.productId);
                        return `${i.quantity}× ${p?.name ?? i.productId}`;
                      }).join(', ')}
                    </div>
                    <div className="sub">in {Math.max(0, po.deliveryDay - state.totalDays).toFixed(1)} Tagen</div>
                  </div>
                  <span className="pill">−{euro(po.totalCost)}</span>
                </div>
              ))}
          </div>
        </>
      )}

      <h3 style={{ marginTop: 22 }}>🔄 Automatische Nachbestellung</h3>
      {!einkaeufer ? (
        <div className="row" style={{ borderColor: 'var(--warn)' }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div className="grow">
            <div className="title" style={{ fontSize: 14 }}>Noch manuell</div>
            <div className="sub">
              Stelle im <b>Personal</b>-Menü einen <b>Einkäufer</b> ein – dann übernimmt er die
              Nachbestellung automatisch (bedarfsbasiert). Bis dahin bestellst du hier selbst.
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="hint">
            Dein Einkäufer bestellt automatisch nach: fällt der Bestand (inkl. unterwegs) unter{' '}
            <i>Min</i>, wird bis <i>Ziel</i> aufgefüllt.
          </p>
          <div className="rows">
            {state.products.map((product) => {
              const rule = product.autoRestock;
              return (
                <div key={product.id} className="row">
                  <span style={{ fontSize: 20 }}>{product.emoji}</span>
                  <div className="grow">
                    <div className="title" style={{ fontSize: 13 }}>{product.name}</div>
                  </div>
                  <label className="fld">
                    Min
                    <input
                      className="num-input"
                      style={{ width: 66 }}
                      type="number"
                      min={0}
                      value={rule.min}
                      onChange={(e) => mutate((s) => setAutoRestock(s, product.id, { ...rule, min: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="fld">
                    Ziel
                    <input
                      className="num-input"
                      style={{ width: 66 }}
                      type="number"
                      min={0}
                      value={rule.target}
                      onChange={(e) => mutate((s) => setAutoRestock(s, product.id, { ...rule, target: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => mutate((s) => setAutoRestock(s, product.id, { ...rule, enabled: e.target.checked }))}
                    />
                    {rule.enabled ? 'Aktiv' : 'Aus'}
                  </label>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
