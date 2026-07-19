import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, equipmentLevel } from '../../game/simulation';
import { buyEquipment, setStrategy } from '../../game/actions';
import {
  EQUIPMENT_DEFS,
  STRATEGY_DEFS,
  STRATEGY_COOLDOWN_WEEKS,
} from '../../game/constants';
import { euro, weekOf } from '../../game/util';

/** Company screen (Pakete 2 & 4): capital investments (equipment) that relieve
 * bottlenecks, and the company strategy — a positioning choice with trade-offs.
 * Both are long-term decisions, grouped away from the day-to-day loop. */
export function CompanyModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const budget = state.cash + availableCredit(state);
  const week = weekOf(state.totalDays);
  const current = state.strategy ?? 'full';
  const switchLeft =
    state.strategyChangedWeek != null
      ? Math.max(0, STRATEGY_COOLDOWN_WEEKS - (week - state.strategyChangedWeek))
      : 0;

  return (
    <Modal title="Unternehmen · Ausbau & Strategie" icon="🏢" onClose={onClose} wide>
      <h3>🏗️ Investitionen & Ausrüstung</h3>
      <p className="hint" style={{ marginTop: 2 }}>
        Kapital-Investitionen, die je einen <b>Engpass</b> lösen – die Wirkung siehst du sofort im
        Betriebs-Cockpit. Aus „mehr Leute einstellen" wird „welchen Engpass löse ich womit?".
      </p>
      <div className="rows">
        {EQUIPMENT_DEFS.map((def) => {
          const level = equipmentLevel(state, def.id);
          const maxed = level >= def.maxLevel;
          const price = maxed ? 0 : def.price(level + 1);
          const canBuy = !maxed && budget >= price;
          return (
            <div key={def.id} className="row">
              <span style={{ fontSize: 22 }}>{def.icon}</span>
              <div className="grow">
                <div className="title">
                  {def.name}{' '}
                  <span className="sub">
                    · Stufe {level}/{def.maxLevel}
                  </span>
                </div>
                <div className="sub">{def.desc}</div>
                <div className="sub" style={{ color: level > 0 ? 'var(--good)' : 'var(--text-dim)' }}>
                  Aktuell: {def.effectLabel(level)}
                  {!maxed && <span style={{ color: 'var(--text-dim)' }}> → nächste Stufe: {def.effectLabel(level + 1)}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 120 }}>
                {maxed ? (
                  <span className="pill good">voll ausgebaut</span>
                ) : (
                  <>
                    <div className="sub">{euro(price)}</div>
                    <button
                      className="btn primary small"
                      disabled={!canBuy}
                      title={canBuy ? undefined : 'Nicht bezahlbar'}
                      onClick={() => mutate((s) => buyEquipment(s, def.id))}
                    >
                      Kaufen
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 20 }}>🎯 Firmen-Strategie</h3>
      <p className="hint" style={{ marginTop: 2 }}>
        Deine Ausrichtung mit echten Vor- und Nachteilen – es gibt mehrere sinnvolle Wege.
        {switchLeft > 0 && (
          <b style={{ color: 'var(--warn)' }}> Wechsel erst in {switchLeft} Woche(n) wieder möglich.</b>
        )}
      </p>
      <div className="two-col">
        {STRATEGY_DEFS.map((s) => {
          const activeStrat = current === s.id;
          return (
            <div
              key={s.id}
              className="row"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
                borderColor: activeStrat ? 'var(--accent)' : undefined,
                boxShadow: activeStrat ? '0 0 0 1px var(--accent)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 14 }}>{s.name}</div>
                  <div className="sub">{s.tagline}</div>
                </div>
                {activeStrat ? (
                  <span className="pill good">aktiv</span>
                ) : (
                  <button
                    className="btn small"
                    disabled={switchLeft > 0}
                    onClick={() => mutate((st) => setStrategy(st, s.id))}
                  >
                    Wählen
                  </button>
                )}
              </div>
              <div className="sub" style={{ color: 'var(--good)' }}>＋ {s.pros}</div>
              {s.cons !== 'Keine Sonderboni.' ? (
                <div className="sub" style={{ color: 'var(--bad)' }}>－ {s.cons}</div>
              ) : (
                <div className="sub" style={{ color: 'var(--text-dim)' }}>－ {s.cons}</div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
