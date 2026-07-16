import { useGame } from '../state/GameProvider';
import { inboundStock, shelfStock } from '../game/simulation';
import { isFeatureUnlocked, STEP, tutorialOnStep } from '../game/tutorial';
import { prepareOrder, restockForOrder } from '../game/actions';
import { weekOf } from '../game/util';
import type { Order } from '../game/types';
import { PRODUCT_COLOR } from './shared';

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Offen',
  preparing: 'Herrichtung',
  ready: 'Fertig',
  delivered: 'Geliefert',
};

export function OrdersPanel() {
  const { state, mutate } = useGame();
  const week = weekOf(state.totalDays);

  const open = state.orders.filter((o) => o.status !== 'delivered');

  // Group open orders by customer so a multi-product customer shows one card.
  const groups = new Map<string, Order[]>();
  for (const o of open) {
    const arr = groups.get(o.customerId) ?? [];
    arr.push(o);
    groups.set(o.customerId, arr);
  }

  const cards = [...groups.entries()]
    .map(([customerId, orders]) => {
      const late = orders.some((o) => o.late);
      const minDue = Math.min(...orders.map((o) => o.dueWeek));
      return { customerId, orders, late, minDue };
    })
    .sort((a, b) => Number(b.late) - Number(a.late) || a.minDue - b.minDue);

  return (
    <div className="panel">
      <h3>
        🧾 Aufträge <span className="count">{open.length}</span>
      </h3>
      {cards.length === 0 && <div className="empty">Keine offenen Aufträge.</div>}

      {cards.map(({ customerId, orders, late, minDue }) => {
        const cust = state.customers.find((c) => c.id === customerId);
        const pending = orders.filter((o) => o.status === 'pending');
        const fulfillable = pending.filter(
          (o) => shelfStock(state.products.find((p) => p.id === o.productId)!) >= o.quantity,
        );
        const shortCount = pending.length - fulfillable.length;
        const totalValue = orders.reduce((s, o) => s + o.quantity * o.price, 0);

        return (
          <div key={customerId} className={`order${late ? ' late' : ''}`}>
            <div className="o-top">
              <span className="o-cust">
                {cust?.emoji} {cust?.name ?? 'Kunde'}
              </span>
              <span className="o-badge badge-preparing">{orders.length} Artikel</span>
            </div>

            {orders.map((order) => {
              const product = state.products.find((p) => p.id === order.productId)!;
              const have = shelfStock(product);
              const incoming = inboundStock(product);
              const enough = have >= order.quantity;
              const badgeClass = order.late
                ? 'badge-late'
                : order.status === 'pending'
                  ? 'badge-pending'
                  : order.status === 'preparing'
                    ? 'badge-preparing'
                    : 'badge-ready';
              return (
                <div key={order.id} className="o-meta" style={{ alignItems: 'center' }}>
                  <span style={{ color: PRODUCT_COLOR[order.productId] }}>
                    {product.emoji} {order.quantity}× {product.name}
                  </span>
                  <span>@ {order.price.toFixed(2)}€</span>
                  <span className={`o-badge ${badgeClass}`} style={{ marginLeft: 'auto' }}>
                    {order.late ? 'Verspätet' : STATUS_LABEL[order.status]}
                  </span>
                  {order.status === 'pending' && (
                    <span
                      className={enough ? 'pill' : 'pill bad'}
                      title={incoming > 0 ? `${incoming} im Wareneingang – wird noch eingelagert` : undefined}
                    >
                      {have}/{order.quantity}
                      {!enough && incoming > 0 ? ` +${incoming}📥` : ''}
                    </span>
                  )}
                </div>
              );
            })}

            <div className="o-meta" style={{ color: 'var(--text-faint)' }}>
              <span>fällig W{minDue}{minDue <= week ? ' ⚠️' : ''}</span>
              <span>· Umsatz {Math.round(totalValue)}€</span>
            </div>

            {pending.length > 0 && (
              <div className="o-actions">
                <button
                  className={`btn small primary${
                    tutorialOnStep(state.tutorial, STEP.HERRICHTEN) && fulfillable.length > 0 ? ' tut-glow' : ''
                  }`}
                  disabled={fulfillable.length === 0}
                  onClick={() =>
                    mutate((s) => {
                      for (const o of fulfillable) prepareOrder(s, o.id);
                    })
                  }
                >
                  👷 Herrichten ({fulfillable.length})
                </button>
                {/* Express restock is a purchasing action — hidden until the
                    tutorial's ordering beat introduces buying (gating parity). */}
                {shortCount > 0 && isFeatureUnlocked(state.tutorial, 'procurement') && (
                  <button
                    className="btn small"
                    title="Express-Nachbestellung außerhalb des Montags-Zyklus: schnelle Lieferung, aber +20% Einkaufspreis."
                    onClick={() =>
                      mutate((s) => {
                        for (const o of pending) restockForOrder(s, o.id);
                      })
                    }
                  >
                    🚀 Express +20% ({shortCount})
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
