import { useGame } from '../state/GameProvider';
import { euro, weekOf, yearOf } from '../game/util';

/** Shown at the very start (fresh game, still paused, no time elapsed). */
export function StartScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div className="big-emoji">🏭</div>
        <h1>Distributor Tycoon</h1>
        <p style={{ maxWidth: 440, margin: '10px auto' }}>
          Szenario <b>„Der Onkel"</b>: Du übernimmst einen kleinen Lebensmittel-Großhandel – 2 Kunden,
          1 Lieferant, 2 Lagermitarbeiter, 10.000€ Startkapital. Bringe das Geschäft durch 12 Monate.
        </p>
        <div style={{ textAlign: 'left', maxWidth: 440, margin: '14px auto', fontSize: 13, color: 'var(--text-dim)' }}>
          <p>🧾 Kunden bestellen wöchentlich – halte die Lieferfristen ein.</p>
          <p>🛒 Kaufe Ware selbst ein (ein Einkäufer bestellt später automatisch nach).</p>
          <p>👷 Lass Mitarbeiter Paletten herrichten (läuft automatisch).</p>
          <p>🚚 Der Laster holt täglich um 18:00 fertige Paletten ab.</p>
          <p>💰 Zahlung vom Kunden folgt 1 Woche nach Lieferung.</p>
          <p>💸 Personal & Miete werden am Monatsende verrechnet.</p>
        </div>
        <button className="btn primary" style={{ fontSize: 15, padding: '10px 22px' }} onClick={onDismiss}>
          ▶ Los geht's
        </button>
      </div>
    </div>
  );
}

export function YearCompleteScreen({ onRestart }: { onRestart: () => void }) {
  const { state, continueYear } = useGame();

  // Figures for the year that just ended (not cumulative), summed from its
  // weekly reports. At the boundary week 48/96/… the completed year is the one
  // before the current year index.
  const yearNumber = yearOf(weekOf(state.totalDays)); // 1, 2, …
  const yearReports = state.reports.filter((r) => yearOf(r.week) === yearNumber - 1);
  const yrRevenue = yearReports.reduce((s, r) => s + r.revenue, 0);
  const yrProfit = yearReports.reduce((s, r) => s + r.profit, 0);
  const yrDelivered = yearReports.reduce((s, r) => s + r.deliveredOrders, 0);
  const yrLate = yearReports.reduce((s, r) => s + r.lateOrders, 0);

  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div className="big-emoji">🏁</div>
        <h1>Jahr {yearNumber} geschafft!</h1>
        <p>12 Monate gemeistert. Dein Jahresabschluss:</p>
        <div className="report-grid" style={{ textAlign: 'left' }}>
          <div className="stat-box">
            <div className="k">Endkapital</div>
            <div className="v" style={{ color: state.cash >= 0 ? 'var(--cash)' : 'var(--bad)' }}>{euro(state.cash)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Jahresgewinn</div>
            <div className="v" style={{ color: yrProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{euro(yrProfit)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Jahresumsatz</div>
            <div className="v">{euro(yrRevenue)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Aufträge geliefert</div>
            <div className="v">
              {yrDelivered}
              {yrLate > 0 && <span style={{ color: 'var(--bad)', fontSize: 13 }}> · {yrLate} spät</span>}
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Kunden aktiv</div>
            <div className="v">{state.customers.filter((c) => c.active).length}</div>
          </div>
          <div className="stat-box">
            <div className="k">Gewinn gesamt</div>
            <div className="v" style={{ color: state.stats.totalProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              {euro(state.stats.totalProfit)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button className="btn primary" onClick={continueYear}>
            ▶ Jahr {yearNumber + 1} weiterspielen
          </button>
          <button className="btn" onClick={onRestart}>
            Neues Spiel
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOverScreen() {
  const { state, newGame } = useGame();
  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div className="big-emoji">💀</div>
        <h1>Insolvenz</h1>
        <p>Das Geschäft ist pleite. Kasse: {euro(state.cash)}.</p>
        <button className="btn primary" onClick={newGame}>
          Neu starten
        </button>
      </div>
    </div>
  );
}
