// ============================================================================
// Konzern-Karte — die Vogelperspektive als eigener Vollbild-Screen. Die Interaktions-
// höhe steigt mit dem Wachstum: du zoomst von der STADT (deine Standorte Nord & Süd)
// hinaus auf DEUTSCHLAND (Städte) und EUROPA (Länder). Aus dem Lagersimulator wird
// ein Konzern. Ein Klick auf einen Standort führt zurück ins echte Lager.
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
} from '../game/simulation';
import { siteManager, siteWeeklyVolume, hireEmployee, transferStock, foundKonzern } from '../game/actions';
import {
  SITE_META, ROLE_SALARY, HIRE_WEEKS_UPFRONT, BRANCH_UNLOCK_MONTHLY,
  TRANSFER_DAYS, TRANSFER_COST_PER_PALLET, PALETTE_SIZE,
  KONZERN_FOUND_COST, KONZERN_C_LEVEL, REGIONAL_OFFICE_ROLES,
} from '../game/constants';
import type { OfficeRole } from '../game/constants';
import {
  GERMANY_VIEWBOX, GERMANY_PATH, GERMANY_SEAT, GERMANY_CITIES,
  EUROPE_VIEWBOX, EUROPE_PATH, EUROPE_DE, EUROPE_COUNTRIES,
} from './mapPaths';
import type { GameState, ProductId, SiteId } from '../game/types';

const eur = (n: number) => Math.round(n).toLocaleString('de-DE');
const LEITER_UPFRONT = ROLE_SALARY.standortleiter * HIRE_WEEKS_UPFRONT;

type Level = 'stadt' | 'land' | 'kontinent';
const LEVELS: { id: Level; icon: string; label: string }[] = [
  { id: 'stadt', icon: '🏙️', label: 'Stadt' },
  { id: 'land', icon: '🇩🇪', label: 'Deutschland' },
  { id: 'kontinent', icon: '🌍', label: 'Europa' },
];

/** Feste Bildschirm-Positionen der Standort-Pins auf der Stadtkarte (viewBox 1000×640).
 * Route und LKW nutzen dieselben Punkte, damit alles deckungsgleich sitzt. */
const PIN_XY: Record<SiteId, { x: number; y: number }> = {
  hq: { x: 300, y: 230 },
  sued: { x: 690, y: 410 },
};

interface Kpis {
  customers: number;
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
  return { customers: regionCust.length, pending: ordersHere.length, vol, crew: crew.length, tables: w.tables.length, avgSkill, service, shelfPct, alarms };
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

/** Ein Büro mit seinen Führungsrollen — genutzt für die Konzernzentrale (C-Level)
 * und für das Regionalbüro je Land. Rollen sind Platzhalter (Mechanik folgt). */
function OfficePanel({ icon, title, subtitle, intro, roles, onBack }: {
  icon: string; title: string; subtitle: string; intro: string; roles: OfficeRole[]; onBack: () => void;
}) {
  return (
    <div className="konzern-zentrale">
      <div className="km-zentrale-head">
        <div>
          <div className="km-side-title">{icon} {title}</div>
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

  const konzern = state.konzern;
  const foundKonzernNow = () => mutate((s) => foundKonzern(s));

  const share = marketShare(state);
  const rank = playerRank(state);
  const totalRanks = marketRanking(state).length;

  const hireLeiter = (site: SiteId) => mutate((s) => hireEmployee(s, 'standortleiter', site));
  const enter = (site: SiteId) => { onEnterSite(site); onClose(); };

  const sel = selected && (selected === 'hq' || branchOpen) ? selected : null;

  // Transfer-Ableitungen
  const txTo: SiteId = txFrom === 'hq' ? 'sued' : 'hq';
  const txProducts = branchOpen ? state.products.filter((p) => shelfStock(p, txFrom) > 0) : [];
  const txStock = txProduct ? shelfStock(state.products.find((p) => p.id === txProduct)!, txFrom) : 0;
  const txCost = Math.ceil(Math.max(0, txQty) / PALETTE_SIZE) * TRANSFER_COST_PER_PALLET;
  const doTransfer = () => { if (txProduct) mutate((s) => transferStock(s, txProduct, txQty, txFrom, txTo)); };

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
          {konzern && (
            <button className={`konzern-crumb${office === 'konzern' ? ' active' : ''}`} onClick={() => setOffice((o) => (o === 'konzern' ? null : 'konzern'))}>
              🏛️ Konzernzentrale
            </button>
          )}
          <span className="pill">Marktanteil {(share * 100).toFixed(1)}% · Platz {rank}/{totalRanks}</span>
          <span className="km-money">💶 {eur(state.cash)}</span>
        </div>
      </header>

      {branchOpen && !konzern && (
        <div className="konzern-banner">
          <span>🏛️ <b>Zwei Standorte!</b> Mach aus deinen Betrieben eine Unternehmensgruppe mit eigener Zentrale.</span>
          <button className="btn primary" disabled={state.cash < KONZERN_FOUND_COST} onClick={foundKonzernNow}
            title={state.cash < KONZERN_FOUND_COST ? `Kostet ${eur(KONZERN_FOUND_COST)}€` : undefined}>
            Konzern gründen ({eur(KONZERN_FOUND_COST)}€)
          </button>
        </div>
      )}

      <div className="konzern-body">
        {office === 'konzern' && konzern ? (
          <OfficePanel
            icon="🏛️"
            title={`Konzernzentrale · ${konzern.name}`}
            subtitle={`Gegründet in Woche ${konzern.foundedWeek} · steuert den ganzen Konzern`}
            intro="Die C-Level-Führung des Konzerns. Diese Vorstands­rollen werden in einem kommenden Update mit Leben gefüllt – hier besetzt du sie dann."
            roles={KONZERN_C_LEVEL}
            onBack={() => setOffice(null)}
          />
        ) : office === 'regional-de' && konzern ? (
          <OfficePanel
            icon="🏢"
            title="Regionalbüro Deutschland"
            subtitle="Führt alle Standorte in Deutschland"
            intro="Jedes Land bekommt ein eigenes Regionalbüro mit diesen Führungskräften. Sie steuern die Standorte des Landes – ihre Mechanik folgt in einem kommenden Update."
            roles={REGIONAL_OFFICE_ROLES}
            onBack={() => setOffice(null)}
          />
        ) : (
        <>
        <div className="konzern-map">
          {level === 'stadt' && (
            <svg viewBox="0 0 1000 640" className="km-svg" preserveAspectRatio="xMidYMid meet">
              {/* Stadtgebiet */}
              <rect x={40} y={40} width={920} height={560} rx={24} fill="var(--bg-panel)" stroke="var(--border)" strokeWidth={2} />
              {/* Fluss */}
              <path d="M120,60 C300,180 260,360 520,420 C720,470 780,560 900,600" fill="none" stroke="var(--accent)" strokeWidth={14} opacity={0.25} strokeLinecap="round" />
              {/* Straßen */}
              {[160, 340, 520, 700].map((y) => <line key={`h${y}`} x1={70} y1={y} x2={930} y2={y} stroke="var(--border)" strokeWidth={3} opacity={0.5} />)}
              {[220, 430, 640, 830].map((x) => <line key={`v${x}`} x1={x} y1={70} x2={x} y2={570} stroke="var(--border)" strokeWidth={3} opacity={0.5} />)}
              {/* Häuserblöcke */}
              {[[110,110],[300,120],[560,130],[770,110],[130,470],[330,500],[560,500],[820,480],[820,250]].map(([bx, by], i) => (
                <rect key={i} x={bx} y={by} width={70} height={54} rx={6} fill="var(--bg-panel-2)" stroke="var(--border)" opacity={0.7} />
              ))}
              {/* Bezirks-Labels */}
              <text x={250} y={95} fontSize={22} fill="var(--text-faint)" fontWeight={700}>NORD</text>
              <text x={650} y={560} fontSize={22} fill="var(--text-faint)" fontWeight={700}>SÜD</text>

              {/* Transfer-Route Nord↔Süd (erst mit offenem Standort Süd) */}
              {branchOpen && (
                <line x1={PIN_XY.hq.x} y1={PIN_XY.hq.y} x2={PIN_XY.sued.x} y2={PIN_XY.sued.y}
                  stroke="var(--accent)" strokeWidth={3} strokeDasharray="10 8" opacity={0.45} />
              )}

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
            </svg>
          )}

          {level === 'land' && (
            <svg viewBox={GERMANY_VIEWBOX} className="km-svg" preserveAspectRatio="xMidYMid meet">
              <path d={GERMANY_PATH} fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth={1.5} opacity={0.95} strokeLinejoin="round" />
              {GERMANY_CITIES.map((c) => <FutureNode key={c.name} x={c.x} y={c.y} label={c.name} />)}
              <SeatNode x={GERMANY_SEAT[0]} y={GERMANY_SEAT[1]} emoji="🏙️" label="Deine Stadt" />
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
                <p><b>Standort Süd noch nicht eröffnet.</b></p>
                <p className="sub">Ab {Math.round(BRANCH_UNLOCK_MONTHLY / 1000)}k € Monatsumsatz kannst du ihn über <b>🏢 Ausbau</b> eröffnen – dann erscheint er hier auf der Karte.</p>
                <button className="btn" onClick={() => setSelected('hq')}>Hauptlager Nord ansehen</button>
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
                  <span className="sub">{Math.ceil(Math.max(0, txQty) / PALETTE_SIZE)} Paletten · {eur(txCost)}€</span>
                </div>
                <button className="btn primary" disabled={!txProduct || txQty < 1 || txQty > txStock || state.cash < txCost}
                  onClick={doTransfer}
                  title={txProduct && txQty > txStock ? `Nur ${txStock}× verfügbar` : undefined}>
                  Senden ({SITE_META[txFrom].short} → {SITE_META[txTo].short})
                </button>
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
              {konzern && level === 'land' && (
                <button className="btn primary" onClick={() => setOffice('regional-de')}>🏢 Regionalbüro Deutschland</button>
              )}
              {konzern && level === 'kontinent' && (
                <button className="btn primary" onClick={() => setOffice('konzern')}>🏛️ Konzernzentrale</button>
              )}
              {!konzern && (
                <p className="sub"><i>Ab zwei Standorten gründest du deinen Konzern – dann bekommt jedes Land ein Regionalbüro und der Konzern eine Zentrale.</i></p>
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
