import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  HIRE_WEEKS_UPFRONT,
  KAM_CAPACITY,
  ROLE_EMOJI,
  ROLE_LABEL,
  ROLE_SALARY,
  TRAINING_COST,
} from '../../game/constants';
import { capacityFor, kamCount, usedCapacity } from '../../game/simulation';
import { fireEmployee, hireEmployee, trainEmployee } from '../../game/actions';
import { euro } from '../../game/util';
import type { Role } from '../../game/types';

const HIREABLE: { role: Role; benefit: string }[] = [
  { role: 'lager', benefit: 'Richtet Ware her – mehr Personal = schnellere Palettenvorbereitung.' },
  { role: 'kam', benefit: `Kapazität für Kunden (${KAM_CAPACITY.small} kleine / ${KAM_CAPACITY.medium} mittlere / ${KAM_CAPACITY.large} große).` },
  { role: 'einkaeufer', benefit: 'Verhandelt Lieferanten-Preiserhöhungen herunter (skillabhängig).' },
];

export function EmployeesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const weeklyPayroll = state.employees.reduce((s, e) => s + e.salary, 0);

  return (
    <Modal title="Personal" icon="🧑‍💼" onClose={onClose} wide>
      <p className="hint">
        Wöchentliche Lohnkosten: <b>{euro(weeklyPayroll)}</b>. Einstellung kostet {HIRE_WEEKS_UPFRONT}{' '}
        Wochen im Voraus. Training +10 Skill für {euro(TRAINING_COST)}.
      </p>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="row" style={{ padding: '8px 10px' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>KAM-Kapazität (klein)</div>
            <div className="sub">{kamCount(state)} KAM angestellt</div>
          </div>
          <span className="pill">
            {usedCapacity(state, 'small')} / {capacityFor(state, 'small')}
          </span>
        </div>
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
          return (
            <div key={role} className="row">
              <span style={{ fontSize: 22 }}>{ROLE_EMOJI[role]}</span>
              <div className="grow">
                <div className="title">{ROLE_LABEL[role]}</div>
                <div className="sub">{benefit}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="sub">{euro(ROLE_SALARY[role])}/Woche</div>
                <div className="sub">Vorkasse {euro(upfront)}</div>
              </div>
              <button className="btn primary small" onClick={() => mutate((s) => hireEmployee(s, role))}>
                Einstellen
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
