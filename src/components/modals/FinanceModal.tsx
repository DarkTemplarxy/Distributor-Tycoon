import { useState } from 'react';
import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { availableCredit } from '../../game/simulation';
import { repayCredit, takeCredit } from '../../game/actions';
import { CREDIT_INTEREST_RATE } from '../../game/constants';
import { euro, weekOf } from '../../game/util';

export function FinanceModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const [amount, setAmount] = useState(500);
  const avail = availableCredit(state);
  const week = weekOf(state.totalDays);

  const upcomingPayments = [...state.scheduledPayments].sort((a, b) => a.dueDay - b.dueDay);
  const pendingPOs = state.purchaseOrders.filter((po) => po.status === 'pending');

  return (
    <Modal title="Finanzen" icon="🏦" onClose={onClose} wide>
      <div className="report-grid">
        <div className="stat-box">
          <div className="k">Kasse</div>
          <div className="v" style={{ color: state.cash < 0 ? 'var(--bad)' : 'var(--cash)' }}>
            {euro(state.cash)}
          </div>
        </div>
        <div className="stat-box">
          <div className="k">Bankkredit</div>
          <div className="v" style={{ color: state.bankCredit > 0 ? 'var(--warn)' : undefined }}>
            {euro(state.bankCredit)}
          </div>
        </div>
        <div className="stat-box">
          <div className="k">Kreditrahmen frei</div>
          <div className="v">{euro(avail)}</div>
        </div>
        <div className="stat-box">
          <div className="k">Zins / Woche</div>
          <div className="v">{euro(state.bankCredit * CREDIT_INTEREST_RATE)}</div>
        </div>
      </div>

      <p className="hint">
        Kreditlimit = max(1.500€, 3× Ø-Wochengewinn) und wächst mit deinem Erfolg. Zinsen{' '}
        {(CREDIT_INTEREST_RATE * 100).toFixed(0)}% pro Woche auf den offenen Saldo.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <input
          className="num-input"
          style={{ width: 120 }}
          type="number"
          min={0}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
        />
        <button className="btn" disabled={amount <= 0 || amount > avail} onClick={() => mutate((s) => takeCredit(s, amount))}>
          Kredit aufnehmen
        </button>
        <button
          className="btn"
          disabled={amount <= 0 || state.bankCredit <= 0 || state.cash <= 0}
          onClick={() => mutate((s) => repayCredit(s, amount))}
        >
          Kredit tilgen
        </button>
      </div>

      <div className="two-col">
        <div>
          <h3>💰 Erwartete Zahlungen</h3>
          {upcomingPayments.length === 0 && <div className="empty">Keine offenen Zahlungen.</div>}
          <div className="rows">
            {upcomingPayments.map((p) => {
              const cust = state.customers.find((c) => c.id === p.customerId);
              const daysLeft = Math.max(0, p.dueDay - state.totalDays);
              return (
                <div key={p.id} className="row" style={{ padding: '8px 10px' }}>
                  <div className="grow">
                    <div className="title" style={{ fontSize: 13 }}>{cust?.name ?? 'Kunde'}</div>
                    <div className="sub">in {daysLeft.toFixed(1)} Tagen</div>
                  </div>
                  <span className="pill good">+{euro(p.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3>📦 Offene Lieferungen</h3>
          {pendingPOs.length === 0 && <div className="empty">Keine offenen Lieferungen.</div>}
          <div className="rows">
            {pendingPOs.map((po) => {
              const daysLeft = Math.max(0, po.deliveryDay - state.totalDays);
              return (
                <div key={po.id} className="row" style={{ padding: '8px 10px' }}>
                  <div className="grow">
                    <div className="title" style={{ fontSize: 13 }}>
                      {po.items.map((i) => `${i.quantity}× ${i.productId}`).join(', ')}
                    </div>
                    <div className="sub">in {daysLeft.toFixed(1)} Tagen</div>
                  </div>
                  <span className="pill">−{euro(po.totalCost)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Gesamt-Umsatz bisher: {euro(state.stats.totalRevenue)} · Kumulierter Gewinn:{' '}
        {euro(state.stats.totalProfit)} · Woche {week + 1}
      </p>
    </Modal>
  );
}
