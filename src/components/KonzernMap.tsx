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
  normalShelfCapacity,
  normalShelfUsed,
  siteOfOrder,
  coldChainGap,
  marketShare,
  playerRank,
  marketRanking,
} from '../game/simulation';
import { siteManager, siteWeeklyVolume, hireEmployee } from '../game/actions';
import { SITE_META, ROLE_SALARY, HIRE_WEEKS_UPFRONT, BRANCH_UNLOCK_MONTHLY } from '../game/constants';
import type { GameState, SiteId } from '../game/types';

const eur = (n: number) => Math.round(n).toLocaleString('de-DE');
const LEITER_UPFRONT = ROLE_SALARY.standortleiter * HIRE_WEEKS_UPFRONT;

type Level = 'stadt' | 'land' | 'kontinent';
const LEVELS: { id: Level; icon: string; label: string }[] = [
  { id: 'stadt', icon: '🏙️', label: 'Stadt' },
  { id: 'land', icon: '🇩🇪', label: 'Deutschland' },
  { id: 'kontinent', icon: '🌍', label: 'Europa' },
];

interface Kpis {
  customers: number;
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

  const lateHere = state.orders.filter((o) => o.status !== 'delivered' && o.late && siteOfOrder(state, o) === site).length;
  const alarms: string[] = [];
  if (lateHere > 0) alarms.push(`⏰ ${lateHere} verspätete Aufträge`);
  if (shelfFree(state, site) < Math.max(120, vol * 0.4)) alarms.push('📦 Regalplatz knapp');
  if (site === 'hq' && coldChainGap(state)) alarms.push('❄️ kein Kühlregal');
  if (regionCust.length > 0 && crew.length === 0) alarms.push('👷 keine Lagerkraft');
  return { customers: regionCust.length, vol, crew: crew.length, tables: w.tables.length, avgSkill, service, shelfPct, alarms };
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

/** A location pin on the city map. */
function CityPin({
  x, y, emoji, name, delegated, service, selected, locked, onClick,
}: {
  x: number; y: number; emoji: string; name: string; delegated: boolean;
  service: number; selected: boolean; locked?: boolean; onClick: () => void;
}) {
  const ring = locked ? 'var(--text-faint)' : service >= 4 ? 'var(--good)' : service > 0 && service < 3 ? 'var(--bad)' : 'var(--accent)';
  return (
    <g transform={`translate(${x},${y})`} className={`km-pin${locked ? ' locked' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {selected && <circle r={38} fill="none" stroke="var(--accent)" strokeWidth={3} opacity={0.9} />}
      <circle r={30} fill="var(--bg-elev)" stroke={ring} strokeWidth={4} />
      <text y={10} textAnchor="middle" fontSize={30} opacity={locked ? 0.5 : 1}>{locked ? '🔒' : emoji}</text>
      {delegated && !locked && <text x={22} y={-18} textAnchor="middle" fontSize={20}>🧑‍✈️</text>}
      <g transform="translate(0,52)">
        <rect x={-58} y={-16} width={116} height={26} rx={8} fill="var(--bg-panel)" stroke="var(--border)" />
        <text y={2} textAnchor="middle" fontSize={15} fill="var(--text)" fontWeight={600}>{name}</text>
      </g>
    </g>
  );
}

export function KonzernMap({ onClose, onEnterSite }: { onClose: () => void; onEnterSite: (site: SiteId) => void }) {
  const { state, mutate } = useGame();
  const branchOpen = !!state.branchWarehouse;
  const [level, setLevel] = useState<Level>('stadt');
  const [selected, setSelected] = useState<SiteId | null>('hq');

  const share = marketShare(state);
  const rank = playerRank(state);
  const totalRanks = marketRanking(state).length;

  const hireLeiter = (site: SiteId) => mutate((s) => hireEmployee(s, 'standortleiter', site));
  const enter = (site: SiteId) => { onEnterSite(site); onClose(); };

  const sel = selected && (selected === 'hq' || branchOpen) ? selected : null;

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
          <span className="pill">Marktanteil {(share * 100).toFixed(1)}% · Platz {rank}/{totalRanks}</span>
          <span className="km-money">💶 {eur(state.cash)}</span>
        </div>
      </header>

      <div className="konzern-body">
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

              {/* Standort Nord (immer) */}
              {(() => {
                const k = siteKpis(state, 'hq');
                return (
                  <CityPin x={300} y={230} emoji={SITE_META.hq.emoji} name={SITE_META.hq.name}
                    delegated={!!siteManager(state, 'hq')} service={k.service} selected={sel === 'hq'} onClick={() => setSelected('hq')} />
                );
              })()}
              {/* Standort Süd (offen → echt, sonst gesperrt) */}
              {branchOpen ? (() => {
                const k = siteKpis(state, 'sued');
                return (
                  <CityPin x={690} y={410} emoji={SITE_META.sued.emoji} name={SITE_META.sued.name}
                    delegated={!!siteManager(state, 'sued')} service={k.service} selected={sel === 'sued'} onClick={() => setSelected('sued')} />
                );
              })() : (
                <CityPin x={690} y={410} emoji={SITE_META.sued.emoji} name="Standort Süd" delegated={false} service={0} selected={false} locked onClick={() => setSelected(null)} />
              )}
            </svg>
          )}

          {level === 'land' && (
            <svg viewBox="0 0 700 640" className="km-svg" preserveAspectRatio="xMidYMid meet">
              <path d="M330,50 L390,70 L375,130 L430,150 L410,215 L470,250 L440,320 L480,400 L420,440 L430,510 L360,575 L330,540 L300,580 L250,545 L275,470 L215,420 L250,340 L200,285 L250,220 L225,150 L295,130 L285,65 Z"
                fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth={3} opacity={0.95} />
              <text x={350} y={30} textAnchor="middle" fontSize={22} fill="var(--text)" fontWeight={700}>🇩🇪 Deutschland</text>
              {/* Dein Sitz */}
              <g transform="translate(330,300)">
                <circle r={22} fill="var(--bg-elev)" stroke="var(--good)" strokeWidth={4} />
                <text y={8} textAnchor="middle" fontSize={22}>🏙️</text>
                <g transform="translate(0,42)"><rect x={-90} y={-16} width={180} height={26} rx={8} fill="var(--bg-panel)" stroke="var(--border)" /><text y={2} textAnchor="middle" fontSize={14} fill="var(--text)" fontWeight={600}>Deine Stadt (Sitz)</text></g>
              </g>
              {/* Künftige Städte */}
              {[[440,180],[250,470],[430,430]].map(([x, y], i) => (
                <g key={i} transform={`translate(${x},${y})`} opacity={0.5}>
                  <circle r={18} fill="var(--bg-panel-2)" stroke="var(--text-faint)" strokeWidth={3} strokeDasharray="4 4" />
                  <text y={6} textAnchor="middle" fontSize={16}>🔒</text>
                </g>
              ))}
            </svg>
          )}

          {level === 'kontinent' && (
            <svg viewBox="0 0 900 640" className="km-svg" preserveAspectRatio="xMidYMid meet">
              <path d="M120,120 L260,90 L360,140 L470,110 L560,150 L690,120 L780,180 L740,270 L800,340 L720,400 L760,500 L640,540 L520,500 L470,560 L360,520 L300,570 L210,520 L250,430 L160,380 L210,300 L140,240 Z"
                fill="var(--bg-panel)" stroke="var(--border)" strokeWidth={2} opacity={0.9} />
              <text x={450} y={40} textAnchor="middle" fontSize={22} fill="var(--text)" fontWeight={700}>🌍 Europa</text>
              {/* Deutschland hervorgehoben */}
              <g transform="translate(430,300)">
                <circle r={26} fill="var(--bg-elev)" stroke="var(--good)" strokeWidth={4} />
                <text y={9} textAnchor="middle" fontSize={24}>🇩🇪</text>
                <g transform="translate(0,48)"><rect x={-80} y={-16} width={160} height={26} rx={8} fill="var(--bg-panel)" stroke="var(--border)" /><text y={2} textAnchor="middle" fontSize={14} fill="var(--text)" fontWeight={600}>Deutschland</text></g>
              </g>
              {[[220,220],[600,200],[300,440],[650,420],[520,150]].map(([x, y], i) => (
                <g key={i} transform={`translate(${x},${y})`} opacity={0.5}>
                  <circle r={18} fill="var(--bg-panel-2)" stroke="var(--text-faint)" strokeWidth={3} strokeDasharray="4 4" />
                  <text y={6} textAnchor="middle" fontSize={16}>🔒</text>
                </g>
              ))}
            </svg>
          )}
        </div>

        <aside className="konzern-side">
          {level === 'stadt' ? (
            sel ? (() => {
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
            )
          ) : (
            <div className="km-hint">
              <p><b>{level === 'land' ? '🇩🇪 Landesansicht' : '🌍 Kontinentansicht'}</b></p>
              <p className="sub">
                {level === 'land'
                  ? 'Später expandierst du in weitere Städte in ganz Deutschland – jede mit eigenem Kundenstamm und eigener Konkurrenz. Die gesperrten Marker zeigen künftige Standorte.'
                  : 'Und schließlich lieferst du in ganz Europa – Land für Land, jedes mit eigenem Markt. Der Konzern wächst über die Landesgrenzen hinaus.'}
              </p>
              <p className="sub"><i>Diese Ausbaustufe folgt – dein Sitz ist bereits markiert.</i></p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
