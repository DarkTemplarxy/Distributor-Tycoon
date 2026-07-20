import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  BUYER_PRODUCT_CAPACITY,
  HIRE_WEEKS_UPFRONT,
  MANAGER_SLOTS,
  ROLE_EMOJI,
  ROLE_LABEL,
  ROLE_SALARY,
  SITE_META,
  SLOT_COST,
  TRAINING_COST,
  WEEKS_PER_MONTH,
} from '../../game/constants';
import {
  activeSites,
  branchOpen,
  buyerCapacity,
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
  { role: 'kam', benefit: `+${MANAGER_SLOTS} Kunden-Slots für kleine & mittlere Kunden (klein=${SLOT_COST.small}, mittel=${SLOT_COST.medium}) – Kapazität gilt PRO Manager. Großkunden betreut der Regional-KAM im Regionalbüro.` },
  { role: 'sales', benefit: 'Wirbt aktiv neue Kunden an: erhöht die wöchentliche Neukunden-Chance (mit abnehmendem Grenzertrag, steigt mit Skill). Zum Abschließen braucht es freie KAM-Slots.' },
  { role: 'einkaeufer', benefit: `Übernimmt Auto-Nachbestellung & verhandelt Preiserhöhungen – betreut max. ${BUYER_PRODUCT_CAPACITY} Produktgruppen pro Kopf. Breites Sortiment braucht mehrere.` },
];

/** Compact one-line description of a Lager worker's priority settings for the
 * collapsed summary, so you can scan assignments without expanding each row. */
function prefSummary(
  e: { role: Role; preferredTask?: 'prep' | 'putaway'; preferredProduct?: string },
  products: { id: string; name: string; emoji: string }[],
): string | null {
  if (e.role !== 'lager') return null;
  const task = e.preferredTask === 'prep' ? '👷 Herrichten' : e.preferredTask === 'putaway' ? '📥 Einlagern' : null;
  const prod = e.preferredProduct ? products.find((p) => p.id === e.preferredProduct) : null;
  const parts = [task, prod ? `${prod.emoji} ${prod.name}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'keine Priorität';
}

export function EmployeesModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const weeklyPayroll = state.employees.reduce((s, e) => s + e.salary, 0);
  const hasBranch = branchOpen(state);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allOpen = state.employees.length > 0 && state.employees.every((e) => open.has(e.id));
  const setAll = () => setOpen(allOpen ? new Set() : new Set(state.employees.map((e) => e.id)));

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
        <div className="row" style={{ padding: '8px 10px', flexWrap: 'wrap' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Einkäufer</div>
            <div className="sub">
              {state.employees.some((e) => e.role === 'einkaeufer')
                ? `Betreut ${Math.min(state.products.length, buyerCapacity(state))}/${state.products.length} Produktgruppen (max. ${BUYER_PRODUCT_CAPACITY} pro Einkäufer) – Auto-Bestellung & Preisverhandlung nur für betreute.`
                : 'Keiner – volle Preiserhöhungen, manuelle Bestellung'}
            </div>
          </div>
          <span
            className={`pill ${state.employees.some((e) => e.role === 'einkaeufer') && buyerCapacity(state) < state.products.length ? 'warn' : ''}`}
            title={buyerCapacity(state) < state.products.length && state.employees.some((e) => e.role === 'einkaeufer') ? 'Sortiment breiter als die Einkäufer-Kapazität – unbetreute Gruppen musst du manuell bestellen, Preiserhöhungen treffen sie voll.' : undefined}
          >
            {state.employees.filter((e) => e.role === 'einkaeufer').length}
          </span>
          {state.employees.some((e) => e.role === 'einkaeufer') && (
            <div
              style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}
              title="Der Einkäufer bestellt diesen Anteil ZUSÄTZLICH zum Wochenbedarf als Sicherheitspuffer gegen Nachfragespitzen und Verderb. Mehr Puffer = weniger Fehlmengen, aber mehr Lagerbestand und Kapitalbindung."
            >
              <span className="sub" style={{ minWidth: 116 }}>📋 Bestell-Anweisung:</span>
              <span className="sub">Puffer auf die Bestellung</span>
              {[0, 0.05, 0.1, 0.15, 0.2].map((b) => {
                const active = Math.abs((state.settings.buyerOrderBuffer ?? 0) - b) < 0.001;
                return (
                  <button
                    key={b}
                    className={`btn small${active ? ' primary' : ' ghost'}`}
                    onClick={() => mutate((s) => (s.settings.buyerOrderBuffer = b))}
                  >
                    +{Math.round(b * 100)}%
                  </button>
                );
              })}
            </div>
          )}
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

      <div className="section-head">
        <h3>Belegschaft</h3>
        {state.employees.length > 1 && (
          <button className="btn small ghost" onClick={setAll}>
            {allOpen ? 'Alle einklappen' : 'Alle ausklappen'}
          </button>
        )}
      </div>
      <div className="rows">
        {state.employees.map((e) => {
          const isOpen = open.has(e.id);
          const pref = prefSummary(e, state.products);
          return (
            <div key={e.id} className="row collapsible">
              <div className="collapse-head" onClick={() => toggle(e.id)}>
                <span className="collapse-chev">{isOpen ? '▾' : '▸'}</span>
                <span style={{ fontSize: 22 }}>{ROLE_EMOJI[e.role]}</span>
                <div className="grow">
                  <div className="title">{e.name}</div>
                  <div className="sub">
                    {ROLE_LABEL[e.role]} · {euro(e.salary)}/Woche · Skill {e.skill} ·{' '}
                    {e.task ? 'arbeitet' : 'frei'}
                    {hasBranch && e.role === 'lager' && ` · ${SITE_META[e.siteId ?? 'hq'].emoji} ${SITE_META[e.siteId ?? 'hq'].short}`}
                    {pref && ` · ${pref}`}
                  </div>
                </div>
                <button
                  className="btn small"
                  disabled={e.skill >= 100}
                  title="Schulung: +10 Skill – schnelleres Herrichten & Einlagern."
                  onClick={(ev) => {
                    ev.stopPropagation();
                    mutate((s) => trainEmployee(s, e.id));
                  }}
                >
                  🎓 Training
                </button>
                <span className={`pill ${e.task ? '' : 'good'}`}>{e.task ? '⚙️ aktiv' : 'frei'}</span>
              </div>

              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 26 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 150 }}>
                      <div className="sub">Skill {e.skill}/100</div>
                      <div className="progress" style={{ marginTop: 4 }}>
                        <span style={{ width: `${e.skill}%` }} />
                      </div>
                    </div>
                    <button
                      className="btn small danger"
                      disabled={!!e.task}
                      onClick={() => mutate((s) => fireEmployee(s, e.id))}
                    >
                      Entlassen
                    </button>
                  </div>
                  {e.role === 'lager' && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                      title="Anweisung: Aufgaben mit diesem Produkt übernimmt diese Kraft zuerst (Herrichten UND Einlagern). Gibt es gerade keine passende Arbeit, packt sie ganz normal überall mit an."
                    >
                      <span className="sub" style={{ minWidth: 116 }}>📋 Produkt-Priorität:</span>
                      <button
                        className={`btn small${!e.preferredProduct ? ' primary' : ' ghost'}`}
                        onClick={() => mutate((s) => {
                          const emp = s.employees.find((x) => x.id === e.id);
                          if (emp) emp.preferredProduct = undefined;
                        })}
                      >
                        Alle
                      </button>
                      {state.products.map((p) => (
                        <button
                          key={p.id}
                          className={`btn small${e.preferredProduct === p.id ? ' primary' : ' ghost'}`}
                          onClick={() => mutate((s) => {
                            const emp = s.employees.find((x) => x.id === e.id);
                            if (emp) emp.preferredProduct = p.id;
                          })}
                        >
                          {p.emoji} {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {e.role === 'lager' && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                      title="Anweisung: diese Aufgabenart übernimmt die Kraft zuerst. Gibt es davon gerade nichts, hilft sie bei der anderen aus (kein Leerlauf)."
                    >
                      <span className="sub" style={{ minWidth: 116 }}>🧭 Aufgaben-Priorität:</span>
                      {([
                        [undefined, 'Beides'],
                        ['putaway', '📥 Einlagern'],
                        ['prep', '👷 Herrichten'],
                      ] as const).map(([val, label]) => (
                        <button
                          key={label}
                          className={`btn small${(e.preferredTask ?? undefined) === val ? ' primary' : ' ghost'}`}
                          onClick={() => mutate((s) => {
                            const emp = s.employees.find((x) => x.id === e.id);
                            if (emp) emp.preferredTask = val;
                          })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
              {role === 'lager' && hasBranch ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {activeSites(state).map((st) => (
                    <button
                      key={st}
                      className="btn primary small"
                      title={`Lagerkraft am ${SITE_META[st].name} einstellen.`}
                      onClick={() => mutate((s) => hireEmployee(s, role, st))}
                    >
                      {SITE_META[st].emoji} {SITE_META[st].short}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="btn primary small"
                  disabled={noDesk}
                  title={noDesk ? 'Erst einen Schreibtisch im Büro bauen (Bau-Modus).' : undefined}
                  onClick={() => mutate((s) => hireEmployee(s, role))}
                >
                  Einstellen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
