import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  HIRE_WEEKS_UPFRONT,
  MANAGER_SLOTS,
  ROLE_EMOJI,
  ROLE_LABEL,
  ROLE_SALARY,
  SLOT_COST,
  TRAINING_COST,
  WEEKS_PER_MONTH,
} from '../../game/constants';
import {
  currentMonthlyRent,
  deskCount,
  expectedNewInquiriesPerWeek,
  freeDesks,
  managers,
} from '../../game/simulation';
import { fireEmployee, hireEmployee, trainEmployee } from '../../game/actions';
import { euro } from '../../game/util';
import type { Role } from '../../game/types';

const HIREABLE: { role: Role; benefit: string }[] = [
  { role: 'lager', benefit: 'Richtet Ware her – mehr Personal = schnellere Palettenvorbereitung.' },
  { role: 'kam', benefit: `+${MANAGER_SLOTS} Kunden-Slots (klein=${SLOT_COST.small}, mittel=${SLOT_COST.medium}, groß=${SLOT_COST.large} Slots) – Kapazität gilt PRO Manager.` },
  { role: 'sales', benefit: 'Wirbt aktiv neue Kunden an: erhöht die wöchentliche Neukunden-Chance (mit abnehmendem Grenzertrag, steigt mit Skill). Zum Abschließen braucht es freie KAM-Slots.' },
  { role: 'einkaeufer', benefit: 'Übernimmt die automatische Nachbestellung (bedarfsbasiert) und verhandelt Lieferanten-Preiserhöhungen herunter.' },
];

export function EmployeesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const weeklyPayroll = state.employees.reduce((s, e) => s + e.salary, 0);

  return (
    <Modal title="Personal" icon="🧑‍💼" onClose={onClose} wide>
      <p className="hint">
        Monatliche Lohnkosten: <b>{euro(weeklyPayroll * WEEKS_PER_MONTH)}</b> (+ Miete{' '}
        {euro(currentMonthlyRent(state))}) – werden am Monatsende verrechnet. Einstellung kostet{' '}
        {HIRE_WEEKS_UPFRONT} Wochen im Voraus. Training +10 Skill für {euro(TRAINING_COST)}.
      </p>

      <h3>Kunden-Slots pro Manager</h3>
      <p className="hint" style={{ marginTop: 2 }}>
        Jeder Manager (du + jeder KAM) betreut max. {MANAGER_SLOTS} Slots: klein={SLOT_COST.small},
        mittel={SLOT_COST.medium}, groß={SLOT_COST.large}. Ein neuer Kunde braucht seine Slots bei{' '}
        <b>einem</b> Manager – umverteilen geht in der Kunden-Ansicht.
      </p>
      <div className="two-col" style={{ marginBottom: 12 }}>
        {managers(state).map((m) => (
          <div key={m.id} className="row" style={{ padding: '8px 10px' }}>
            <span style={{ fontSize: 18 }}>{m.isChef ? '👔' : '🧑‍💼'}</span>
            <div className="grow">
              <div className="title" style={{ fontSize: 13 }}>{m.name}</div>
              <div className="sub">
                {m.counts.small} klein · {m.counts.medium} mittel · {m.counts.large} groß
              </div>
            </div>
            <span className={`pill ${m.free > 0 ? 'good' : 'bad'}`}>
              {m.used}/{MANAGER_SLOTS} Slots
            </span>
          </div>
        ))}
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="row" style={{ padding: '8px 10px' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Einkäufer</div>
            <div className="sub">
              {state.employees.some((e) => e.role === 'einkaeufer')
                ? 'Verhandelt Preiserhöhungen'
                : 'Keiner – volle Preiserhöhungen'}
            </div>
          </div>
          <span className="pill">{state.employees.filter((e) => e.role === 'einkaeufer').length}</span>
        </div>
        <div
          className="row"
          style={{ padding: '8px 10px' }}
          title="Vertriebsmitarbeiter vergrößern deinen Markt je Kundengröße (abnehmender Grenzertrag). Jede Kundengröße sättigt gegen ihre eigene Kundenzahl – kleine Kunden werden mit der Zeit seltener, mittlere/große bleiben ein eigener Kanal."
        >
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Vertrieb · Akquise</div>
            <div className="sub">
              {state.employees.filter((e) => e.role === 'sales').length} Vertriebsmitarbeiter · Ø ~
              {expectedNewInquiriesPerWeek(state).toFixed(1)} Neukunden-Anfragen/Woche
            </div>
          </div>
          <span className="pill">{state.employees.filter((e) => e.role === 'sales').length}</span>
        </div>
        <div className="row" style={{ padding: '8px 10px' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Arbeitsplätze (Büro)</div>
            <div className="sub">Büro-Personal braucht je einen freien Schreibtisch</div>
          </div>
          <span className={`pill ${freeDesks(state) > 0 ? 'good' : 'bad'}`}>
            {freeDesks(state)} / {deskCount(state)} frei
          </span>
        </div>
      </div>

      <h3>Belegschaft</h3>
      <div className="rows">
        {state.employees.map((e) => (
          <div key={e.id} className="row">
            <span style={{ fontSize: 22 }}>{ROLE_EMOJI[e.role]}</span>
            <div className="grow">
              <div className="title">{e.name}</div>
              <div className="sub">
                {ROLE_LABEL[e.role]} · {euro(e.salary)}/Woche · {e.task ? 'arbeitet' : 'frei'}
              </div>
            </div>
            <div style={{ minWidth: 130 }}>
              <div className="sub">Skill {e.skill}/100</div>
              <div className="progress" style={{ marginTop: 4 }}>
                <span style={{ width: `${e.skill}%` }} />
              </div>
            </div>
            <button
              className="btn small"
              disabled={e.skill >= 100}
              onClick={() => mutate((s) => trainEmployee(s, e.id))}
            >
              🎓 Training
            </button>
            <button
              className="btn small danger"
              disabled={!!e.task}
              onClick={() => mutate((s) => fireEmployee(s, e.id))}
            >
              Entlassen
            </button>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Einstellen</h3>
      <div className="rows">
        {HIREABLE.map(({ role, benefit }) => {
          const upfront = ROLE_SALARY[role] * HIRE_WEEKS_UPFRONT;
          const needsDesk = role !== 'lager';
          const noDesk = needsDesk && freeDesks(state) <= 0;
          return (
            <div key={role} className="row">
              <span style={{ fontSize: 22 }}>{ROLE_EMOJI[role]}</span>
              <div className="grow">
                <div className="title">{ROLE_LABEL[role]}</div>
                <div className="sub">
                  {benefit}
                  {noDesk && <span style={{ color: 'var(--bad)' }}> · kein freier Arbeitsplatz</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="sub">{euro(ROLE_SALARY[role])}/Woche</div>
                <div className="sub">Vorkasse {euro(upfront)}</div>
              </div>
              <button
                className="btn primary small"
                disabled={noDesk}
                title={noDesk ? 'Erst einen Schreibtisch im Büro bauen (Bau-Modus).' : undefined}
                onClick={() => mutate((s) => hireEmployee(s, role))}
              >
                Einstellen
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
