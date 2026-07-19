import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { marketRanking, marketShare, playerRank } from '../../game/simulation';
import { COMPETITOR_DEFS, POACH_LOYALTY_CEILING } from '../../game/constants';
import { weekOf } from '../../game/util';

const RANK_LABEL = ['', '🥇', '🥈', '🥉'];

function aggrLabel(a: number): string {
  if (a >= 0.65) return 'sehr aggressiv';
  if (a >= 0.45) return 'aktiv';
  return 'zurückhaltend';
}

export function MarketModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const rows = marketRanking(state);
  const share = marketShare(state);
  const rank = playerRank(state);
  const week = weekOf(state.totalDays);
  const courted = state.customers.filter((c) => c.active && (c.courtedUntilWeek ?? 0) >= week);

  return (
    <Modal title="Markt & Konkurrenz" icon="📈" onClose={onClose} wide>
      <p className="hint">
        Du teilst dir den Markt mit <b>{COMPETITOR_DEFS.length} Wettbewerbern</b>. Dein{' '}
        <b>Marktanteil</b> wächst mit jedem aktiven Kunden (große zählen mehr). Wettbewerber{' '}
        <b>werben unzufriedene oder zu teuer bepreiste Kunden ab</b> – zufriedene Kunden (Loyalität ≥{' '}
        {POACH_LOYALTY_CEILING}%) bleiben treu. Halte mit <b>gutem Service</b>, <b>fairen Preisen</b>{' '}
        und ggf. <b>Rabatten</b> dagegen.
      </p>

      <div className="two-col" style={{ marginBottom: 12 }}>
        <div className="row" style={{ padding: '10px 12px' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Dein Marktanteil</div>
            <div className="sub">Platz {rank} von {rows.length}</div>
          </div>
          <span className={`pill ${rank === 1 ? 'good' : ''}`} style={{ fontSize: 15 }}>
            {(share * 100).toFixed(1)}%
          </span>
        </div>
        <div className="row" style={{ padding: '10px 12px' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: 13 }}>Aktuell umworbene Kunden</div>
            <div className="sub">
              {courted.length > 0 ? courted.map((c) => c.name).join(', ') : 'Keine – dein Kundenstamm ist stabil.'}
            </div>
          </div>
          <span className={`pill ${courted.length > 0 ? 'bad' : 'good'}`}>{courted.length}</span>
        </div>
      </div>

      <h3>Markt-Ranking</h3>
      <div className="rows">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="row"
            style={r.isPlayer ? { borderColor: 'var(--accent)', background: 'rgba(90,160,255,0.10)' } : undefined}
          >
            <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{RANK_LABEL[i + 1] || `${i + 1}.`}</span>
            <span style={{ fontSize: 22 }}>{r.emoji}</span>
            <div className="grow">
              <div className="title" style={{ fontSize: 14 }}>
                {r.name} {r.isPlayer && <span className="pill good">DU</span>}
              </div>
              <div className="sub">
                {r.isPlayer
                  ? 'Wächst mit deinen aktiven Kunden.'
                  : `${COMPETITOR_DEFS.find((d) => d.id === r.id)?.blurb ?? ''} · ${aggrLabel(r.aggressiveness ?? 0)}`}
              </div>
              <div className="progress" style={{ marginTop: 5 }}>
                <span style={{ width: `${Math.min(100, r.share * 100 * 1.6)}%` }} />
              </div>
            </div>
            <span className={`pill ${r.isPlayer ? 'good' : ''}`}>{(r.share * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
