// ============================================================================
// Konzern-Karte — die Vogelperspektive als eigener Vollbild-Screen. Die Interaktions-
// höhe steigt mit dem Wachstum: du zoomst von der STADT-Ebene (deine zwei Städte Nord
// & Süd) hinaus auf DEUTSCHLAND (Städte) und EUROPA (Länder). Aus dem Lagersimulator
// wird ein Konzern. Ein Klick auf einen Standort führt zurück ins echte Lager.
// ============================================================================

import { useState } from 'react';
import { useGame } from '../state/GameProvider';
import {
  warehouseOf,
  shelfFree,
  shelfStock,
  normalShelfCapacity,
  normalShelfUsed,
  siteOfOrder,
  coldChainGap,
  marketShare,
  playerRank,
  marketRanking,
  siteRenown,
  nationalRenown,
  regionalKams,
  fleetSize,
  fleetTransferCapacityPallets,
  transferCost,
} from '../game/simulation';
import { siteManager, siteWeeklyVolume, hireEmployee, transferStock, foundRegionalOffice, buyEquipment } from '../game/actions';
import {
  SITE_META, ROLE_SALARY, HIRE_WEEKS_UPFRONT, BRANCH_UNLOCK_MONTHLY,
  TRANSFER_DAYS, TRANSFER_COST_PER_PALLET, TRANSFER_COST_OWN_PER_PALLET, PALETTE_SIZE,
  KONZERN_C_LEVEL, REGIONAL_OFFICE_ROLES, REGIONAL_KAM_LARGE_SLOTS,
  REGIONAL_OFFICE_FOUND_COST, FLEET_MAX, FLEET_TRANSFER_CAPACITY_PALLETS, getEquipmentDef,
} from '../game/constants';
import type { OfficeRole } from '../game/constants';
import {
  GERMANY_VIEWBOX, GERMANY_PATH, GERMANY_SEAT, GERMANY_CITIES,
  EUROPE_VIEWBOX, EUROPE_PATH, EUROPE_DE, EUROPE_COUNTRIES,
} from './mapPaths';
import type { GameState, ProductId, Role, SiteId } from '../game/types';

const eur = (n: number) => Math.round(n).toLocaleString('de-DE');
const LEITER_UPFRONT = ROLE_SALARY.standortleiter * HIRE_WEEKS_UPFRONT;

type Level = 'stadt' | 'land' | 'kontinent';
const LEVELS: { id: Level; icon: string; label: string }[] = [
  { id: 'stadt', icon: '🏙️', label: 'Städte' },
  { id: 'land', icon: '🇩🇪', label: 'Deutschland' },
  { id: 'kontinent', icon: '🌍', label: 'Europa' },
];

/** Feste Bildschirm-Positionen der Standort-Pins auf der Stadtkarte (viewBox 1000×640).
 * Route und LKW nutzen dieselben Punkte, damit alles deckungsgleich sitzt. Die zwei
 * Städte liegen bewusst weit auseinander (Land dazwischen) — es sind ZWEI Städte, keine
 * Bezirke einer Stadt. */
const PIN_XY: Record<SiteId, { x: number; y: number }> = {
  hq: { x: 300, y: 235 },
  sued: { x: 700, y: 420 },
};

interface Kpis {
  customers: number;
  renown: number;
  pending: number;
  vol: number;
  crew: number;
  tables: number;
  avgSkill: number;
  service: number;
  shelfPct: number;
  alarms: string[];
}

function siteKpis(state: GameState, site: SiteId): Kpis {
  const w = warehouseOf(state, site);
  const regionCust = state.customers.filter((c) => c.active && (c.region ?? 'hq') === site);
  const crew = state.employees.filter((e) => e.role === 'lager' && (e.siteId ?? 'hq') === site);
  const avgSkill = crew.length ? crew.reduce((a, e) => a + e.skill, 0) / crew.length : 0;
  const service = regionCust.length ? regionCust.reduce((a, c) => a + c.serviceRating, 0) / regionCust.length : 0;
  const shelfCap = normalShelfCapacity(state, site);
  const shelfPct = shelfCap > 0 ? (normalShelfUsed(state, site) / shelfCap) * 100 : 0;
  const vol = siteWeeklyVolume(state, site);

  const ordersHere = state.orders.filter((o) => o.status !== 'delivered' && siteOfOrder(state, o) === site);
  const lateHere = ordersHere.filter((o) => o.late).length;
  const alarms: string[] = [];
  if (lateHere > 0) alarms.push(`⏰ ${lateHere} verspätete Aufträge`);
  if (shelfFree(state, site) < Math.max(120, vol * 0.4)) alarms.push('📦 Regalplatz knapp');
  if (site === 'hq' && coldChainGap(state)) alarms.push('❄️ kein Kühlregal');
  if (regionCust.length > 0 && crew.length === 0) alarms.push('👷 keine Lagerkraft');
  return { customers: regionCust.length, renown: siteRenown(state, site), pending: ordersHere.length, vol, crew: crew.length, tables: w.tables.length, avgSkill, service, shelfPct, alarms };
}

/** A KPI figure with a label. */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="km-kpi">
      <div className="km-kpi-val" style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'good' ? 'var(--good)' : undefined }}>{value}</div>
      <div className="km-kpi-lbl">{label}</div>
    </div>
  );
}

/** Ein Stadt-Cluster (Häuserblöcke + Straßen) rund um einen Standort-Pin. Zwei davon
 * bilden die zwei Städte des Landes; das Land dazwischen bleibt frei. */
function CityCluster({ x, y, name, dim }: { x: number; y: number; name: string; dim?: boolean }) {
  const W = 300, H = 210;
  const ox = x - W / 2, oy = y - H / 2;
  const streetsX = [ox + 70, ox + 150, ox + 230];
  const streetsY = [oy + 60, oy + 130];
  const blocks: [number, number][] = [
    [ox + 24, oy + 20], [ox + 104, oy + 22], [ox + 190, oy + 18],
    [ox + 30, oy + 150], [ox + 118, oy + 152], [ox + 206, oy + 148],
  ];
  return (
    <g opacity={dim ? 0.4 : 1}>
      <rect x={ox} y={oy} width={W} height={H} rx={20} fill="var(--bg-panel-2)" stroke="var(--border)" strokeWidth={2} opacity={0.75} />
      {streetsX.map((sx) => <line key={`sx${sx}`} x1={sx} y1={oy + 12} x2={sx} y2={oy + H - 12} stroke="var(--border)" strokeWidth={3} opacity={0.5} />)}
      {streetsY.map((sy) => <line key={`sy${sy}`} x1={ox + 12} y1={sy} x2={ox + W - 12} y2={sy} stroke="var(--border)" strokeWidth={3} opacity={0.5} />)}
      {blocks.map(([bx, by], i) => (
        <rect key={i} x={bx} y={by} width={58} height={44} rx={6} fill="var(--bg-panel)" stroke="var(--border)" opacity={0.8} />
      ))}
      <text x={ox + 8} y={oy - 10} fontSize={20} fill="var(--text-faint)" fontWeight={800} letterSpacing={2}>STADT {name.toUpperCase()}</text>
    </g>
  );
}

/** A live location pin on the city map: ring colour = service, badges for open
 * orders and alarms, so the map communicates operational status at a glance. */
function CityPin({
  x, y, emoji, name, delegated, service, selected, locked, pending = 0, alarms = 0, onClick,
}: {
  x: number; y: number; emoji: string; name: string; delegated: boolean;
  service: number; selected: boolean; locked?: boolean; pending?: number; alarms?: number; onClick: () => void;
}) {
  const ring = locked ? 'var(--text-faint)' : service >= 4 ? 'var(--good)' : service > 0 && service < 3 ? 'var(--bad)' : 'var(--accent)';
  return (
    <g transform={`translate(${x},${y})`} className={`km-pin${locked ? ' locked' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {selected && <circle r={38} fill="none" stroke="var(--accent)" strokeWidth={3} opacity={0.9} />}
      <circle r={30} fill="var(--bg-elev)" stroke={ring} strokeWidth={4} />
      <text y={10} textAnchor="middle" fontSize={30} opacity={locked ? 0.5 : 1}>{locked ? '🔒' : emoji}</text>
      {delegated && !locked && <text x={22} y={-18} textAnchor="middle" fontSize={20}>🧑‍✈️</text>}
      {!locked && pending > 0 && (
        <g transform="translate(-26,-20)">
          <circle r={12} fill="var(--accent)" />
          <text y={4} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={700}>{pending}</text>
        </g>
      )}
      {!locked && alarms > 0 && (
        <g transform="translate(26,20)">
          <circle r={11} fill="var(--bad)" />
          <text y={4} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={700}>!</text>
        </g>
      )}
      <g transform="translate(0,52)">
        <rect x={-58} y={-16} width={116} height={26} rx={8} fill="var(--bg-panel)" stroke="var(--border)" />
        <text y={2} textAnchor="middle" fontSize={15} fill="var(--text)" fontWeight={600}>{name}</text>
      </g>
    </g>
  );
}

/** In-flight goods transfers drawn as trucks moving along the Nord↔Süd route. */
function TransferTrucks({ state }: { state: GameState }) {
  const transfers = state.transfers ?? [];
  if (transfers.length === 0) return null;
  return (
    <>
      {transfers.map((t) => {
        const from = PIN_XY[t.fromSite];
        const to = PIN_XY[t.toSite];
        // progress 0..1 from departure to arrival (arrivalDay = departure + TRANSFER_DAYS)
        const remain = (t.arrivalDay - state.totalDays) / Math.max(1, TRANSFER_DAYS);
        const p = Math.min(1, Math.max(0, 1 - remain));
        const tx = from.x + (to.x - from.x) * p;
        const ty = from.y + (to.y - from.y) * p;
        const flip = to.x < from.x;
        return (
          <g key={t.id} transform={`translate(${tx},${ty})`}>
            <text textAnchor="middle" y={-14} fontSize={22} transform={flip ? 'scale(-1,1)' : undefined}>🚚</text>
            <text textAnchor="middle" y={4} fontSize={12} fill="var(--text-dim)">{t.quantity}×</text>
          </g>
        );
      })}
    </>
  );
}

/** Der eigene Fuhrpark als sichtbares Depot: geparkte LKW (die gerade nicht auf der
 * Route unterwegs sind). So sieht man den Fuhrpark UND die Bewegung auf der Karte. */
function FleetDepot({ x, y, parked, total }: { x: number; y: number; parked: number; total: number }) {
  const rows = Math.min(parked, 4);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-14} y={-30} width={148} height={64} rx={10} fill="var(--bg-panel-2)" stroke="var(--border)" strokeWidth={2} opacity={0.85} />
      <text x={-6} y={-14} fontSize={12} fill="var(--text-dim)" fontWeight={700}>🚚 Fuhrpark {total}</text>
      {Array.from({ length: rows }).map((_, i) => (
        <text key={i} x={-2 + i * 34} y={22} fontSize={24}>🚚</text>
      ))}
      {parked === 0 && total > 0 && <text x={-2} y={20} fontSize={11} fill="var(--text-faint)">alle unterwegs</text>}
    </g>
  );
}

/** Dein aktueller Sitz (Stadt bzw. Land) — grün hervorgehoben. */
function SeatNode({ x, y, emoji, label }: { x: number; y: number; emoji: string; label: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={20} fill="var(--bg-elev)" stroke="var(--good)" strokeWidth={4} />
      <text y={7} textAnchor="middle" fontSize={20}>{emoji}</text>
      <g transform="translate(0,38)">
        <rect x={-72} y={-15} width={144} height={24} rx={7} fill="var(--bg-panel)" stroke="var(--border)" />
        <text y={2} textAnchor="middle" fontSize={13} fill="var(--text)" fontWeight={600}>{label}</text>
      </g>
    </g>
  );
}
/** Ein künftiger, noch gesperrter Standort/Markt. */
function FutureNode({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x},${y})`} opacity={0.6}>
      <circle r={14} fill="var(--bg-panel-2)" stroke="var(--text-faint)" strokeWidth={2.5} strokeDasharray="4 4" />
      <text y={5} textAnchor="middle" fontSize={13}>🔒</text>
      <text y={29} textAnchor="middle" fontSize={11} fill="var(--text-faint)" fontWeight={600}>{label}</text>
    </g>
  );
}

/** Die Konzernzentrale (C-Level) — Platzhalter-Rollen, Mechanik folgt mit dem 2. Land. */
function CLevelPanel({ title, subtitle, intro, roles, onBack }: {
  title: string; subtitle: string; intro: string; roles: OfficeRole[]; onBack: () => void;
}) {
  return (
    <div className="konzern-zentrale">
      <div className="km-zentrale-head">
        <div>
          <div className="km-side-title">🏛️ {title}</div>
          <div className="sub">{subtitle}</div>
        </div>
        <button className="btn ghost" onClick={onBack}>← Zur Karte</button>
      </div>
      <p className="hint">{intro}</p>
      <div className="km-roles">
        {roles.map((r) => (
          <div key={r.title} className="km-role">
            <div className="km-role-emoji">{r.emoji}</div>
            <div className="grow">
              <div className="km-role-title">{r.title}</div>
              <div className="sub">{r.blurb}</div>
            </div>
            <span className="pill">🔒 folgt</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Das Regionalbüro eines Landes: die Führungscrew als Freischalt-Ladder. Jede Rolle
 * nennt ihre Hürde; freigeschaltete Rollen mit Mechanik lassen sich hier einstellen,
 * der Rest ist Vorschau. So wächst man beim „Wiederaufbau" des neuen Standorts Schritt
 * für Schritt in die eigene Regional-Organisation hinein. */
function RegionalOfficePanel({ state, foundedWeek, onHire, onBack }: {
  state: GameState; foundedWeek: number; onHire: (role: Role) => void; onBack: () => void;
}) {
  const largeUsed = regionalKams(state).reduce((s, k) => s + k.used, 0);
  return (
    <div className="konzern-zentrale">
      <div className="km-zentrale-head">
        <div>
          <div className="km-side-title">🏢 Regionalbüro Deutschland</div>
          <div className="sub">Automatisch mit dem 2. Standort entstanden (Woche {foundedWeek}) · führt alle Standorte in Deutschland</div>
        </div>
        <button className="btn ghost" onClick={onBack}>← Zur Karte</button>
      </div>
      <p className="hint">
        Die Crew schaltet <b>gestaffelt</b> frei – jede Rolle dann, wenn du den Engpass, den sie löst, gerade spürst.
        So baust du den neuen Standort Schritt für Schritt zur eigenständigen Region aus, statt alles auf einmal zu bekommen.
      </p>
      <div className="km-roles">
        {REGIONAL_OFFICE_ROLES.map((r) => {
          const unlocked = r.unlocked(state);
          const progress = r.progress?.(state);
          if (r.role) {
            const count = state.employees.filter((e) => e.role === r.role).length;
            const cost = ROLE_SALARY[r.role] * HIRE_WEEKS_UPFRONT;
            const canAfford = state.cash >= cost;
            return (
              <div key={r.title} className={`km-role${unlocked ? '' : ' locked'}`}>
                <div className="km-role-emoji">{r.emoji}</div>
                <div className="grow">
                  <div className="km-role-title">
                    {r.title}
                    {count > 0 && <span className="pill good" style={{ marginLeft: 6 }}>{count}× angestellt</span>}
                  </div>
                  <div className="sub">{r.blurb}</div>
                  {r.role === 'regionalkam' && count > 0 && (
                    <div className="sub">Großkunden betreut: {largeUsed}/{count * REGIONAL_KAM_LARGE_SLOTS}</div>
                  )}
                  {!unlocked && <div className="sub" style={{ opacity: 0.85 }}>🔒 {r.hurdle}{progress ? ` (${progress})` : ''}</div>}
                </div>
                {unlocked ? (
                  <button className="btn primary small" disabled={!canAfford} onClick={() => onHire(r.role!)}
                    title={!canAfford ? `Kostet ${eur(cost)}€ Vorkasse` : `4 Wochen im Voraus: ${eur(cost)}€`}>
                    Einstellen · {eur(ROLE_SALARY[r.role])}€/Wo.
                  </button>
                ) : (
                  <span className="pill" title={r.hurdle}>🔒 {progress ?? 'gesperrt'}</span>
                )}
              </div>
            );
          }
          // Vorschau-Rolle (Mechanik folgt) — zeigt trotzdem ihre geplante Hürde.
          return (
            <div key={r.title} className="km-role">
              <div className="km-role-emoji">{r.emoji}</div>
              <div className="grow">
                <div className="km-role-title">{r.title}</div>
                <div className="sub">{r.blurb}</div>
                <div className="sub" style={{ opacity: 0.85 }}>Hürde: {r.hurdle}</div>
              </div>
              <span className="pill" title={r.hurdle}>{unlocked ? '✅ bereit · folgt' : progress ? `🔒 ${progress}` : '🔒 folgt'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KonzernMap({ onClose, onEnterSite }: { onClose: () => void; onEnterSite: (site: SiteId) => void }) {
  const { state, mutate } = useGame();
  const branchOpen = !!state.branchWarehouse;
  const [level, setLevel] = useState<Level>('stadt');
  const [selected, setSelected] = useState<SiteId | null>('hq');
  // Transfer-Formular (Waren zwischen den Standorten verschieben)
  const [txFrom, setTxFrom] = useState<SiteId>('hq');
  const [txProduct, setTxProduct] = useState<ProductId | ''>('');
  const [txQty, setTxQty] = useState(50);
  // Welches Büro ist geöffnet? Konzernzentrale (global, C-Level) oder ein Regionalbüro.
  const [office, setOffice] = useState<null | 'konzern' | 'regional-de'>(null);

  // Das Regionalbüro ist der bezahlte zweite Schritt nach dem 2. Standort: erst kaufst
  // du den Standort, dann gründest du das Büro. „Offen" = gegründet (state.konzern).
  const konzern = state.konzern;
  const regionalOpen = !!konzern;
  const foundedWeek = konzern?.foundedWeek ?? 0;
  const foundRegionalNow = () => mutate((s) => foundRegionalOffice(s));
  // Länder, in denen der Konzern tätig ist. Aktuell nur Deutschland — die
  // Konzernzentrale (C-Level) schaltet erst mit dem ZWEITEN Land frei.
  const countries = 1;
  const zentraleUnlocked = countries >= 2;

  const share = marketShare(state);
  const rank = playerRank(state);
  const totalRanks = marketRanking(state).length;

  const hireLeiter = (site: SiteId) => mutate((s) => hireEmployee(s, 'standortleiter', site));
  const hireRegional = (role: Role) => mutate((s) => hireEmployee(s, role));
  const enter = (site: SiteId) => { onEnterSite(site); onClose(); };

  const sel = selected && (selected === 'hq' || branchOpen) ? selected : null;

  // Transfer-Ableitungen
  const txTo: SiteId = txFrom === 'hq' ? 'sued' : 'hq';
  const txProducts = branchOpen ? state.products.filter((p) => shelfStock(p, txFrom) > 0) : [];
  const txStock = txProduct ? shelfStock(state.products.find((p) => p.id === txProduct)!, txFrom) : 0;
  const txPallets = Math.ceil(Math.max(0, txQty) / PALETTE_SIZE);
  const txCost = transferCost(state, txPallets);
  const doTransfer = () => { if (txProduct) mutate((s) => transferStock(s, txProduct, txQty, txFrom, txTo)); };

  // Fuhrpark (eigener LKW-Bestand): sichtbare, günstige Transfer-Kapazität.
  const fleet = fleetSize(state);
  const fleetCapPal = fleetTransferCapacityPallets(state);
  const truckDef = getEquipmentDef('truck');
  const nextTruckPrice = truckDef.price(fleet + 1);
  const buyTruck = () => mutate((s) => buyEquipment(s, 'truck'));
  const txOwnPal = Math.min(txPallets, fleetCapPal);

  return (
    <div className="konzern-screen">
      <header className="konzern-header">
        <button className="btn ghost" onClick={onClose}>← Zurück zum Lager</button>
        <div className="konzern-crumbs">
          {LEVELS.map((l) => (
            <button key={l.id} className={`konzern-crumb${level === l.id ? ' active' : ''}`} onClick={() => setLevel(l.id)}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
        <div className="konzern-cash">
          {regionalOpen && (
            <button className={`konzern-crumb${office === 'regional-de' ? ' active' : ''}`} onClick={() => setOffice((o) => (o === 'regional-de' ? null : 'regional-de'))}>
              🏢 Regionalbüro
            </button>
          )}
          <span className="pill">📣 Ruf {nationalRenown(state).toFixed(0)}</span>
          {branchOpen && <span className="pill">🚚 Fuhrpark {fleet}</span>}
          <span className="pill">Marktanteil {(share * 100).toFixed(1)}% · Platz {rank}/{totalRanks}</span>
          <span className="km-money">💶 {eur(state.cash)}</span>
        </div>
      </header>

      {branchOpen && !regionalOpen && (
        <div className="konzern-banner">
          <span>🏢 <b>Zwei Standorte!</b> Gründe jetzt dein <b>Regionalbüro Deutschland</b> – deine Landes-Führung mit Marketing-Manager, Regional-KAM & Co. (schalten danach gestaffelt frei).</span>
          <button className="btn primary" disabled={state.cash < REGIONAL_OFFICE_FOUND_COST} onClick={foundRegionalNow}
            title={state.cash < REGIONAL_OFFICE_FOUND_COST ? `Kostet ${eur(REGIONAL_OFFICE_FOUND_COST)}€` : undefined}>
            Regionalbüro gründen ({eur(REGIONAL_OFFICE_FOUND_COST)}€)
          </button>
        </div>
      )}
      {regionalOpen && (
        <div className="konzern-banner">
          <span>🏢 <b>Regionalbüro Deutschland</b> ist gegründet. Seine Mitarbeiter (Marketing-Manager, Regional-KAM …) schalten über eigene Hürden frei.</span>
          <button className="btn primary" onClick={() => { setOffice('regional-de'); }}>Regionalbüro öffnen</button>
        </div>
      )}

      <div className="konzern-body">
        {office === 'konzern' && zentraleUnlocked ? (
          <CLevelPanel
            title="Konzernzentrale"
            subtitle="Steuert den Konzern über alle Länder"
            intro="Die C-Level-Führung über allen Ländern. Diese Vorstands­rollen werden in einem kommenden Update mit Leben gefüllt – hier besetzt du sie dann."
            roles={KONZERN_C_LEVEL}
            onBack={() => setOffice(null)}
          />
        ) : office === 'regional-de' && regionalOpen ? (
          <RegionalOfficePanel
            state={state}
            foundedWeek={foundedWeek}
            onHire={hireRegional}
            onBack={() => setOffice(null)}
          />
        ) : (
        <>
        <div className="konzern-map">
          {level === 'stadt' && (
            <svg viewBox="0 0 1000 640" className="km-svg" preserveAspectRatio="xMidYMid meet">
              {/* Land / Umland */}
              <rect x={20} y={20} width={960} height={600} rx={24} fill="var(--bg-panel)" stroke="var(--border)" strokeWidth={2} />
              {/* Fluss, der durchs Land mäandert */}
              <path d="M90,70 C300,190 250,360 500,410 C720,455 780,560 910,600" fill="none" stroke="var(--accent)" strokeWidth={14} opacity={0.18} strokeLinecap="round" />

              {/* Verbindungs-Autobahn zwischen den zwei Städten (erst mit offenem Süd) */}
              {branchOpen && (
                <>
                  <line x1={PIN_XY.hq.x} y1={PIN_XY.hq.y} x2={PIN_XY.sued.x} y2={PIN_XY.sued.y}
                    stroke="var(--border)" strokeWidth={9} opacity={0.7} strokeLinecap="round" />
                  <line x1={PIN_XY.hq.x} y1={PIN_XY.hq.y} x2={PIN_XY.sued.x} y2={PIN_XY.sued.y}
                    stroke="var(--accent)" strokeWidth={3} strokeDasharray="12 10" opacity={0.7} />
                </>
              )}

              {/* Zwei Städte */}
              <CityCluster x={PIN_XY.hq.x} y={PIN_XY.hq.y} name={SITE_META.hq.short} />
              <CityCluster x={PIN_XY.sued.x} y={PIN_XY.sued.y} name={SITE_META.sued.short} dim={!branchOpen} />

              {/* Standort Nord (immer) */}
              {(() => {
                const k = siteKpis(state, 'hq');
                return (
                  <CityPin x={PIN_XY.hq.x} y={PIN_XY.hq.y} emoji={SITE_META.hq.emoji} name={SITE_META.hq.name}
                    delegated={!!siteManager(state, 'hq')} service={k.service} pending={k.pending} alarms={k.alarms.length}
                    selected={sel === 'hq'} onClick={() => setSelected('hq')} />
                );
              })()}
              {/* Standort Süd (offen → echt, sonst gesperrt) */}
              {branchOpen ? (() => {
                const k = siteKpis(state, 'sued');
                return (
                  <CityPin x={PIN_XY.sued.x} y={PIN_XY.sued.y} emoji={SITE_META.sued.emoji} name={SITE_META.sued.name}
                    delegated={!!siteManager(state, 'sued')} service={k.service} pending={k.pending} alarms={k.alarms.length}
                    selected={sel === 'sued'} onClick={() => setSelected('sued')} />
                );
              })() : (
                <CityPin x={PIN_XY.sued.x} y={PIN_XY.sued.y} emoji={SITE_META.sued.emoji} name="Standort Süd" delegated={false} service={0} selected={false} locked onClick={() => setSelected(null)} />
              )}

              {/* Laufende Transfers als fahrende LKW */}
              {branchOpen && <TransferTrucks state={state} />}
              {/* Eigener Fuhrpark: geparkte LKW im Depot (sichtbare Kapazität) */}
              {branchOpen && fleet > 0 && (
                <FleetDepot x={110} y={545} total={fleet} parked={Math.max(0, fleet - (state.transfers?.length ?? 0))} />
              )}
            </svg>
          )}

          {level === 'land' && (
            <svg viewBox={GERMANY_VIEWBOX} className="km-svg" preserveAspectRatio="xMidYMid meet">
              <path d={GERMANY_PATH} fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth={1.5} opacity={0.95} strokeLinejoin="round" />
              {GERMANY_CITIES.map((c) => <FutureNode key={c.name} x={c.x} y={c.y} label={c.name} />)}
              <SeatNode x={GERMANY_SEAT[0]} y={GERMANY_SEAT[1]} emoji="🏙️" label="Deine Städte" />
            </svg>
          )}

          {level === 'kontinent' && (
            <svg viewBox={EUROPE_VIEWBOX} className="km-svg" preserveAspectRatio="xMidYMid meet">
              <path d={EUROPE_PATH} fill="var(--bg-panel)" stroke="var(--border)" strokeWidth={1.5} opacity={0.92} strokeLinejoin="round" />
              {EUROPE_COUNTRIES.map((c) => <FutureNode key={c.name} x={c.x} y={c.y} label={c.name} />)}
              <SeatNode x={EUROPE_DE[0]} y={EUROPE_DE[1]} emoji="🇩🇪" label="Deutschland" />
            </svg>
          )}
        </div>

        <aside className="konzern-side">
          {level === 'stadt' ? (
            <>
            {sel ? (() => {
              const meta = SITE_META[sel];
              const k = siteKpis(state, sel);
              const leiter = siteManager(state, sel);
              return (
                <>
                  <div className="km-side-head">
                    <span style={{ fontSize: 30 }}>{meta.emoji}</span>
                    <div>
                      <div className="km-side-title">{meta.name}</div>
                      {leiter
                        ? <span className="pill good">🧑‍✈️ automatisch geführt</span>
                        : <span className="pill">Hands-on</span>}
                    </div>
                  </div>
                  <p className="sub" style={{ margin: '0 0 12px' }}>
                    {leiter ? `${leiter.name} führt den Standort – stellt ein, baut aus, trainiert.` : 'Du führst diesen Standort selbst.'}
                  </p>
                  <div className="km-kpis">
                    <Kpi label="Kunden" value={String(k.customers)} />
                    <Kpi label="📣 Ruf" value={k.renown.toFixed(0)} tone={k.renown >= 60 ? 'good' : undefined} />
                    <Kpi label="Volumen/Wo." value={eur(k.vol)} />
                    <Kpi label="Lager" value={String(k.crew)} />
                    <Kpi label="Packtische" value={String(k.tables)} />
                    <Kpi label="Ø-Skill" value={k.crew ? k.avgSkill.toFixed(0) : '–'} />
                    <Kpi label="Service" value={k.service > 0 ? `${k.service.toFixed(1)}★` : '–'} tone={k.service > 0 && k.service < 3 ? 'bad' : k.service >= 4 ? 'good' : undefined} />
                    <Kpi label="Regal belegt" value={`${k.shelfPct.toFixed(0)}%`} tone={k.shelfPct > 90 ? 'bad' : undefined} />
                  </div>
                  {k.alarms.length > 0 && (
                    <div className="km-alarms">{k.alarms.map((a) => <span key={a} className="pill bad">{a}</span>)}</div>
                  )}
                  <div className="km-actions">
                    <button className="btn primary" onClick={() => enter(sel)}>Standort betreten →</button>
                    {!leiter && (
                      <button className="btn" onClick={() => hireLeiter(sel)} disabled={state.cash < LEITER_UPFRONT}
                        title={state.cash < LEITER_UPFRONT ? `Kostet ${eur(LEITER_UPFRONT)}€ Vorkasse` : undefined}>
                        🧑‍✈️ Standortleiter ({eur(ROLE_SALARY.standortleiter)}€/Wo.)
                      </button>
                    )}
                  </div>
                </>
              );
            })() : (
              <div className="km-hint">
                <p><b>Zweite Stadt (Süd) noch nicht eröffnet.</b></p>
                <p className="sub">Ab {Math.round(BRANCH_UNLOCK_MONTHLY / 1000)}k € Monatsumsatz eröffnest du sie über <b>🏢 Ausbau</b> – dann erscheint sie hier auf der Karte, und du kannst dafür ein <b>Regionalbüro gründen</b>.</p>
                <button className="btn" onClick={() => setSelected('hq')}>Stadt Nord ansehen</button>
              </div>
            )}
            {branchOpen && (
              <div className="km-transfer">
                <h4>🚚 Waren transferieren</h4>
                <div className="km-tx-dir">
                  <span className="pill">{SITE_META[txFrom].emoji} {SITE_META[txFrom].short}</span>
                  <button className="btn small ghost" title="Richtung umkehren" onClick={() => { setTxFrom(txTo); setTxProduct(''); }}>⇄</button>
                  <span className="pill">{SITE_META[txTo].emoji} {SITE_META[txTo].short}</span>
                </div>
                <select className="km-input" value={txProduct} onChange={(e) => setTxProduct(e.target.value as ProductId)}>
                  <option value="">Produkt wählen…</option>
                  {txProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.emoji} {p.name} – {shelfStock(p, txFrom)}× im Regal</option>
                  ))}
                </select>
                {txProducts.length === 0 && <p className="sub">Kein Regalbestand in {SITE_META[txFrom].short} zum Verschieben.</p>}
                <div className="km-tx-row">
                  <input className="km-input" type="number" min={1} value={txQty}
                    onChange={(e) => setTxQty(Math.max(1, Math.floor(+e.target.value) || 0))} />
                  <span className="sub">{txPallets} Pal. · {eur(txCost)}€</span>
                </div>
                {txPallets > 0 && (
                  <p className="sub" style={{ margin: '-2px 0 2px' }}>
                    {txOwnPal >= txPallets
                      ? `🚚 komplett per eigenem Fuhrpark (${TRANSFER_COST_OWN_PER_PALLET}€/Pal.)`
                      : txOwnPal > 0
                        ? `🚚 ${txOwnPal} Pal. eigener Fuhrpark, ${txPallets - txOwnPal} Pal. Fremd-Spedition (${TRANSFER_COST_PER_PALLET}€/Pal.)`
                        : `Fremd-Spedition (${TRANSFER_COST_PER_PALLET}€/Pal.) – ein eigener LKW spart hier`}
                  </p>
                )}
                <button className="btn primary" disabled={!txProduct || txQty < 1 || txQty > txStock || state.cash < txCost}
                  onClick={doTransfer}
                  title={txProduct && txQty > txStock ? `Nur ${txStock}× verfügbar` : undefined}>
                  Senden ({SITE_META[txFrom].short} → {SITE_META[txTo].short})
                </button>

                {/* Eigener Fuhrpark: sichtbare, günstige Transfer-Kapazität */}
                <div className="km-fleet">
                  <div className="km-fleet-head">
                    <span>🚚 <b>Fuhrpark</b></span>
                    <span className="pill">{fleet}/{FLEET_MAX} LKW</span>
                  </div>
                  <p className="sub" style={{ margin: '2px 0 6px' }}>
                    {fleet > 0
                      ? `Kapazität: ${fleetCapPal} Pal./Fahrt zum Eigen-Tarif (${TRANSFER_COST_OWN_PER_PALLET}€ statt ${TRANSFER_COST_PER_PALLET}€), darüber Fremd-Spedition. Senkt auch die Abholkosten.`
                      : `Noch kein eigener LKW – Transfers laufen zum teuren Fremd-Tarif (${TRANSFER_COST_PER_PALLET}€/Pal.). Ein LKW bringt ${FLEET_TRANSFER_CAPACITY_PALLETS} Pal./Fahrt günstig.`}
                  </p>
                  {fleet < FLEET_MAX ? (
                    <button className="btn" disabled={state.cash < nextTruckPrice} onClick={buyTruck}
                      title={state.cash < nextTruckPrice ? `Kostet ${eur(nextTruckPrice)}€` : undefined}>
                      LKW kaufen ({eur(nextTruckPrice)}€) → {fleet + 1}. LKW
                    </button>
                  ) : (
                    <span className="pill good">Fuhrpark voll ausgebaut</span>
                  )}
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="km-hint">
              <p><b>{level === 'land' ? '🇩🇪 Landesansicht' : '🌍 Kontinentansicht'}</b></p>
              <p className="sub">
                {level === 'land'
                  ? 'Später expandierst du in weitere Städte in ganz Deutschland – jede mit eigenem Kundenstamm und eigener Konkurrenz. Die gesperrten Marker zeigen künftige Standorte.'
                  : 'Und schließlich lieferst du in ganz Europa – Land für Land, jedes mit eigenem Markt. Der Konzern wächst über die Landesgrenzen hinaus.'}
              </p>
              {regionalOpen && level === 'land' && (
                <button className="btn primary" onClick={() => setOffice('regional-de')}>🏢 Regionalbüro Deutschland</button>
              )}
              {level === 'kontinent' && (
                zentraleUnlocked
                  ? <button className="btn primary" onClick={() => setOffice('konzern')}>🏛️ Konzernzentrale</button>
                  : <button className="btn" disabled title="Schaltet mit dem zweiten Land frei">🔒 Konzernzentrale – ab dem 2. Land</button>
              )}
              {!regionalOpen && (
                <p className="sub"><i>{branchOpen
                  ? `Gründe für dein Land ein Regionalbüro (${eur(REGIONAL_OFFICE_FOUND_COST)}€) – oben im Banner. Die Konzernzentrale (C-Level) folgt mit dem zweiten Land.`
                  : 'Nach dem zweiten Standort gründest du für dein Land ein Regionalbüro. Die Konzernzentrale (C-Level) folgt mit dem zweiten Land.'}</i></p>
              )}
              <p className="sub" style={{ marginTop: 10 }}><i>Diese Ausbaustufe folgt – dein Sitz ist bereits markiert.</i></p>
            </div>
          )}
        </aside>
        </>
        )}
      </div>
    </div>
  );
}
