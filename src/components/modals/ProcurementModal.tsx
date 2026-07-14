import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, incomingPO, inventoryTotal } from '../../game/simulation';
import { createPurchaseOrder, setAutoRestock, type ActionResult } from '../../game/actions';
import { euro } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

export function ProcurementModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  // Keyed by product id; missing keys count as 0, so this adapts automatically
  // when new products are added to the assortment.
  const [qty, setQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const total = state.supplier.products.reduce((sum, sp) => {
    return sum + (qty[sp.productId] || 0) * sp.price;
  }, 0);
  const budget = state.cash + availableCredit(state);

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
    <Modal title="Einkauf · Lieferant" icon="🛒" onClose={onClose} wide>
      <p className="hint">
        Lieferant <b>{state.supplier.name}</b> · Lieferzeit 1 Woche · Zahlung sofort. Bezahlbar bis{' '}
        {euro(budget)} (inkl. Kredit).
      </p>

      <div className="rows">
        {state.supplier.products.map((sp) => {
          const product = state.products.find((p) => p.id === sp.productId)!;
          const q = qty[sp.productId] || 0;
          return (
            <div key={sp.productId} className="row">
              <span style={{ fontSize: 22 }}>{product.emoji}</span>
              <div className="grow">
                <div className="title" style={{ color: PRODUCT_COLOR[sp.productId] }}>
                  {product.name}
                </div>
                <div className="sub">
                  EK {sp.price}€/Stk · Lager {inventoryTotal(product)}
                  {incomingPO(state, sp.productId) > 0 ? ` (+${incomingPO(state, sp.productId)} unterwegs)` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[40, 80, 120].map((add) => (
                  <button
                    key={add}
                    className="btn small ghost"
                    onClick={() => setQty((s) => ({ ...s, [sp.productId]: (s[sp.productId] || 0) + add }))}
                  >
                    +{add}
                  </button>
                ))}
              </div>
              <input
                className="num-input"
                type="number"
                min={0}
                step={10}
                value={q}
                onChange={(e) =>
                  setQty((s) => ({ ...s, [sp.productId]: Math.max(0, Number(e.target.value)) }))
                }
              />
              <span style={{ width: 90, textAlign: 'right', color: 'var(--text-dim)' }}>
                {euro(q * sp.price)}
              </span>
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
        {msg && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{msg}</span>}
        <div style={{ fontWeight: 700, fontSize: 16 }}>Gesamt: {euro(total)}</div>
        <button className="btn primary" disabled={total <= 0 || total > budget} onClick={order}>
          Bestellen
        </button>
      </div>

      <h3 style={{ marginTop: 22 }}>🔄 Auto-Nachbestellung</h3>
      <p className="hint">
        Fällt der Bestand (inkl. Unterwegs) unter <i>Min</i>, wird automatisch bis <i>Ziel</i> nachbestellt.
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
                  onChange={(e) =>
                    mutate((s) =>
                      setAutoRestock(s, product.id, { ...rule, min: Number(e.target.value) }),
                    )
                  }
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
                  onChange={(e) =>
                    mutate((s) =>
                      setAutoRestock(s, product.id, { ...rule, target: Number(e.target.value) }),
                    )
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    mutate((s) =>
                      setAutoRestock(s, product.id, { ...rule, enabled: e.target.checked }),
                    )
                  }
                />
                {rule.enabled ? 'Aktiv' : 'Aus'}
              </label>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
