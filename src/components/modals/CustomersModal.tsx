import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { assignCustomerManager, setCustomerLinePrice, setDiscount } from '../../game/actions';
import { managers } from '../../game/simulation';
import { demandUpliftFromDiscount, getProductDef, SLOT_COST } from '../../game/constants';
import type { Customer, CustomerLine, CustomerType, Product } from '../../game/types';
import { weekOf } from '../../game/util';
import { CustomerTypeFilter, Stars, PRODUCT_COLOR, useCustomerTypeFilter } from '../shared';

const TYPE_LABEL = { small: 'Klein', medium: 'Mittel', large: 'Groß' } as const;

/** Editable contract price for one customer line. Commits on blur/Enter (not per
 * keystroke) so the loyalty penalty for a hike fires exactly once. The margin pill
 * is the ACTUAL margin on this contract (line price vs current EK), coloured
 * relative to the product's target margin — so supplier-driven erosion is visible. */
function LineEditor({ customerId, line, product }: { customerId: string; line: CustomerLine; product?: Product }) {
  const { mutate } = useGame();
  const [val, setVal] = useState(String(line.price));
  useEffect(() => setVal(String(line.price)), [line.price]);

  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0 || n === line.price) {
      setVal(String(line.price));
      return;
    }
    mutate((s) => setCustomerLinePrice(s, customerId, line.productId, n));
  };

  const ek = product?.einkaufspreis ?? 0;
  const target = product?.zielmarge ?? 40;
  const margin = line.price > 0 ? ((line.price - ek) / line.price) * 100 : 0;
  const marginCls = margin >= target ? 'good' : margin >= target * 0.8 ? 'warn' : 'bad';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: PRODUCT_COLOR[line.productId], minWidth: 96 }}>
        {product?.emoji} {product?.name}
      </span>
      <span className="sub">{line.volume}× @</span>
      <input
        className="num-input"
        style={{ width: 74 }}
        type="number"
        min={0}
        step={0.5}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="sub">€</span>
      <span className={`pill ${marginCls}`} title={`Zielmarge ${target}% · EK ${ek}€`}>
        Marge {margin.toFixed(0)}%
      </span>
    </div>
  );
}

export function CustomersModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const filter = useCustomerTypeFilter();
  const active = state.customers.filter((c) => c.active);
  const shown = active.filter((c) => filter.matches(c.type));
  const countOf = (t: CustomerType) => active.filter((c) => c.type === t).length;
  const productOf = (id: Product['id']) => state.products.find((p) => p.id === id);

  return (
    <Modal title="Kunden" icon="🤝" onClose={onClose} wide>
      <p className="hint">
        Rabatte (bis −20%) erhöhen die Nachfrage progressiv. Verspätungen senken die Sterne – bei zu
        vielen kündigt der Kunde. <b>Vertragspreise</b> kannst du je Linie anpassen – eine deutliche
        Erhöhung kostet <b>Loyalität</b> (zufriedene Kunden verzeihen mehr).
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="sub">Anzeigen:</span>
        <CustomerTypeFilter
          filter={filter}
          counts={{ small: countOf('small'), medium: countOf('medium'), large: countOf('large') }}
        />
      </div>
      {active.length === 0 && <div className="empty">Keine aktiven Kunden.</div>}
      {active.length > 0 && shown.length === 0 && (
        <div className="empty">Alle Kundengrößen ausgeblendet – Filter oben anpassen.</div>
      )}
      <div className="rows">
        {shown.map((c: Customer) => {
          const uplift = demandUpliftFromDiscount(c.activeDiscount);
          const tolerance = 3 + Math.max(0, Math.round(c.serviceRating - 3));
          const weeklyRevenue = c.lines.reduce((sum, l) => sum + l.volume * l.price, 0);
          // Offener Wunsch/Ultimatum (Wachstumsmotor): Symbol + Restfrist direkt
          // am Kunden, damit keine Frist untergeht. Ein abgelehnter Wunsch, dessen
          // Ultimatum noch aussteht, wird dezent als „verstimmt" markiert.
          const week = weekOf(state.totalDays);
          const demandInq = state.inquiries.find(
            (i) => i.status === 'open' && i.demand && i.existingCustomerId === c.id,
          );
          const weeksLeft = demandInq ? Math.max(1, demandInq.demand!.deadlineWeek - week) : 0;
          const scheduledUlti = !demandInq && state.pendingUltimatums.some((u) => u.customerId === c.id);
          return (
            <div key={c.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{c.emoji}</span>
                <div className="grow">
                  <div className="title">
                    {c.name} <span className="pill">{TYPE_LABEL[c.type]}</span>{' '}
                    <span className="pill good">~{Math.round(weeklyRevenue)}€/Woche</span>
                    {demandInq && (
                      <>
                        {' '}
                        <span
                          className={`pill ${demandInq.demand!.stage === 2 ? 'bad' : 'warn'}`}
                          title="Offene Anfrage im Anfragen-Bildschirm beantworten!"
                        >
                          {demandInq.demand!.stage === 2 ? '⚠️ ULTIMATUM' : '🙋 Wunsch'}:{' '}
                          {getProductDef(demandInq.preferredProduct).name} · noch {weeksLeft} Wo.
                        </span>
                      </>
                    )}
                    {scheduledUlti && (
                      <>
                        {' '}
                        <span
                          className="pill warn"
                          title="Abgelehnter Wunsch – das Thema kommt als Ultimatum zurück."
                        >
                          😕 verstimmt
                        </span>
                      </>
                    )}
                  </div>
                  <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Lieferzeit {c.deliveryLeadWeeks}W · Manager
                    <select
                      className="num-input"
                      style={{ width: 'auto', padding: '1px 4px', fontSize: 12 }}
                      value={c.managerId}
                      onChange={(e) => mutate((s) => assignCustomerManager(s, c.id, e.target.value))}
                      title={`Belegt ${SLOT_COST[c.type]} Slot(s) beim betreuenden Manager`}
                    >
                      {managers(state).map((m) => {
                        const here = m.id === c.managerId;
                        const fits = here || m.free >= SLOT_COST[c.type];
                        return (
                          <option key={m.id} value={m.id} disabled={!fits}>
                            {m.name} ({here ? 'aktuell' : `${m.free} frei`})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Stars value={c.serviceRating} />
                  <div className="sub">
                    Verspätungen {c.lateDeliveries}/{tolerance} · Loyalität {Math.round(c.loyalty)}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 34 }}>
                {c.lines.map((l) => (
                  <LineEditor key={l.productId} customerId={c.id} line={l} product={productOf(l.productId)} />
                ))}
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
