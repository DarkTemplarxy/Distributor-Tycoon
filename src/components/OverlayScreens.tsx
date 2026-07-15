import { useGame } from '../state/GameProvider';
import { euro } from '../game/util';

/** Shown at the very start (fresh game, still paused, no time elapsed). */
export function StartScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div className="big-emoji">🏭</div>
        <h1>Distributor Tycoon</h1>
        <p style={{ maxWidth: 440, margin: '10px auto' }}>
          Szenario <b>„Der Onkel"</b>: Du übernimmst einen kleinen Lebensmittel-Großhandel – 2 Kunden,
          1 Lieferant, 2 Lagermitarbeiter, 5.000€ Startkapital. Bringe das Geschäft durch 52 Wochen.
        </p>
        <div style={{ textAlign: 'left', maxWidth: 440, margin: '14px auto', fontSize: 13, color: 'var(--text-dim)' }}>
          <p>🧾 Kunden bestellen wöchentlich – halte die Lieferfristen ein.</p>
          <p>🛒 Kaufe Ware beim Lieferanten (1 Woche Lieferzeit).</p>
          <p>👷 Lass Mitarbeiter Paletten herrichten (läuft automatisch).</p>
          <p>🚚 Montag 18:00 holt der Laster fertige Paletten ab.</p>
          <p>💰 Zahlung vom Kunden folgt 1 Woche nach Lieferung.</p>
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
  const profit = state.stats.totalProfit;
  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div className="big-emoji">🏁</div>
        <h1>Jahr geschafft!</h1>
        <p>52 Wochen gemeistert. Hier dein Jahresabschluss:</p>
        <div className="report-grid" style={{ textAlign: 'left' }}>
          <div className="stat-box">
            <div className="k">Endkapital</div>
            <div className="v" style={{ color: state.cash >= 0 ? 'var(--cash)' : 'var(--bad)' }}>{euro(state.cash)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Jahresgewinn</div>
            <div className="v" style={{ color: profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{euro(profit)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Umsatz</div>
            <div className="v">{euro(state.stats.totalRevenue)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Kunden aktiv</div>
            <div className="v">{state.customers.filter((c) => c.active).length}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button className="btn primary" onClick={continueYear}>
            Weiterspielen
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
