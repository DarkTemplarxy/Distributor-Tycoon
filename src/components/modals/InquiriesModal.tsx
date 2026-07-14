import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { freeCapacity } from '../../game/simulation';
import { acceptInquiry, dismissInquiry } from '../../game/actions';
import type { CustomerType } from '../../game/types';
import { PRODUCT_COLOR } from '../shared';

const TYPE_LABEL: Record<CustomerType, string> = { small: 'Klein', medium: 'Mittel', large: 'Groß' };

export function InquiriesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const list = state.inquiries.filter((i) => i.status === 'open');

  return (
    <Modal title="Kundenanfragen" icon="📨" onClose={onClose} wide>
      <p className="hint">
        Nimm eine Anfrage direkt an – das Produkt ist dann sofort beim Kunden freigeschaltet, zum
        gewünschten Preis. Menge und Preis sind fix (deinen Verkaufspreis steuerst du über
        <b> Preise</b>). Neue Kunden brauchen freie KAM-Kapazität; Erweiterungen von Bestandskunden nicht.
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
          return (
            <div key={inq.id} className="row">
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
                  · {inq.suggestedVolume}×/Woche · Preis {inq.targetPrice}€
                </div>
              </div>
              <button
                className="btn primary small"
                disabled={noCapacity}
                title={noCapacity ? 'Keine KAM-Kapazität frei' : undefined}
                onClick={() => mutate((s) => acceptInquiry(s, inq.id))}
              >
                ✓ Annehmen
              </button>
              <button className="btn ghost small" onClick={() => mutate((s) => dismissInquiry(s, inq.id))}>
                Ablehnen
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
