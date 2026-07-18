import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { counterAcceptChance, freeCapacity, isInAssortment, notify } from '../../game/simulation';
import { acceptInquiry, counterOffer, dismissInquiry } from '../../game/actions';
import {
  getProductDef,
  LARGE_UNLOCK_MONTHLY,
  MEDIUM_UNLOCK_MONTHLY,
  monthlyRevenue,
} from '../../game/constants';
import { STEP, TUTORIAL_INQUIRY_IDS, TUTORIAL_MEAT_INQUIRY_ID, tutorialOnStep } from '../../game/tutorial';
import type { CustomerType } from '../../game/types';
import { euro, weekOf } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

const TYPE_LABEL: Record<CustomerType, string> = { small: 'Klein', medium: 'Mittel', large: 'Groß' };

export function InquiriesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const list = state.inquiries.filter((i) => i.status === 'open');

  // Progress toward the next customer-size unlock (rolling monthly revenue).
  const monthly = monthlyRevenue(state);
  const nextUnlock =
    monthly < MEDIUM_UNLOCK_MONTHLY
      ? { value: MEDIUM_UNLOCK_MONTHLY, label: 'schaltet mittlere Kunden frei' }
      : monthly < LARGE_UNLOCK_MONTHLY
        ? { value: LARGE_UNLOCK_MONTHLY, label: 'schaltet große Kunden frei' }
        : null;

  // Guided lesson during the tutorial's growth beat: accept the uncle's first
  // inquiry, then counter-offer the second (glow points at the active action).
  const guided = tutorialOnStep(state.tutorial, STEP.GROWTH);
  const [tut1Id, tut2Id] = TUTORIAL_INQUIRY_IDS;
  const tut1Open = state.inquiries.some((i) => i.id === tut1Id && i.status === 'open');
  // Meat beat: the guaranteed Fleisch inquiry wants accepting.
  const guidedMeat =
    tutorialOnStep(state.tutorial, STEP.MEAT) &&
    state.inquiries.some((i) => i.id === TUTORIAL_MEAT_INQUIRY_ID && i.status === 'open');

  return (
    <Modal title="Kundenanfragen" icon="📨" onClose={onClose} wide>
      <p className="hint">
        <b>Annehmen</b> = sofort zum Wunschpreis abschließen. <b>Gegenangebot</b> = eigenen (höheren)
        Preis fordern für mehr Marge – der Kunde nimmt mit sinkender Chance an, sonst platzt der Deal.
        Die Menge ist fix. Neue Kunden brauchen freie KAM-Kapazität.
      </p>

      {guidedMeat && (
        <p className="hint" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10 }}>
          🥩 Nimm den <b>Fleisch-Interessenten an</b> – Fleisch ist bereits in deinem Sortiment
          gelistet.
        </p>
      )}

      {guided && (
        <p className="hint" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10 }}>
          👴 <b>Onkels Anleitung:</b>{' '}
          <span style={{ opacity: tut1Open ? 1 : 0.45 }}>
            <b>1.</b> Die erste Anfrage einfach <b>✓ Annehmen</b>.
          </span>{' '}
          <span style={{ opacity: tut1Open ? 0.45 : 1 }}>
            <b>2.</b> Bei der zweiten einen <b>höheren Preis</b> fordern und als{' '}
            <b>⚖ Gegenangebot</b> zurückschicken – im Tutorial nimmt der Kunde sicher an.
          </span>
        </p>
      )}

      <p className="hint" style={{ marginBottom: 8 }}>
        📊 Monatsumsatz (rollierende 4 Wochen): <b>{euro(monthly)}</b>
        {nextUnlock ? (
          <>
            {' '}/ {euro(nextUnlock.value)} — {nextUnlock.label}
          </>
        ) : (
          <> — alle Kundengrößen freigeschaltet</>
        )}
      </p>

      <div className="two-col" style={{ marginBottom: 14 }}>
        {(['small', 'medium', 'large'] as CustomerType[]).map((t) => (
          <div key={t} className="row" style={{ padding: '8px 10px' }}>
            <div className="grow">
              <div className="title" style={{ fontSize: 13 }}>{TYPE_LABEL[t]}e Kunden</div>
              <div className="sub">
                {freeCapacity(state, t) > 0
                  ? `${freeCapacity(state, t)} Platz frei`
                  : 'kein Manager mit freien Slots – KAM einstellen oder umverteilen'}
              </div>
            </div>
            <span className={`pill ${freeCapacity(state, t) > 0 ? 'good' : 'bad'}`}>
              {freeCapacity(state, t)}
            </span>
          </div>
        ))}
      </div>

      {list.length === 0 && (
        <div className="empty">
          Aktuell keine offenen Anfragen. Neue Anfragen kommen wöchentlich, wenn Kapazität frei ist.
        </div>
      )}

      <div className="rows">
        {list.map((inq) => {
          // The product may not be listed yet (Wachstumsmotor A) — fall back to
          // the catalog definition for name/emoji.
          const product =
            state.products.find((p) => p.id === inq.preferredProduct) ??
            getProductDef(inq.preferredProduct);
          const needsListing = !isInAssortment(state, inq.preferredProduct);
          const listingFee = getProductDef(inq.preferredProduct).listingFee;
          const isExpansion = !!inq.existingCustomerId;
          const noCapacity = !isExpansion && freeCapacity(state, inq.type) <= 0;
          // Demand inquiries (Wachstumsmotor) carry a visible countdown; the
          // ultimatum stage is unmistakably marked.
          const demand = inq.demand;
          const weeksLeft = demand
            ? Math.max(1, demand.deadlineWeek - weekOf(state.totalDays))
            : 0;
          // Guided steps: glow Annehmen on the uncle's first inquiry; once it's
          // handled, glow Gegenangebot on the second — with the higher price
          // pre-filled so the button is immediately actionable.
          const glowAccept =
            ((guided && inq.id === tut1Id) || (guidedMeat && inq.id === TUTORIAL_MEAT_INQUIRY_ID)) &&
            !noCapacity;
          const glowCounter = guided && inq.id === tut2Id && !tut1Open && !noCapacity;
          const price = prices[inq.id] ?? (glowCounter ? inq.targetPrice + 2 : inq.targetPrice);
          const chance = Math.round(counterAcceptChance(inq.targetPrice, price) * 100);
          const chanceCls = chance >= 70 ? 'good' : chance >= 40 ? 'warn' : 'bad';
          return (
            <div key={inq.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{isExpansion ? '🔁' : inq.emoji}</span>
                <div className="grow">
                  <div className="title">
                    {inq.name} <span className="pill">{TYPE_LABEL[inq.type]}</span>{' '}
                    {isExpansion ? (
                      <span className="pill good">🔁 Bestandskunde: {inq.name}</span>
                    ) : (
                      <span className="pill">✨ Neukunde</span>
                    )}{' '}
                    {demand &&
                      (demand.stage === 2 ? (
                        <span className="pill bad">⚠️ ULTIMATUM · noch {weeksLeft} Wo.</span>
                      ) : (
                        <span className="pill warn">🙋 Wunsch · noch {weeksLeft} Wo.</span>
                      ))}
                  </div>
                  <div className="sub">
                    {isExpansion ? 'Möchte zusätzlich:' : 'Wunsch:'}{' '}
                    <span style={{ color: PRODUCT_COLOR[inq.preferredProduct] }}>
                      {product.emoji} {product.name}
                    </span>{' '}
                    · {inq.suggestedVolume}×/Woche · Wunschpreis {inq.targetPrice}€
                    {needsListing && (
                      <>
                        {' '}
                        <span className="pill warn">
                          Erfordert Listung von {product.name} (Gebühr {euro(listingFee)})
                        </span>
                      </>
                    )}
                    {demand?.stage === 2 && (
                      <>
                        {' '}
                        <b style={{ color: 'var(--bad)' }}>
                          Sonst wechselt {inq.name} komplett zum Konkurrenten!
                        </b>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className={`btn good small${glowAccept ? ' tut-glow' : ''}`}
                  disabled={noCapacity}
                  title={noCapacity ? 'Keine KAM-Kapazität frei' : undefined}
                  onClick={() =>
                    mutate((s) => {
                      // Failures beyond the disabled-states (e.g. listing fee
                      // unaffordable) must be visible, not silent.
                      const r = acceptInquiry(s, inq.id);
                      if (!r.ok && r.message) notify(s, `⚠️ ${r.message}`, 'warn');
                    })
                  }
                >
                  ✓ Annehmen ({inq.targetPrice}€{needsListing ? ` + Listung ${euro(listingFee)}` : ''})
                </button>

                <label className="fld">
                  Gegenangebot €/Stk
                  <input
                    className="num-input"
                    type="number"
                    min={1}
                    step={0.5}
                    value={price}
                    onChange={(e) => setPrices((p) => ({ ...p, [inq.id]: Number(e.target.value) }))}
                  />
                </label>
                <span className={`pill ${chanceCls}`} style={{ width: 96, textAlign: 'center' }}>
                  Chance ~{chance}%
                </span>
                <button
                  className={`btn primary small${glowCounter && price > inq.targetPrice ? ' tut-glow' : ''}`}
                  disabled={noCapacity || price <= inq.targetPrice}
                  title={price <= inq.targetPrice ? 'Über dem Wunschpreis bieten' : undefined}
                  onClick={() =>
                    mutate((s) => {
                      const r = counterOffer(s, inq.id, price);
                      if (!r.ok && r.message) notify(s, `⚠️ ${r.message}`, 'warn');
                    })
                  }
                >
                  ⚖ Gegenangebot
                </button>

                <button
                  className="btn ghost small"
                  title={
                    demand?.stage === 2
                      ? 'Ablehnen: Der Kunde wandert KOMPLETT ab (alle Linien)!'
                      : demand
                        ? 'Ablehnen: Das Thema kommt als Ultimatum wieder.'
                        : undefined
                  }
                  onClick={() => mutate((s) => dismissInquiry(s, inq.id))}
                >
                  Ablehnen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
