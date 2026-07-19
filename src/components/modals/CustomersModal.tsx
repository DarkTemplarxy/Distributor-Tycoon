import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { assignCustomerManager, repriceCooldownLeft, setCustomerLinePrice, setDiscount } from '../../game/actions';
import { freeCapacity, managers, notify, repriceAcceptChance } from '../../game/simulation';
import { demandUpliftFromDiscount, getProductDef, MANAGER_SLOTS, SLOT_COST } from '../../game/constants';
import type { Customer, CustomerLine, CustomerType, Product } from '../../game/types';
import { weekOf } from '../../game/util';
import { CustomerTypeFilter, Stars, PRODUCT_COLOR, useCustomerTypeFilter } from '../shared';

const TYPE_LABEL = { small: 'Klein', medium: 'Mittel', large: 'Groß' } as const;

/** Editable contract price for one customer line. Commits on blur/Enter. A real
 * RAISE is a negotiation (symmetrisch zum Gegenangebot): the chance pill shows
 * the odds before committing, a refusal keeps the old price and locks the line
 * for a cooldown. The margin pill is the ACTUAL margin on this contract (line
 * price vs current EK), coloured relative to the product's target margin. */
function LineEditor({ customer, line, product }: { customer: Customer; line: CustomerLine; product?: Product }) {
  const { state, mutate } = useGame();
  const [val, setVal] = useState(String(line.price));
  useEffect(() => setVal(String(line.price)), [line.price]);

  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0 || n === line.price) {
      setVal(String(line.price));
      return;
    }
    mutate((s) => {
      const r = setCustomerLinePrice(s, customer.id, line.productId, n);
      // Refusal/cooldown must be visible (the action already notifies verdicts;
      // the cooldown message would otherwise be silent).
      if (!r.ok && r.message && !/lehnt ab/.test(r.message)) notify(s, `⏳ ${r.message}`, 'info');
    });
    setVal(String(line.price));
  };

  const ek = product?.einkaufspreis ?? 0;
  const target = product?.zielmarge ?? 40;
  const margin = line.price > 0 ? ((line.price - ek) / line.price) * 100 : 0;
  const marginCls = margin >= target ? 'good' : margin >= target * 0.8 ? 'warn' : 'bad';

  // Preview of the pending edit: is it a negotiation, and with what odds?
  const entered = Number(val);
  const isRaise = Number.isFinite(entered) && entered > line.agreedPrice * 1.02;
  const cooldown = repriceCooldownLeft(state, line);
  const chance = isRaise ? Math.round(repriceAcceptChance(state, customer, line, entered) * 100) : 100;
  const chanceCls = chance >= 70 ? 'good' : chance >= 40 ? 'warn' : 'bad';

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
      {isRaise && cooldown > 0 && (
        <span className="pill" title="Nach jeder Verhandlung ist die Linie einige Wochen gesperrt.">
          ⏳ Verhandlung in {cooldown} Wo.
        </span>
      )}
      {isRaise && cooldown === 0 && (
        <span
          className={`pill ${chanceCls}`}
          title="Preiserhöhung = Verhandlung: Der Kunde kann ablehnen (Preis bleibt, Loyalität sinkt). Gute Sterne erhöhen Chance und Spielraum."
        >
          ⚖ Chance ~{chance}%
        </span>
      )}
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

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allOpen = shown.length > 0 && shown.every((c) => open.has(c.id));
  const setAll = () => setOpen(allOpen ? new Set() : new Set(shown.map((c) => c.id)));

  return (
    <Modal title="Kunden" icon="🤝" onClose={onClose} wide>
      <p className="hint">
        Rabatte (bis −20%) erhöhen die Nachfrage progressiv. Verspätungen senken die Sterne – bei zu
        vielen kündigt der Kunde. <b>Preiserhöhungen sind Verhandlungen:</b> Der Kunde kann ablehnen
        (Preis bleibt, Loyalität sinkt), danach ist die Linie einige Wochen gesperrt. Gute{' '}
        <b>Service-Sterne</b> erhöhen Chance und Spielraum (bis ~45% Marge) – und Kunden mit sehr
        niedriger Loyalität <b>kündigen</b> nach Vorwarnung.
      </p>
      {(() => {
        // Kopfzeile: aktueller Kundenstand + freie Betreuungskapazität. Slots
        // zählen PRO Manager (klein 1 / mittel 2 / groß 6) — deshalb steht hier
        // zusätzlich, wie viele Kunden je Größe tatsächlich noch Platz hätten.
        const mgrs = managers(state);
        const totalSlots = mgrs.length * MANAGER_SLOTS;
        const usedSlots = mgrs.reduce((s, m) => s + m.used, 0);
        return (
          <div className="two-col" style={{ marginBottom: 10 }}>
            <div className="row" style={{ padding: '8px 10px' }} title="Aktive Kunden nach Größe (klein / mittel / groß).">
              <div className="grow">
                <div className="title" style={{ fontSize: 13 }}>Aktuelle Kunden</div>
                <div className="sub">
                  {countOf('small')} klein · {countOf('medium')} mittel · {countOf('large')} groß
                </div>
              </div>
              <span className="pill good">{active.length}</span>
            </div>
            <div
              className="row"
              style={{ padding: '8px 10px' }}
              title={`Belegte Betreuungs-Slots über alle Manager (${mgrs.map((m) => `${m.name}: ${m.used}/${MANAGER_SLOTS}`).join(' · ')}). Ein Kunde belegt ${SLOT_COST.small}/${SLOT_COST.medium}/${SLOT_COST.large} Slots (klein/mittel/groß) bei EINEM Manager — für mehr Platz einen KAM einstellen oder Kunden umverteilen.`}
            >
              <div className="grow">
                <div className="title" style={{ fontSize: 13 }}>Noch Platz für</div>
                <div className="sub">
                  {freeCapacity(state, 'small')} kleine · {freeCapacity(state, 'medium')} mittlere ·{' '}
                  {freeCapacity(state, 'large')} große Kunden
                </div>
              </div>
              <span className={`pill ${usedSlots < totalSlots ? 'good' : 'bad'}`}>
                {usedSlots}/{totalSlots} Slots
              </span>
            </div>
          </div>
        );
      })()}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="sub">Anzeigen:</span>
        <CustomerTypeFilter
          filter={filter}
          counts={{ small: countOf('small'), medium: countOf('medium'), large: countOf('large') }}
        />
        {shown.length > 1 && (
          <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={setAll}>
            {allOpen ? 'Alle einklappen' : 'Alle ausklappen'}
          </button>
        )}
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
          const isOpen = open.has(c.id);
          return (
            <div key={c.id} className="row collapsible">
              <div className="collapse-head" onClick={() => toggle(c.id)}>
                <span className="collapse-chev">{isOpen ? '▾' : '▸'}</span>
                <span style={{ fontSize: 22 }}>{c.emoji}</span>
                <div className="grow">
                  <div className="title">
                    {c.name} <span className="pill">{TYPE_LABEL[c.type]}</span>{' '}
                    {c.region === 'sued' && (
                      <span className="pill" title="Region Süd – wird vom Standort Süd beliefert.">🏗️ Süd</span>
                    )}{' '}
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
                    {(c.courtedUntilWeek ?? 0) >= week && (
                      <>
                        {' '}
                        <span
                          className="pill bad"
                          title="Ein Konkurrent umwirbt diesen Kunden. Service verbessern oder Rabatt geben, sonst droht die Abwanderung."
                        >
                          🎯 umworben
                        </span>
                      </>
                    )}
                  </div>
                  <div className="sub">
                    Verspätungen {c.lateDeliveries}/{tolerance}
                    {c.activeDiscount > 0 && ` · Rabatt −${Math.round(c.activeDiscount * 100)}%`}
                  </div>
                </div>
                <Stars value={c.serviceRating} />
              </div>

              {isOpen && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
                    <span className="sub">Betreuender Manager</span>
                    <select
                      className="num-input"
                      style={{ width: 'auto', padding: '1px 4px', fontSize: 12 }}
                      value={c.managerId}
                      onClick={(e) => e.stopPropagation()}
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 26 }}>
                    {c.lines.map((l) => (
                      <LineEditor key={l.productId} customer={c} line={l} product={productOf(l.productId)} />
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 26 }}>
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
