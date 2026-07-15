import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { euro, monthOf, weekOfMonth } from '../../game/util';
import type { WeeklyReport } from '../../game/types';

interface MonthAgg {
  month: number; // absolute month index (0-based)
  weeks: WeeklyReport[];
  revenue: number;
  purchases: number;
  salaries: number;
  rent: number;
  logistics: number;
  profit: number;
  customerCount: number;
  deliveredOrders: number;
  lateOrders: number;
}

function aggregateMonths(reports: WeeklyReport[]): MonthAgg[] {
  const map = new Map<number, WeeklyReport[]>();
  for (const r of reports) {
    const m = monthOf(r.week);
    (map.get(m) ?? map.set(m, []).get(m)!).push(r);
  }
  return [...map.entries()]
    .map(([month, weeks]) => ({
      month,
      weeks,
      revenue: weeks.reduce((s, w) => s + w.revenue, 0),
      purchases: weeks.reduce((s, w) => s + w.purchases, 0),
      salaries: weeks.reduce((s, w) => s + w.salaries, 0),
      rent: weeks.reduce((s, w) => s + w.rent, 0),
      logistics: weeks.reduce((s, w) => s + w.logistics, 0),
      profit: weeks.reduce((s, w) => s + w.profit, 0),
      customerCount: weeks[weeks.length - 1]?.customerCount ?? 0,
      deliveredOrders: weeks.reduce((s, w) => s + w.deliveredOrders, 0),
      lateOrders: weeks.reduce((s, w) => s + w.lateOrders, 0),
    }))
    .sort((a, b) => a.month - b.month);
}

export function ReportsModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const [selected, setSelected] = useState<number | null>(null);
  const months = aggregateMonths(state.reports);
  const selMonth = selected !== null ? months.find((m) => m.month === selected) : undefined;

  return (
    <Modal title="Reports & Statistik" icon="📊" onClose={onClose} wide>
      <div className="report-grid">
        <div className="stat-box">
          <div className="k">Umsatz gesamt</div>
          <div className="v">{euro(state.stats.totalRevenue)}</div>
        </div>
        <div className="stat-box">
          <div className="k">Gewinn kumuliert</div>
          <div className="v" style={{ color: state.stats.totalProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
            {euro(state.stats.totalProfit)}
          </div>
        </div>
        <div className="stat-box">
          <div className="k">Gelieferte Aufträge</div>
          <div className="v">{state.stats.deliveredOrders}</div>
        </div>
        <div className="stat-box">
          <div className="k">Verspätungen · Verderb</div>
          <div className="v">
            {state.stats.lateOrders} · {state.stats.spoiledUnits}
          </div>
        </div>
      </div>

      {selMonth ? (
        // ---- Weekly drill-down for one month ----
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <button className="btn ghost small" onClick={() => setSelected(null)}>
              ← Zurück
            </button>
            <h3 style={{ margin: 0 }}>Monat {selMonth.month + 1} · Wochenübersicht</h3>
          </div>
          <div className="rows" style={{ marginTop: 10 }}>
            {selMonth.weeks.map((r) => (
              <div key={r.week} className="row" style={{ flexWrap: 'wrap' }}>
                <div className="grow" style={{ minWidth: 90 }}>
                  <div className="title" style={{ fontSize: 13 }}>Woche {weekOfMonth(r.week) + 1}</div>
                  <div className="sub">
                    {r.customerCount} Kunden · {r.deliveredOrders} geliefert
                    {r.lateOrders > 0 ? ` · ${r.lateOrders} spät` : ''}
                  </div>
                </div>
                <span className="pill good">Umsatz {euro(r.revenue)}</span>
                <span className="pill">EK {euro(r.purchases)}</span>
                {r.salaries > 0 && <span className="pill">Lohn {euro(r.salaries)}</span>}
                {r.rent > 0 && <span className="pill">Miete {euro(r.rent)}</span>}
                <span className="pill">Logistik {euro(r.logistics)}</span>
                <span className={`pill ${r.profit >= 0 ? 'good' : 'bad'}`}>Gewinn {euro(r.profit)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        // ---- Monthly overview ----
        <>
          <h3>Monatsgewinn</h3>
          {months.length === 0 ? (
            <div className="empty">Noch kein abgeschlossener Monat.</div>
          ) : (
            <div className="bars">
              {months.slice(-12).map((m) => {
                const maxAbs = Math.max(1, ...months.map((x) => Math.abs(x.profit)));
                return (
                  <div
                    key={m.month}
                    className={`bar${m.profit < 0 ? ' neg' : ''}`}
                    style={{ height: `${(Math.abs(m.profit) / maxAbs) * 100}%` }}
                    title={`Monat ${m.month + 1}: ${euro(m.profit)}`}
                  />
                );
              })}
            </div>
          )}

          <h3 style={{ marginTop: 18 }}>Monate (klicken für Wochen)</h3>
          {months.length === 0 && <div className="empty">Noch keine Reports.</div>}
          <div className="rows">
            {[...months].reverse().map((m) => (
              <button
                key={m.month}
                className="row"
                style={{ cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%' }}
                onClick={() => setSelected(m.month)}
              >
                <div className="grow" style={{ minWidth: 90 }}>
                  <div className="title" style={{ fontSize: 14 }}>Monat {m.month + 1} ›</div>
                  <div className="sub">
                    {m.customerCount} Kunden · {m.deliveredOrders} geliefert
                    {m.lateOrders > 0 ? ` · ${m.lateOrders} spät` : ''}
                  </div>
                </div>
                <span className="pill good">Umsatz {euro(m.revenue)}</span>
                <span className="pill">Personal {euro(m.salaries)}</span>
                <span className="pill">Miete {euro(m.rent)}</span>
                <span
                  className={`pill ${m.profit >= 0 ? 'good' : 'bad'}`}
                  style={{ fontWeight: 700 }}
                >
                  {m.profit >= 0 ? 'Gewinn' : 'Verlust'} {euro(m.profit)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
