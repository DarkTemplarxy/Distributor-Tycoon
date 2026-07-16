import { useGame } from '../state/GameProvider';
import { catalogStatus, inventoryTotal, shelfStock } from '../game/simulation';
import type { ModalId } from '../App';

export function ActionBar({ onOpen, onBuild }: { onOpen: (id: ModalId) => void; onBuild: () => void }) {
  const { state } = useGame();

  const openInquiries = state.inquiries.filter((i) => i.status === 'open').length;
  const actionableOrders = state.orders.filter(
    (o) => o.status === 'pending' && shelfStock(state.products.find((p) => p.id === o.productId)!) >= o.quantity,
  ).length;
  const lowStock = state.products.some((p) => inventoryTotal(p) <= 0);
  const addableProducts = catalogStatus(state).filter((e) => e.status === 'addable').length;

  const buttons: { id: ModalId; icon: string; label: string; badge?: number; badgeInfo?: boolean; warn?: boolean }[] = [
    { id: 'inventory', icon: '📦', label: 'Inventar', warn: lowStock },
    { id: 'sortiment', icon: '🧺', label: 'Sortiment', badge: addableProducts, badgeInfo: true },
    { id: 'procurement', icon: '🛒', label: 'Einkauf' },
    { id: 'pricing', icon: '🏷️', label: 'Preise' },
    { id: 'customers', icon: '🤝', label: 'Kunden' },
    { id: 'inquiries', icon: '📨', label: 'Anfragen', badge: openInquiries, badgeInfo: true },
    { id: 'employees', icon: '🧑‍💼', label: 'Personal' },
    { id: 'finance', icon: '🏦', label: 'Finanzen' },
    { id: 'reports', icon: '📊', label: 'Reports' },
    { id: 'log', icon: '📜', label: 'Log' },
  ];

  return (
    <div className="actionbar">
      <button className="action-btn" onClick={onBuild} title="Lager bauen & erweitern">
        <span className="ico">🏗️</span>
        <span>Bauen</span>
      </button>
      {buttons.map((b) => (
        <button key={b.id} className="action-btn" onClick={() => onOpen(b.id)}>
          <span className="ico">{b.icon}</span>
          <span>{b.label}</span>
          {b.id === 'procurement' && actionableOrders > 0 && (
            <span className="dot info" title="Aufträge bereit zum Herrichten">
              {actionableOrders}
            </span>
          )}
          {b.badge ? (
            <span className={`dot${b.badgeInfo ? ' info' : ''}`}>{b.badge}</span>
          ) : null}
          {b.warn && <span className="dot" title="Produkt ohne Bestand">!</span>}
        </button>
      ))}
    </div>
  );
}
