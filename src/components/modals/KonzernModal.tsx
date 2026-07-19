import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import {
  activeSites,
  warehouseOf,
  shelfFree,
  normalShelfCapacity,
  normalShelfUsed,
  coldShelfCapacity,
  coldShelfUsed,
  siteOfOrder,
  coldChainGap,
  marketShare,
  playerRank,
  marketRanking,
} from '../../game/simulation';
import { siteManager, siteWeeklyVolume, hireEmployee } from '../../game/actions';
import { SITE_META, ROLE_SALARY, HIRE_WEEKS_UPFRONT } from '../../game/constants';
import type { SiteId } from '../../game/types';

const eur = (n: number) => Math.round(n).toLocaleString('de-DE');
const LEITER_UPFRONT = ROLE_SALARY.standortleiter * HIRE_WEEKS_UPFRONT;

/** A compact KPI figure with a label. */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div style={{ minWidth: 72 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: tone === 'bad' ? 'var(--bad)' : tone === 'good' ? 'var(--good)' : undefined }}>
        {value}
      </div>
      <div className="sub" style={{ fontSize: 11 }}>{label}</div>
    </div>
  );
}

/**
 * Konzern-Cockpit — die Vogelperspektive über alle Standorte. Der Hebel für die
 * Fluidität: du gibst einen Standort an einen Standortleiter ab (führt ihn headless
 * automatisch) und steuerst ihn nur noch von hier — reinklicken lädt das echte Lager.
 * Vom Lagersimulator zum Konzern.
 */
export function KonzernModal({ onClose, onEnterSite }: { onClose: () => void; onEnterSite: (site: SiteId) => void }) {
  const { state, mutate } = useGame();
  const sites = activeSites(state);
  const share = marketShare(state);
  const rank = playerRank(state);
  const totalRanks = marketRanking(state).length;

  const hireLeiter = (site: SiteId) => mutate((s) => hireEmployee(s, 'standortleiter', site));

  return (
    <Modal title="Konzern-Cockpit" icon="🗺️" onClose={onClose} wide>
      <p className="hint">
        Deine Vogelperspektive über alle Standorte. Setze einen <b>🧑‍✈️ Standortleiter</b> ein, und der
        Standort <b>führt sich selbst</b> (stellt Personal ein, baut Kapazität aus, trainiert die Crew) –
        du steuerst ihn nur noch von hier. Für den <b>Nachschub sorgt weiterhin der Einkäufer</b> zentral.
        So wächst du vom Hands-on-Lager zum Konzern, ohne den Überblick zu verlieren.
      </p>

      <div className="row" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <div className="grow">
          <div className="title" style={{ fontSize: 13 }}>Marktanteil</div>
          <div className="sub">Platz {rank} von {totalRanks} · Details im „Markt"-Fenster</div>
        </div>
        <span className={`pill ${rank === 1 ? 'good' : ''}`} style={{ fontSize: 15 }}>{(share * 100).toFixed(1)}%</span>
      </div>

      <div className="rows">
        {sites.map((site) => {
          const meta = SITE_META[site];
          const w = warehouseOf(state, site);
          const leiter = siteManager(state, site);
          const regionCust = state.customers.filter((c) => c.active && (c.region ?? 'hq') === site);
          const vol = siteWeeklyVolume(state, site);
          const crew = state.employees.filter((e) => e.role === 'lager' && (e.siteId ?? 'hq') === site);
          const avgSkill = crew.length ? crew.reduce((a, e) => a + e.skill, 0) / crew.length : 0;
          const svc = regionCust.length ? regionCust.reduce((a, c) => a + c.serviceRating, 0) / regionCust.length : 0;
          const shelfCap = normalShelfCapacity(state, site);
          const shelfUsedPct = shelfCap > 0 ? (normalShelfUsed(state, site) / shelfCap) * 100 : 0;
          const coldCap = coldShelfCapacity(state, site);
          const coldUsedPct = coldCap > 0 ? (coldShelfUsed(state, site) / coldCap) * 100 : 0;

          const lateHere = state.orders.filter(
            (o) => o.status !== 'delivered' && o.late && siteOfOrder(state, o) === site,
          ).length;
          const shelfTight = shelfFree(state, site) < Math.max(120, vol * 0.4);
          const coldGap = site === 'hq' && coldChainGap(state); // gap-Erkennung ist HQ-orientiert
          const alarms: string[] = [];
          if (lateHere > 0) alarms.push(`⏰ ${lateHere} verspätete Aufträge`);
          if (shelfTight) alarms.push('📦 Regalplatz knapp');
          if (coldGap) alarms.push('❄️ Kühlkette: kein Kühlregal');
          if (regionCust.length > 0 && crew.length === 0) alarms.push('👷 keine Lagerkraft');

          return (
            <div
              key={site}
              className="row"
              style={{ flexWrap: 'wrap', alignItems: 'stretch', gap: 10, padding: '12px 14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <span style={{ fontSize: 26 }}>{meta.emoji}</span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 15 }}>
                    {meta.name}{' '}
                    {leiter
                      ? <span className="pill good">🧑‍✈️ automatisch geführt</span>
                      : <span className="pill">Hands-on</span>}
                  </div>
                  <div className="sub">
                    {leiter
                      ? `${leiter.name} führt den Standort – stellt ein, baut aus, trainiert.`
                      : 'Du führst diesen Standort selbst (Personal & Ausbau von Hand).'}
                  </div>
                </div>
                <button className="btn" onClick={() => { onEnterSite(site); onClose(); }}>
                  Betreten →
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', paddingLeft: 36 }}>
                <Kpi label="Kunden" value={String(regionCust.length)} />
                <Kpi label="Volumen/Wo." value={eur(vol)} />
                <Kpi label="Lager" value={String(crew.length)} />
                <Kpi label="Packtische" value={String(w.tables.length)} />
                <Kpi label="Ø-Skill" value={crew.length ? avgSkill.toFixed(0) : '–'} />
                <Kpi label="Service" value={svc > 0 ? `${svc.toFixed(1)}★` : '–'} tone={svc > 0 && svc < 3 ? 'bad' : svc >= 4 ? 'good' : undefined} />
                <Kpi label="Regal belegt" value={`${shelfUsedPct.toFixed(0)}%`} tone={shelfUsedPct > 90 ? 'bad' : undefined} />
                {coldCap > 0 && <Kpi label="Kühl belegt" value={`${coldUsedPct.toFixed(0)}%`} tone={coldUsedPct > 90 ? 'bad' : undefined} />}
              </div>

              {alarms.length > 0 && (
                <div style={{ width: '100%', paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {alarms.map((a) => <span key={a} className="pill bad" style={{ fontSize: 12 }}>{a}</span>)}
                </div>
              )}

              {!leiter && (
                <div style={{ width: '100%', paddingLeft: 36 }}>
                  <button
                    className="btn primary"
                    onClick={() => hireLeiter(site)}
                    disabled={state.cash < LEITER_UPFRONT}
                    title={state.cash < LEITER_UPFRONT ? `Kostet ${eur(LEITER_UPFRONT)}€ Vorkasse` : undefined}
                  >
                    🧑‍✈️ Standortleiter einstellen ({eur(ROLE_SALARY.standortleiter)}€/Woche)
                  </button>
                  <span className="sub" style={{ marginLeft: 8 }}>
                    {eur(LEITER_UPFRONT)}€ Vorkasse · führt {meta.name} ab dann automatisch
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sites.length === 1 && (
        <p className="hint" style={{ marginTop: 12 }}>
          Noch nur ein Standort. Eröffne über <b>🏢 Ausbau</b> den <b>Standort Süd</b> – dann kannst du ihn
          hier einem Standortleiter übergeben und den Konzern wächst.
        </p>
      )}
    </Modal>
  );
}
