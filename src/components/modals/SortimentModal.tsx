import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, catalogStatus } from '../../game/simulation';
import { addProduct } from '../../game/actions';
import { STEP, tutorialOnStep } from '../../game/tutorial';
import { euro } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';

export function SortimentModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const entries = catalogStatus(state);
  const budget = state.cash + availableCredit(state);

  const take = (id: 'fisch' | 'fleisch' | 'gemuese') => {
    mutate((s) => {
      const r = addProduct(s, id);
      setMsg(r.ok ? null : '⚠️ ' + (r.message ?? 'Fehler'));
    });
  };

  return (
    <Modal title="Sortiment · Produktgruppen" icon="🧺" onClose={onClose} wide>
      <p className="hint">
        Erweitere dein Sortiment um neue Produktgruppen, sobald sie freigeschaltet sind. Tipp:
        Nimm ein Produkt auf und <b>bevorrate es zuerst</b> (Einkauf) – dann gewinne Kunden dafür,
        damit die erste Lieferung nicht zu spät kommt.
      </p>

      <div className="rows">
        {entries.map(({ def, status, reason }) => {
          const affordable = budget >= def.listingFee;
          return (
            <div key={def.id} className="row">
              <span style={{ fontSize: 24 }}>{def.emoji}</span>
              <div className="grow">
                <div className="title" style={{ color: PRODUCT_COLOR[def.id] }}>
                  {def.name}
                </div>
                <div className="sub">
                  EK {def.einkaufspreis}€ · Basis-VK {def.verkaufspreis}€ · Haltbarkeit{' '}
                  {def.spoilageDays} Tage
                </div>
              </div>

              {status === 'active' && <span className="pill good">Im Sortiment</span>}

              {status === 'locked' && (
                <span className="pill" title="Noch nicht freigeschaltet">
                  🔒 {reason}
                </span>
              )}

              {status === 'addable' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="pill warn">Gebühr {euro(def.listingFee)}</span>
                  <button
                    className={`btn primary small${
                      // Meat beat phase A: point at listing Fleisch.
                      affordable && def.id === 'fleisch' && tutorialOnStep(state.tutorial, STEP.MEAT)
                        ? ' tut-glow'
                        : ''
                    }`}
                    disabled={!affordable}
                    onClick={() => take(def.id)}
                  >
                    Aufnehmen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {msg && (
        <p className="hint" style={{ marginTop: 12, color: 'var(--warn)' }}>
          {msg}
        </p>
      )}
    </Modal>
  );
}
