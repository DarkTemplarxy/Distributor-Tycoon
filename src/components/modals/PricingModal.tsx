import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { applyAutoPrice, setSalesPrice, setTargetMargin } from '../../game/actions';
import { PRODUCT_COLOR } from '../shared';

export function PricingModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();

  return (
    <Modal title="Preise & Margen" icon="🏷️" onClose={onClose} wide>
      <p className="hint">
        Setze deinen Verkaufspreis pro Produktgruppe. Die effektive Marge = (VK − EK) / VK. Über die
        Zielmarge kannst du den Preis automatisch berechnen lassen.
      </p>
      <div className="rows">
        {state.products.map((product) => {
          const margin = product.verkaufspreis > 0
            ? ((product.verkaufspreis - product.einkaufspreis) / product.verkaufspreis) * 100
            : 0;
          const markup = product.einkaufspreis > 0
            ? ((product.verkaufspreis - product.einkaufspreis) / product.einkaufspreis) * 100
            : 0;
          const marginCls = margin < 15 ? 'bad' : margin < 28 ? 'warn' : 'good';
          return (
            <div key={product.id} className="row" style={{ flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22 }}>{product.emoji}</span>
              <div className="grow" style={{ minWidth: 120 }}>
                <div className="title" style={{ color: PRODUCT_COLOR[product.id] }}>
                  {product.name}
                </div>
                <div className="sub">EK {product.einkaufspreis}€</div>
              </div>

              <label className="fld">
                Verkaufspreis €
                <input
                  className="num-input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={product.verkaufspreis}
                  onChange={(e) => mutate((s) => setSalesPrice(s, product.id, Number(e.target.value)))}
                />
              </label>

              <label className="fld">
                Zielmarge %
                <input
                  className="num-input"
                  style={{ width: 66 }}
                  type="number"
                  min={0}
                  max={89}
                  value={product.zielmarge}
                  onChange={(e) => mutate((s) => setTargetMargin(s, product.id, Number(e.target.value)))}
                />
              </label>

              <button className="btn small" onClick={() => mutate((s) => applyAutoPrice(s, product.id))}>
                Auto-Preis
              </button>

              <div style={{ textAlign: 'right', minWidth: 120 }}>
                <span className={`pill ${marginCls}`}>Marge {margin.toFixed(1)}%</span>
                <div className="sub">Aufschlag {markup.toFixed(0)}%</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        Hinweis: Bestehende Kunden haben feste Vertragspreise. Neue Preise gelten für neue Verträge –
        orientiere deine Angebote an diesen Werten.
      </p>
    </Modal>
  );
}
