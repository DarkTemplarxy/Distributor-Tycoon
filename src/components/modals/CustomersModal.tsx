import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { setDiscount } from '../../game/actions';
import { demandUpliftFromDiscount } from '../../game/constants';
import { Stars, PRODUCT_COLOR } from '../shared';

const TYPE_LABEL = { small: 'Klein', medium: 'Mittel', large: 'Groß' } as const;

export function CustomersModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const active = state.customers.filter((c) => c.active);

  return (
    <Modal title="Kunden" icon="🤝" onClose={onClose} wide>
      <p className="hint">
        Rabatte (bis −20%) erhöhen die Nachfrage progressiv. Verspätungen senken die Sterne – bei zu
        vielen kündigt der Kunde.
      </p>
      {active.length === 0 && <div className="empty">Keine aktiven Kunden.</div>}
      <div className="rows">
        {active.map((c) => {
          const uplift = demandUpliftFromDiscount(c.activeDiscount);
          const tolerance = 3 + Math.max(0, Math.round(c.serviceRating - 3));
          const weeklyRevenue = c.lines.reduce((sum, l) => sum + l.volume * l.price, 0);
          return (
            <div key={c.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{c.emoji}</span>
                <div className="grow">
                  <div className="title">
                    {c.name} <span className="pill">{TYPE_LABEL[c.type]}</span>{' '}
                    <span className="pill good">~{Math.round(weeklyRevenue)}€/Woche</span>
                  </div>
                  <div className="sub" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.lines.map((l) => {
                      const prod = state.products.find((p) => p.id === l.productId);
                      return (
                        <span key={l.productId} style={{ color: PRODUCT_COLOR[l.productId] }}>
                          {prod?.emoji} {l.volume}×@{l.price}€
                        </span>
                      );
                    })}
                    <span>· Lieferzeit {c.deliveryLeadWeeks}W</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Stars value={c.serviceRating} />
                  <div className="sub">
                    Verspätungen {c.lateDeliveries}/{tolerance} · Loyalität {Math.round(c.loyalty)}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 70 }}>Rabatt</span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={2}
                  value={Math.round(c.activeDiscount * 100)}
                  style={{ flex: 1 }}
                  onChange={(e) => mutate((s) => setDiscount(s, c.id, Number(e.target.value) / 100))}
                />
                <span className="pill" style={{ width: 60, textAlign: 'center' }}>
                  −{Math.round(c.activeDiscount * 100)}%
                </span>
                <span className="pill good" style={{ width: 96, textAlign: 'center' }}>
                  Bedarf +{Math.round(uplift * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
