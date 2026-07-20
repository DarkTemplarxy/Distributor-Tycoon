import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit, equipmentLevel, notify } from '../../game/simulation';
import { buyEquipment, openBranch, setStrategy } from '../../game/actions';
import {
  branchPrice,
  branchUnlockMonthly,
  BRANCH_RENT,
  EQUIPMENT_DEFS,
  monthlyRevenue,
  SITE_META,
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
  const lagerkraefte = state.employees.filter((e) => e.role === 'lager').length;
  const current = state.strategy ?? 'full';
  const switchLeft =
    state.strategyChangedWeek != null
      ? Math.max(0, STRATEGY_COOLDOWN_WEEKS - (week - state.strategyChangedWeek))
      : 0;

  return (
    <Modal title="Unternehmen · Ausbau & Strategie" icon="🏢" onClose={onClose} wide>
      <h3>🌍 Standorte (Konzern)</h3>
      {(() => {
        const rev = monthlyRevenue(state);
        const price = branchPrice('sued');
        const unlock = branchUnlockMonthly('sued');
        const unlocked = rev >= unlock;
        const open = !!state.branches?.sued;
        return (
          <div className="row" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 24 }}>{SITE_META.sued.emoji}</span>
            <div className="grow">
              <div className="title">{SITE_META.sued.name}</div>
              <div className="sub">
                {open
                  ? `Eröffnet – neue Region Süd mit eigenen Kunden. Exklusiv dort lieferbar: 🍷 Wein & 🫒 Oliven (Fisch nur per Transfer aus Nord). Miete +${euro(BRANCH_RENT)}/Monat.`
                  : `Erschließt die Region Süd: neuer Kundenstamm + exklusive Regionalprodukte (🍷 Wein, 🫒 Oliven). Eigene Halle, eigenes Lagerpersonal – die Verwaltung bleibt zentral. Ab ${euro(unlock)} Monatsumsatz (aktuell ${euro(rev)}). Weitere Städte – bis zur 👑 Hauptstadt – wählst du auf der 🗺️ Konzern-Karte.`}
              </div>
            </div>
            {open ? (
              <span className="pill good">Eröffnet W{(state.branchOpenedWeek ?? 0) + 1}</span>
            ) : (
              <button
                className="btn primary small"
                disabled={!unlocked || budget < price}
                title={
                  !unlocked
                    ? `Ab ${euro(unlock)} Monatsumsatz.`
                    : budget < price
                      ? `Eröffnung kostet ${euro(price)}.`
                      : 'Vorsicht: Eröffnung + Personal + Warenaufbau kosten zusammen deutlich mehr – wer sich übernimmt, riskiert die Kasse.'
                }
                onClick={() =>
                  mutate((s) => {
                    const r = openBranch(s, 'sued');
                    if (!r.ok && r.message) notify(s, `⚠️ ${r.message}`, 'warn');
                  })
                }
              >
                Eröffnen ({euro(price)})
              </button>
            )}
          </div>
        );
      })()}

      <h3>🏗️ Investitionen & Ausrüstung</h3>
      <p className="hint" style={{ marginTop: 2 }}>
        <b>Geräte</b> (Stapler, Wagen) sind <b>physisch</b> und helfen je <b>einem</b> Mitarbeiter,
        der sie gerade nutzt – du brauchst etwa so viele wie gleichzeitig arbeitende Kräfte
        ({lagerkraefte} Lagerkräfte). <b>Anlagen</b> (Kühltechnik, LKW) wirken betriebsweit. Wirkung
        sofort im Cockpit sichtbar.
      </p>
      <div className="rows">
        {EQUIPMENT_DEFS.map((def) => {
          const owned = equipmentLevel(state, def.id);
          const maxed = owned >= def.max;
          const price = maxed ? 0 : def.price(owned + 1);
          const canBuy = !maxed && budget >= price;
          const perWorker = def.kind === 'perWorker';
          // For per-worker devices: how many more you'd want to cover the crew.
          const shortfall = perWorker ? Math.max(0, lagerkraefte - owned) : 0;
          return (
            <div key={def.id} className="row">
              <span style={{ fontSize: 22 }}>{def.icon}</span>
              <div className="grow">
                <div className="title">
                  {def.name}{' '}
                  <span className="sub">
                    · {perWorker ? `Anzahl ${owned}/${def.max}` : `Stufe ${owned}/${def.max}`}
                  </span>
                  {perWorker && (
                    <span className={`pill ${shortfall > 0 ? 'warn' : 'good'}`} style={{ marginLeft: 6 }}>
                      {shortfall > 0 ? `${shortfall} unter Belegschaft` : 'deckt Belegschaft'}
                    </span>
                  )}
                </div>
                <div className="sub">{def.desc}</div>
                <div className="sub" style={{ color: owned > 0 ? 'var(--good)' : 'var(--text-dim)' }}>
                  Aktuell: {def.effectLabel(owned)}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 130 }}>
                {maxed ? (
                  <span className="pill good">{perWorker ? 'Maximum' : 'voll ausgebaut'}</span>
                ) : (
                  <>
                    <div className="sub">{euro(price)}</div>
                    <button
                      className="btn primary small"
                      disabled={!canBuy}
                      title={canBuy ? undefined : 'Nicht bezahlbar'}
                      onClick={() => mutate((s) => buyEquipment(s, def.id))}
                    >
                      {perWorker ? '+1 Kaufen' : 'Ausbauen'}
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
