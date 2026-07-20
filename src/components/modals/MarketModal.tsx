import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { marketRanking, marketShare, playerRank, yourHeld, competitorHeld, activeSites, freeCapacity } from '../../game/simulation';
import { poachCompetitorCustomer, abwerbeCooldownLeft } from '../../game/actions';
import { COMPETITOR_DEFS, POACH_SAFE_LOYALTY, CUSTOMER_EMOJI, ABWERBE_COST, ABWERBE_COOLDOWN_WEEKS } from '../../game/constants';
import type { CustomerType } from '../../game/types';
import { weekOf } from '../../game/util';

const RANK_LABEL = ['', '🥇', '🥈', '🥉'];
const TYPE_ROWS: { type: CustomerType; label: string }[] = [
  { type: 'small', label: 'Kleinkunden' },
  { type: 'medium', label: 'Mittelkunden' },
  { type: 'large', label: 'Großkunden' },
];

function aggrLabel(a: number): string {
  if (a >= 0.65) return 'sehr aggressiv';
  if (a >= 0.45) return 'aktiv';
  return 'zurückhaltend';
}

export function MarketModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const cooldown = abwerbeCooldownLeft(state);
  const canAfford = state.cash >= ABWERBE_COST;
  const rows = marketRanking(state);
  const share = marketShare(state);
  const rank = playerRank(state);
  const week = weekOf(state.totalDays);
  const courted = state.customers.filter((c) => c.active && (c.courtedUntilWeek ?? 0) >= week);
  const sites = activeSites(state);
  const typeShare = TYPE_ROWS.map(({ type, label }) => {
    const you = yourHeld(state, type);
    const comp = type === 'large'
      ? competitorHeld(state, 'large', 'hq')
      : sites.reduce((s, site) => s + competitorHeld(state, type, site), 0);
    const share = you + comp > 0 ? you / (you + comp) : 0;
    return { type, label, you, comp, share };
  });

  return (
    <Modal title="Markt & Konkurrenz" icon="📈" onClose={onClose} wide>
      <p className="hint">
        Du teilst dir den Markt mit <b>{COMPETITOR_DEFS.length} Wettbewerbern</b>. Dein{' '}
        <b>Marktanteil</b> wächst mit jedem aktiven Kunden (große zählen mehr). Wettbewerber{' '}
        <b>greifen unzufriedene oder zu teuer bepreiste Kunden an</b> – und zwar je nach Loyalität:
        ab <b>{POACH_SAFE_LOYALTY}%</b> treu &amp; sicher, darunter kannst du mit einem{' '}
        <b>Gegenangebot</b> gegenhalten, unter <b>30%</b> ist der Kunde direkt weg. Beste Abwehr:{' '}
        <b>guter Service</b> &amp; <b>faire Preise</b>.
      </p>

      <h3>Marktanteil je Kundengruppe</h3>
      <div className="rows" style={{ marginBottom: 12 }}>
        {typeShare.map(({ type, label, you, comp, share }) => (
          <div key={type} className="row">
            <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{CUSTOMER_EMOJI[type]}</span>
            <div className="grow">
              <div className="title" style={{ fontSize: 14 }}>{label}</div>
              <div className="sub">Du {you} · Konkurrenz {comp}{type === 'large' ? ' (fixer Markt)' : ''}</div>
              <div className="progress" style={{ marginTop: 5 }}>
                <span style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
            </div>
            <span className={`pill ${share >= 0.5 ? 'good' : ''}`}>{(share * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <h3>🎯 Kunden gezielt abwerben</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        Geh in die Offensive: für <b>{ABWERBE_COST.toLocaleString('de-DE')}€</b> wirbt dein Vertrieb
        einen Kunden eines Wettbewerbers ab – er schickt dir eine <b>Wechsel-Anfrage</b>, die du im
        Anfragen-Screen abschließt. <b>Guter Ruf</b> = besserer Zielpreis. Nur alle{' '}
        {ABWERBE_COOLDOWN_WEEKS} Wochen möglich.
      </p>
      <div className="row" style={{ padding: '10px 12px', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        {cooldown > 0 ? (
          <div className="sub">⏳ Nächste Abwerbung in <b>{cooldown} Woche{cooldown === 1 ? '' : 'n'}</b> möglich.</div>
        ) : (
          TYPE_ROWS.map(({ type, label }) => {
            const cap = freeCapacity(state, type);
            const disabled = !canAfford || cap <= 0;
            return (
              <button
                key={type}
                className="btn"
                disabled={disabled}
                title={!canAfford ? 'Zu wenig Kapital' : cap <= 0 ? 'Keine freie Kapazität – erst Slots/KAM schaffen' : ''}
                onClick={() => mutate((s) => poachCompetitorCustomer(s, type))}
              >
                {CUSTOMER_EMOJI[type]} {label.replace('kunden', '')} abwerben
              </button>
            );
          })
        )}
      </div>

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
