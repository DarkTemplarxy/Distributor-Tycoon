import { useGame } from '../state/GameProvider';
import { MONTHS_PER_YEAR, QUARTER_LABEL, WEEKS_PER_MONTH } from '../game/constants';
import { dayName, euro, formatClock, monthOfYear, quarterOf, weekOf, weekOfMonth, yearOf } from '../game/util';
import type { Speed } from '../game/types';
import { Stars } from './shared';

const SPEEDS: Speed[] = [0.5, 1, 2, 4];

export function TopBar({ onRestart, onHelp }: { onRestart: () => void; onHelp: () => void }) {
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

      <div className="tb-stat">
        <span className="label">Jahr</span>
        <span className="value">{yearOf(week) + 1}</span>
      </div>
      <div className="tb-stat">
        <span className="label">Monat</span>
        <span className="value">
          {monthOfYear(week) + 1}/{MONTHS_PER_YEAR}
        </span>
      </div>
      <div className="tb-stat">
        <span className="label">Woche</span>
        <span className="value">
          {weekOfMonth(week) + 1}/{WEEKS_PER_MONTH}
        </span>
      </div>
      <div className="tb-stat">
        <span className="label">Zeit</span>
        <span className="value">
          {dayName(state.totalDays)} {formatClock(state.totalDays)}
        </span>
      </div>
      <div className="tb-stat">
        <span className="label">Quartal</span>
        <span className="value" style={{ fontSize: 13 }}>{QUARTER_LABEL[q]}</span>
      </div>

      <div className="tb-stat">
        <span className="label">Kasse</span>
        <span className={`value cash${state.cash < 0 ? ' neg' : ''}`}>{euro(state.cash)}</span>
      </div>
      <div className="tb-stat">
        <span className="label">Kredit</span>
        <span className={`value${state.bankCredit > 0 ? ' neg' : ''}`} style={{ fontSize: 14 }}>
          {euro(state.bankCredit)} / {euro(state.creditLimit)}
        </span>
      </div>
      <div className="tb-stat">
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
        <button onClick={onHelp} title="Hilfe & Spielregeln">
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
