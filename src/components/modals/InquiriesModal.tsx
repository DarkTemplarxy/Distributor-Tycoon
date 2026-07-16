import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { counterAcceptChance, freeCapacity } from '../../game/simulation';
import { acceptInquiry, counterOffer, dismissInquiry } from '../../game/actions';
import { STEP, tutorialOnStep } from '../../game/tutorial';
import type { CustomerType } from '../../game/types';
import { PRODUCT_COLOR } from '../shared';

const TYPE_LABEL: Record<CustomerType, string> = { small: 'Klein', medium: 'Mittel', large: 'Groß' };

export function InquiriesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const list = state.inquiries.filter((i) => i.status === 'open');

  return (
    <Modal title="Kundenanfragen" icon="📨" onClose={onClose} wide>
      <p className="hint">
        <b>Annehmen</b> = sofort zum Wunschpreis abschließen. <b>Gegenangebot</b> = eigenen (höheren)
        Preis fordern für mehr Marge – der Kunde nimmt mit sinkender Chance an, sonst platzt der Deal.
        Die Menge ist fix. Neue Kunden brauchen freie KAM-Kapazität.
      </p>

      <div className="two-col" style={{ marginBottom: 14 }}>
        {(['small', 'medium', 'large'] as CustomerType[]).map((t) => (
          <div key={t} className="row" style={{ padding: '8px 10px' }}>
            <div className="grow">
              <div className="title" style={{ fontSize: 13 }}>{TYPE_LABEL[t]}e Kunden</div>
              <div className="sub">
                {freeCapacity(state, t) > 0
                  ? `${freeCapacity(state, t)} Platz frei`
                  : t === 'small'
                    ? 'voll – KAM einstellen'
                    : 'gesperrt / voll'}
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
          const product = state.products.find((p) => p.id === inq.preferredProduct)!;
          const isExpansion = !!inq.existingCustomerId;
          const noCapacity = !isExpansion && freeCapacity(state, inq.type) <= 0;
          const price = prices[inq.id] ?? inq.targetPrice;
          const chance = Math.round(counterAcceptChance(inq.targetPrice, price) * 100);
          const chanceCls = chance >= 70 ? 'good' : chance >= 40 ? 'warn' : 'bad';
          return (
            <div key={inq.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{isExpansion ? '🔁' : inq.emoji}</span>
                <div className="grow">
                  <div className="title">
                    {inq.name} <span className="pill">{TYPE_LABEL[inq.type]}</span>{' '}
                    {isExpansion && <span className="pill good">Bestandskunde</span>}
                  </div>
                  <div className="sub">
                    {isExpansion ? 'Möchte zusätzlich:' : 'Wunsch:'}{' '}
                    <span style={{ color: PRODUCT_COLOR[inq.preferredProduct] }}>
                      {product.emoji} {product.name}
                    </span>{' '}
                    · {inq.suggestedVolume}×/Woche · Wunschpreis {inq.targetPrice}€
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className={`btn good small${
                    !noCapacity && tutorialOnStep(state.tutorial, STEP.GROWTH) ? ' tut-glow' : ''
                  }`}
                  disabled={noCapacity}
                  title={noCapacity ? 'Keine KAM-Kapazität frei' : undefined}
                  onClick={() => mutate((s) => acceptInquiry(s, inq.id))}
                >
                  ✓ Annehmen ({inq.targetPrice}€)
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
                  className="btn primary small"
                  disabled={noCapacity || price <= inq.targetPrice}
                  title={price <= inq.targetPrice ? 'Über dem Wunschpreis bieten' : undefined}
                  onClick={() => mutate((s) => counterOffer(s, inq.id, price))}
                >
                  ⚖ Gegenangebot
                </button>

                <button className="btn ghost small" onClick={() => mutate((s) => dismissInquiry(s, inq.id))}>
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
