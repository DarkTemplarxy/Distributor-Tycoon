import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { euro } from '../../game/util';

export function ReportsModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const reports = state.reports;
  const recent = reports.slice(-16);
  const maxAbs = Math.max(1, ...recent.map((r) => Math.abs(r.profit)));

  return (
    <Modal title="Wochenreports & Statistik" icon="📊" onClose={onClose} wide>
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

      <h3>Wochengewinn</h3>
      {recent.length === 0 ? (
        <div className="empty">Noch keine abgeschlossene Woche.</div>
      ) : (
        <div className="bars">
          {recent.map((r) => (
            <div
              key={r.week}
              className={`bar${r.profit < 0 ? ' neg' : ''}`}
              style={{ height: `${(Math.abs(r.profit) / maxAbs) * 100}%` }}
              title={`W${r.week}: ${euro(r.profit)}`}
            />
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>Details</h3>
      {reports.length === 0 && <div className="empty">Noch keine Reports.</div>}
      <div className="rows">
        {[...reports].reverse().slice(0, 12).map((r) => (
          <div key={r.week} className="row" style={{ flexWrap: 'wrap' }}>
            <div className="grow" style={{ minWidth: 90 }}>
              <div className="title" style={{ fontSize: 13 }}>Woche {r.week}</div>
              <div className="sub">
                {r.customerCount} Kunden · {r.deliveredOrders} geliefert
                {r.lateOrders > 0 ? ` · ${r.lateOrders} spät` : ''}
              </div>
            </div>
            <span className="pill good">Umsatz {euro(r.revenue)}</span>
            <span className="pill">EK {euro(r.purchases)}</span>
            <span className="pill">Lohn {euro(r.salaries)}</span>
            <span className="pill">Logistik {euro(r.logistics)}</span>
            <span className={`pill ${r.profit >= 0 ? 'good' : 'bad'}`}>
              Gewinn {euro(r.profit)}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
