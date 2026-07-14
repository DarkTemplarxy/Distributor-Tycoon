import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { freeCapacity } from '../../game/simulation';
import { dismissInquiry, sendOffer } from '../../game/actions';
import type { CustomerType } from '../../game/types';
import { PRODUCT_COLOR } from '../shared';

const TYPE_LABEL: Record<CustomerType, string> = { small: 'Klein', medium: 'Mittel', large: 'Groß' };

export function InquiriesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [drafts, setDrafts] = useState<Record<string, { price: number; volume: number }>>({});

  const list = state.inquiries.filter(
    (i) => i.status === 'open' || i.status === 'offered' || i.status === 'rejected',
  );

  const getDraft = (id: string, defPrice: number, defVol: number) =>
    drafts[id] ?? { price: defPrice, volume: defVol };

  return (
    <Modal title="Kundenanfragen & Angebote" icon="📨" onClose={onClose} wide>
      <p className="hint">
        Mache Angebote an potenzielle Kunden. Günstigere Preise = höhere Abschlusschance. Antwort nach
        1 Woche. Für neue Kunden brauchst du freie KAM-Kapazität.
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
          const draft = getDraft(inq.id, inq.targetPrice, inq.suggestedVolume);
          const canOffer = inq.status === 'open' || inq.status === 'rejected';
          const isExpansion = !!inq.existingCustomerId;
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
                    · ~{inq.suggestedVolume}×/Woche · Zielpreis ~{inq.targetPrice}€
                  </div>
                </div>
                {inq.status === 'offered' && <span className="pill warn">Wartet auf Antwort</span>}
                {inq.status === 'rejected' && <span className="pill bad">Abgelehnt</span>}
              </div>

              {inq.status === 'offered' && inq.offer && (
                <div className="sub">
                  Angebot gesendet: {inq.offer.volume}× @ {inq.offer.price}€ · Antwort in Woche{' '}
                  {inq.offer.respondWeek}
                </div>
              )}

              {canOffer && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <label className="fld">
                    Preis €/Stk
                    <input
                      className="num-input"
                      type="number"
                      min={1}
                      step={0.5}
                      value={draft.price}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [inq.id]: { ...draft, price: Number(e.target.value) } }))
                      }
                    />
                  </label>
                  <label className="fld">
                    Menge/Woche
                    <input
                      className="num-input"
                      type="number"
                      min={1}
                      value={draft.volume}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [inq.id]: { ...draft, volume: Number(e.target.value) } }))
                      }
                    />
                  </label>
                  <button
                    className="btn primary small"
                    disabled={!isExpansion && freeCapacity(state, inq.type) <= 0}
                    onClick={() => mutate((s) => sendOffer(s, inq.id, draft.price, draft.volume))}
                  >
                    📤 Angebot senden
                  </button>
                  <button className="btn ghost small" onClick={() => mutate((s) => dismissInquiry(s, inq.id))}>
                    Ablehnen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
