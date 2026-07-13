import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { incomingPO, inventoryTotal } from '../../game/simulation';
import { PRODUCT_COLOR } from '../shared';

export function InventoryModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();

  return (
    <Modal title="Inventar & Verderblichkeit" icon="📦" onClose={onClose} wide>
      <p className="hint">
        Jede Charge verfällt am angegebenen Tag. Rot = kritisch. Verdorbene Ware ist Totalverlust.
      </p>
      <div className="rows">
        {state.products.map((product) => {
          const total = inventoryTotal(product);
          const incoming = incomingPO(state, product.id);
          const batches = [...product.batches].sort((a, b) => a.expiryDay - b.expiryDay);
          return (
            <div
              key={product.id}
              className="row"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>{product.emoji}</span>
                <div className="grow">
                  <div className="title">{product.name}</div>
                  <div className="sub">
                    Haltbarkeit {product.spoilageDays} Tage · EK {product.einkaufspreis}€ · VK{' '}
                    {product.verkaufspreis}€
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="title" style={{ color: PRODUCT_COLOR[product.id] }}>
                    {total} Stk
                  </div>
                  {incoming > 0 && <div className="sub">+{incoming} unterwegs</div>}
                </div>
              </div>

              {batches.length === 0 && <div className="empty" style={{ padding: 6 }}>Kein Bestand.</div>}
              {batches.map((b) => {
                const daysLeft = Math.max(0, b.expiryDay - state.totalDays);
                const ratio = Math.max(0, Math.min(1, daysLeft / product.spoilageDays));
                const cls = ratio < 0.15 ? 'crit' : ratio < 0.35 ? 'warn' : 'ok';
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 60, fontVariantNumeric: 'tabular-nums' }}>{b.quantity}×</span>
                    <div className="progress" style={{ flex: 1, marginTop: 0 }}>
                      <span
                        className={cls}
                        style={{
                          width: `${Math.round(ratio * 100)}%`,
                          background:
                            cls === 'crit'
                              ? 'var(--bad)'
                              : cls === 'warn'
                                ? 'var(--warn)'
                                : 'var(--good)',
                        }}
                      />
                    </div>
                    <span
                      className={`pill ${cls === 'crit' ? 'bad' : cls === 'warn' ? 'warn' : 'good'}`}
                      style={{ width: 92, textAlign: 'center' }}
                    >
                      {daysLeft.toFixed(1)} Tage
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
