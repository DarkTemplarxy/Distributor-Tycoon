import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { defendCustomer, surrenderCustomer } from '../../game/actions';
import { POACH_SAFE_LOYALTY, POACH_DIRECT_LOSS_LOYALTY } from '../../game/constants';
import { weekOf } from '../../game/util';

const TYPE_LABEL: Record<string, string> = { small: 'Kleinkunde', medium: 'Mittelkunde', large: 'Großkunde' };

/**
 * Blockierende Entscheidung bei einer Abwerbe-Attacke (Konkurrenz Stufe 2). Der
 * Kunde sitzt in der mittleren Loyalitäts-Stufe: du kannst mit einem Gegenangebot
 * (Marge einbüßen) gegenhalten oder ihn ziehen lassen. Ist die Attacke die erste
 * (Monat 3), wird die 3-Stufen-Mechanik erklärt.
 */
export function PoachModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const p = state.pendingPoach;
  const cust = p ? state.customers.find((c) => c.id === p.customerId) : undefined;
  if (!p || !cust) {
    return (
      <Modal title="Abwerbung" icon="🎯" onClose={onClose}>
        <p className="hint">Die Abwerbung ist bereits erledigt.</p>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Schließen</button></div>
      </Modal>
    );
  }

  const weekly = Math.round(cust.lines.reduce((s, l) => s + l.volume * l.price, 0));
  const newDiscount = Math.min(0.2, cust.activeDiscount + p.discountOffer);
  const marginCost = Math.round(weekly * (newDiscount - cust.activeDiscount));
  const weeksLeft = Math.max(0, p.deadlineWeek - weekOf(state.totalDays));

  const doDefend = () => { mutate((s) => defendCustomer(s)); onClose(); };
  const doSurrender = () => { mutate((s) => surrenderCustomer(s)); onClose(); };

  return (
    <Modal title="Abwerbe-Alarm!" icon="🎯" onClose={onClose} top>
      {p.tutorial && (
        <div className="row" style={{ padding: '10px 12px', marginBottom: 12, borderColor: 'var(--accent)', background: 'rgba(90,160,255,0.10)', display: 'block' }}>
          <div className="title" style={{ fontSize: 14, marginBottom: 4 }}>🥊 Die Konkurrenz greift an</div>
          <div className="sub" style={{ lineHeight: 1.5 }}>
            Wettbewerber werben deine Kunden ab – wie es ausgeht, hängt von der <b>Loyalität</b> ab:
            <br />🛡️ <b>≥ {POACH_SAFE_LOYALTY}%</b> – treu &amp; sicher, wird gar nicht erst angegriffen.
            <br />🤝 <b>{POACH_DIRECT_LOSS_LOYALTY}–{POACH_SAFE_LOYALTY}%</b> – umkämpft: du kannst ein <b>Gegenangebot</b> machen (Marge einbüßen, Kunde bleibt).
            <br />🏴 <b>&lt; {POACH_DIRECT_LOSS_LOYALTY}%</b> – zu unzufrieden: der Kunde ist direkt weg.
            <br />Guter Service &amp; faire Preise halten die Loyalität oben – das ist die beste Abwehr.
          </div>
        </div>
      )}

      <p className="hint" style={{ marginBottom: 12 }}>
        <b>{p.raiderEmoji} {p.raiderName}</b> greift nach deinem Kunden <b>{cust.name}</b> ({TYPE_LABEL[cust.type]}).
        Loyalität <b>{Math.round(cust.loyalty)}%</b> – noch zu halten, aber nur mit einem Gegenangebot.
        {weeksLeft > 0 && <> Entscheide innerhalb von <b>{weeksLeft} Woche{weeksLeft === 1 ? '' : 'n'}</b>.</>}
      </p>

      <div className="two-col" style={{ gap: 10 }}>
        <div className="row" style={{ display: 'block', padding: '12px 14px' }}>
          <div className="title" style={{ fontSize: 14, marginBottom: 4 }}>🤝 Gegenangebot</div>
          <div className="sub" style={{ lineHeight: 1.5, marginBottom: 10 }}>
            Rabatt <b>+{Math.round(p.discountOffer * 100)} %</b> (auf {Math.round(newDiscount * 100)} %).
            Kostet ~<b>{marginCost}€</b>/Woche Marge, aber <b>{cust.name} bleibt</b> und wird wieder loyal.
          </div>
          <button className="btn primary" style={{ width: '100%' }} onClick={doDefend}>
            Halten (~{weekly}€/Wo Umsatz sichern)
          </button>
        </div>
        <div className="row" style={{ display: 'block', padding: '12px 14px' }}>
          <div className="title" style={{ fontSize: 14, marginBottom: 4 }}>🏴 Ziehen lassen</div>
          <div className="sub" style={{ lineHeight: 1.5, marginBottom: 10 }}>
            Keine Marge-Einbuße, aber <b>{cust.name} wechselt zur Konkurrenz</b>.
            Verlust ~<b>{weekly}€</b>/Woche Umsatz.
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={doSurrender}>
            Ziehen lassen
          </button>
        </div>
      </div>
    </Modal>
  );
}
