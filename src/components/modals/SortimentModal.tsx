import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, catalogStatus, coldChainGap, equipmentLevel } from '../../game/simulation';
import { addProduct } from '../../game/actions';
import { STEP, tutorialOnStep } from '../../game/tutorial';
import { euro } from '../../game/util';
import { PRODUCT_COLOR } from '../shared';
import type { ProductId } from '../../game/types';

export function SortimentModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const entries = catalogStatus(state);
  const budget = state.cash + availableCredit(state);
  const hasCooling = equipmentLevel(state, 'cooling') > 0;

  const take = (id: ProductId) => {
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
        damit die erste Lieferung nicht zu spät kommt. Späte Gruppen haben höhere Margen, aber auch{' '}
        <b>höhere Listungsgebühren</b> – und manche sind <b>❄️ kühlpflichtig</b> (brauchen eine
        gebaute Kühlung im Ausbau).
      </p>

      {coldChainGap(state) && (
        <p className="hint" style={{ color: 'var(--bad)', marginTop: 4 }}>
          ⚠️ Du führst eine <b>kühlpflichtige</b> Produktgruppe, hast aber <b>keine Kühlung</b> gebaut
          – diese Ware verdirbt stark beschleunigt. Kühlung im <b>Ausbau</b> nachrüsten!
        </p>
      )}

      <div className="rows">
        {entries.map(({ def, status, reason }) => {
          const affordable = budget >= def.listingFee;
          return (
            <div key={def.id} className="row">
              <span style={{ fontSize: 24 }}>{def.emoji}</span>
              <div className="grow">
                <div className="title" style={{ color: PRODUCT_COLOR[def.id] }}>
                  {def.name}
                  {def.requiresCooling && (
                    <span
                      className={`pill ${hasCooling ? 'good' : 'warn'}`}
                      style={{ marginLeft: 8 }}
                      title={
                        hasCooling
                          ? 'Kühlpflichtig – deine Kühlung deckt das ab.'
                          : 'Kühlpflichtig – ohne gebaute Kühlung verdirbt die Ware viel schneller (Ausbau → Kühlung).'
                      }
                    >
                      ❄️ kühlpflichtig
                    </span>
                  )}
                </div>
                <div className="sub">
                  EK {def.einkaufspreis}€ · Basis-VK {def.verkaufspreis}€ · Zielmarge {def.zielmarge}%
                  · Haltbarkeit {def.spoilageDays} Tage
                </div>
              </div>

              {status === 'active' && <span className="pill good">Im Sortiment</span>}

              {status === 'locked' && (
                <span
                  className="pill"
                  title={`Diese Produktgruppe wird erst später freigeschaltet (${reason}). Sobald sie verfügbar ist, kannst du sie hier gegen die Listungsgebühr von ${euro(def.listingFee)} aufnehmen – Bestandskunden fragen sie dann auch aktiv nach.`}
                >
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
                    title={
                      affordable
                        ? undefined
                        : `Gesperrt: Die Listungsgebühr von ${euro(def.listingFee)} übersteigt Kasse + Kreditrahmen.`
                    }
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
