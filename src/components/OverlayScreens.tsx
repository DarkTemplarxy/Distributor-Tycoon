import { useGame } from '../state/GameProvider';
import { computeYearStats } from '../game/simulation';
import { MILESTONE_DEFS } from '../game/constants';
import { euro, weekOf, yearOf } from '../game/util';
import type { CustomerType } from '../game/types';

// The former StartScreen was replaced by the tutorial's intro overlay
// (TutorialLayer) — every fresh game now begins with the guided onboarding.

/** The uncle's verdict — 4 tiers by milestones reached (gated on a profitable
 * year for the higher ones). No game over, only an honest, warm appraisal. */
function uncleVerdict(profit: number, milestones: number): { emoji: string; text: string } {
  if (profit < 0 || milestones < 3) {
    return {
      emoji: '🤗',
      text: 'Das erste Jahr ist das schwerste, Junge. Lass den Kopf nicht hängen – du hast eine Menge gelernt, und der Laden läuft noch.',
    };
  }
  if (milestones < 6) {
    return {
      emoji: '🙂',
      text: 'Solide gemacht! Der Laden steht auf eigenen Beinen. Nächstes Jahr legst du eine Schippe drauf.',
    };
  }
  if (milestones < 9) {
    return {
      emoji: '😄',
      text: 'Richtig stark. Ich hätte nicht gedacht, dass das kleine Geschäft so wachsen kann.',
    };
  }
  return {
    emoji: '🥹',
    text: 'Du hast aus meinem kleinen Laden was Großes gemacht. Ich bin unendlich stolz auf dich.',
  };
}

export function YearCompleteScreen({ onRestart }: { onRestart: () => void }) {
  const { state, continueYear } = useGame();

  // At the boundary week 48/96/… the year that just ended is the one before the
  // current year index; compute its figures from the weekly reports.
  const yearNumber = yearOf(weekOf(state.totalDays)); // 1, 2, …
  const yr = computeYearStats(state, yearNumber - 1);
  const prev = state.lastYearStats; // previous year, comparison base (null in year 1)

  const activeByType = (t: CustomerType) =>
    state.customers.filter((c) => c.active && c.type === t).length;
  const small = activeByType('small');
  const medium = activeByType('medium');
  const large = activeByType('large');
  const expansions = state.warehouse.expansions + state.warehouse.officeExpansions;
  const verdict = uncleVerdict(yr.profit, yr.milestonesAchieved);

  const delta = (now: number, before: number) => {
    if (now === before) return '';
    const up = now > before;
    return ` ${up ? '▲' : '▼'}`;
  };

  return (
    <div className="overlay-screen">
      <div className="overlay-card" style={{ maxWidth: 560 }}>
        <div className="big-emoji">🏁</div>
        <h1>Jahresbilanz · Jahr {yearNumber}</h1>
        <p style={{ maxWidth: 480, margin: '8px auto', fontStyle: 'italic' }}>
          {verdict.emoji} „{verdict.text}"
        </p>

        <div className="report-grid" style={{ textAlign: 'left' }}>
          <div className="stat-box">
            <div className="k">Jahresumsatz</div>
            <div className="v">{euro(yr.revenue)}</div>
          </div>
          <div className="stat-box">
            <div className="k">Jahresgewinn</div>
            <div className="v" style={{ color: yr.profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              {euro(yr.profit)}
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Endkapital (Start €10.000)</div>
            <div className="v" style={{ color: yr.cashEnd >= 0 ? 'var(--cash)' : 'var(--bad)' }}>
              {euro(yr.cashEnd)}
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Kunden (Start 2)</div>
            <div className="v">
              {yr.customersEnd}
              <span className="sub" style={{ marginLeft: 6 }}>
                {small}k · {medium}m · {large}g
              </span>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Aufträge geliefert</div>
            <div className="v">
              {yr.deliveredOrders}
              {yr.lateOrders > 0 && (
                <span style={{ color: 'var(--bad)', fontSize: 13 }}> · {yr.lateOrders} spät</span>
              )}
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Verdorbene Ware</div>
            <div className="v" style={{ color: yr.spoiledUnits > 0 ? 'var(--warn)' : undefined }}>
              {yr.spoiledUnits}
              <span className="sub" style={{ marginLeft: 6 }}>{euro(yr.spoilageLoss)}</span>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Team & Ausbau</div>
            <div className="v">
              {state.employees.length} MA
              <span className="sub" style={{ marginLeft: 6 }}>{expansions} Erweiterungen</span>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Meilensteine</div>
            <div className="v">
              {yr.milestonesAchieved}
              <span className="sub">/{MILESTONE_DEFS.length}</span>
            </div>
          </div>
        </div>

        {prev && (
          <p className="hint" style={{ marginTop: 10 }}>
            Vorjahr (Jahr {prev.year}): Umsatz {euro(prev.revenue)}{delta(yr.revenue, prev.revenue)} ·
            Gewinn {euro(prev.profit)}{delta(yr.profit, prev.profit)}
          </p>
        )}
        <p className="hint" style={{ marginTop: prev ? 2 : 10 }}>
          👴 „Mal sehen, ob du dich nächstes Jahr selbst schlägst."
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
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
