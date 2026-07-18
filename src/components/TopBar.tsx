import { useGame } from '../state/GameProvider';
import { MONTHS_PER_YEAR, QUARTER_LABEL, WEEKS_PER_MONTH } from '../game/constants';
import { dayName, euro, formatClock, monthOfYear, quarterOf, weekOf, weekOfMonth, yearOf } from '../game/util';
import type { Speed } from '../game/types';
import { Stars } from './shared';

const SPEEDS: Speed[] = [0.5, 1, 2, 4];

export function TopBar({
  onRestart,
  onHelp,
  onWiki,
}: {
  onRestart: () => void;
  onHelp: () => void;
  onWiki: () => void;
}) {
  const { state, setSpeed, togglePause, saveNow, mutate } = useGame();
  const week = weekOf(state.totalDays);
  const q = quarterOf(week);

  const handleSave = () => {
    saveNow();
  };

  return (
    <div className="topbar">
      <div className="brand">
        <span className="logo">🏭</span>
        <span>Distributor Tycoon</span>
      </div>

      <div className="tb-stat" title="Ein Spieljahr hat 48 Wochen (12 Monate × 4). Am Jahresende wartet die Jahresbilanz.">
        <span className="label">Jahr</span>
        <span className="value">{yearOf(week) + 1}</span>
      </div>
      <div className="tb-stat" title="Monat im laufenden Jahr. Am Monatsende werden Personal & Miete gesammelt abgebucht.">
        <span className="label">Monat</span>
        <span className="value">
          {monthOfYear(week) + 1}/{MONTHS_PER_YEAR}
        </span>
      </div>
      <div className="tb-stat" title="Woche im Monat. Do: neue Anfragen · Sa: Bestellfenster · Mo: Lieferung.">
        <span className="label">Woche</span>
        <span className="value">
          {weekOfMonth(week) + 1}/{WEEKS_PER_MONTH}
        </span>
      </div>
      <div className="tb-stat" title="Gearbeitet wird 6–20 Uhr; nachts läuft die Zeit ×16. Der Abhol-LKW kommt täglich um 18 Uhr.">
        <span className="label">Zeit</span>
        <span className="value">
          {dayName(state.totalDays)} {formatClock(state.totalDays)}
        </span>
      </div>
      <div className="tb-stat" title="Saison: Die Nachfrage schwankt je Produkt mit dem Quartal. Quartalswechsel können Einkaufspreise erhöhen.">
        <span className="label">Quartal</span>
        <span className="value" style={{ fontSize: 13 }}>{QUARTER_LABEL[q]}</span>
      </div>

      <div className="tb-stat" title="Bargeld. Fällt die Kasse unter −6.000 €, ist das Spiel verloren (Insolvenz).">
        <span className="label">Kasse</span>
        <span className={`value cash${state.cash < 0 ? ' neg' : ''}`}>{euro(state.cash)}</span>
      </div>
      <div
        className="tb-stat"
        title="Genutzter Kredit / Rahmen. Der Rahmen wächst mit dem Ø-Wochengewinn (min. 4.000 €); Zins 2 % pro Woche."
      >
        <span className="label">Kredit</span>
        <span className={`value${state.bankCredit > 0 ? ' neg' : ''}`} style={{ fontSize: 14 }}>
          {euro(state.bankCredit)} / {euro(state.creditLimit)}
        </span>
      </div>
      <div
        className="tb-stat"
        title="Firmenweite Service-Sterne (Ø der Kundenbewertungen). Verspätungen senken sie; gute Sterne erhöhen Verspätungs-Toleranz, Verhandlungschancen und die erzielbare Marge."
      >
        <span className="label">Service</span>
        <span className="value">
          <Stars value={state.serviceStars} />
        </span>
      </div>

      <div className="spacer" />

      <label className="toggle" title="Freie Mitarbeiter automatisch Aufträgen zuweisen">
        <input
          type="checkbox"
          checked={state.settings.autoPrep}
          onChange={(e) => mutate((s) => (s.settings.autoPrep = e.target.checked))}
        />
        Auto-Herrichten
      </label>

      <div className="speed-control">
        <button
          className={state.paused ? 'active' : ''}
          onClick={togglePause}
          title="Pause / Start (Leertaste)"
        >
          {state.paused ? '▶' : '⏸'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={!state.paused && state.speed === s ? 'active' : ''}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="speed-control">
        <button onClick={onWiki} title="Handbuch – alle Spielregeln & Zahlen zum Nachschlagen">
          📖
        </button>
        <button onClick={onHelp} title="Hilfe & Spielregeln (Kurzfassung)">
          ❔
        </button>
        <button onClick={handleSave} title="Jetzt speichern">
          💾
        </button>
        <button onClick={onRestart} title="Neues Spiel">
          🔄
        </button>
      </div>
    </div>
  );
}
