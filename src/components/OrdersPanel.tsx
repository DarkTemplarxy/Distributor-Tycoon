import { useGame } from '../state/GameProvider';
import { inventoryTotal } from '../game/simulation';
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

  const open = state.orders
    .filter((o) => o.status !== 'delivered')
    .sort((a, b) => Number(b.late) - Number(a.late) || a.dueWeek - b.dueWeek);

  return (
    <div className="panel">
      <h3>
        🧾 Aufträge <span className="count">{open.length}</span>
      </h3>
      {open.length === 0 && <div className="empty">Keine offenen Aufträge.</div>}
      {open.map((order) => {
        const cust = state.customers.find((c) => c.id === order.customerId);
        const product = state.products.find((p) => p.id === order.productId)!;
        const have = inventoryTotal(product);
        const enough = have >= order.quantity;
        const badgeClass = order.late
          ? 'badge-late'
          : order.status === 'pending'
            ? 'badge-pending'
            : order.status === 'preparing'
              ? 'badge-preparing'
              : 'badge-ready';
        return (
          <div key={order.id} className={`order${order.late ? ' late' : ''}`}>
            <div className="o-top">
              <span className="o-cust">
                {cust?.emoji} {cust?.name ?? 'Kunde'}
              </span>
              <span className={`o-badge ${badgeClass}`}>
                {order.late ? 'Verspätet' : STATUS_LABEL[order.status]}
              </span>
            </div>
            <div className="o-meta">
              <span style={{ color: PRODUCT_COLOR[order.productId] }}>
                {product.emoji} {order.quantity}× {product.name}
              </span>
              <span>@ {order.price.toFixed(2)}€</span>
              <span>fällig W{order.dueWeek}{order.dueWeek <= week ? ' ⚠️' : ''}</span>
            </div>
            {order.status === 'pending' && (
              <div className="o-meta">
                <span className={enough ? '' : 'pill bad'}>
                  Bestand: {have} / {order.quantity}
                </span>
              </div>
            )}
            {order.status === 'pending' && (
              <div className="o-actions">
                <button
                  className="btn small primary"
                  disabled={!enough}
                  onClick={() => mutate((s) => prepareOrder(s, order.id))}
                >
                  👷 Herrichten
                </button>
                {!enough && (
                  <button
                    className="btn small"
                    onClick={() => mutate((s) => restockForOrder(s, order.id))}
                  >
                    🛒 Nachbestellen ({order.quantity - have}×)
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
