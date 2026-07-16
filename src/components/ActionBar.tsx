import { useGame } from '../state/GameProvider';
import { catalogStatus, inventoryTotal, shelfStock } from '../game/simulation';
import { isFeatureUnlocked, type Feature } from '../game/tutorial';
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

  const buildUnlocked = isFeatureUnlocked(state.tutorial, 'build');

  return (
    <div className="actionbar">
      <button
        className={`action-btn${buildUnlocked ? '' : ' locked'}`}
        onClick={buildUnlocked ? onBuild : undefined}
        disabled={!buildUnlocked}
        title={buildUnlocked ? 'Lager bauen & erweitern' : 'Im Tutorial noch gesperrt'}
      >
        <span className="ico">🏗️</span>
        <span>Bauen</span>
        {!buildUnlocked && <span className="lock">🔒</span>}
      </button>
      {buttons.map((b) => {
        const unlocked = isFeatureUnlocked(state.tutorial, b.id as Feature);
        return (
          <button
            key={b.id}
            className={`action-btn${unlocked ? '' : ' locked'}`}
            onClick={unlocked ? () => onOpen(b.id) : undefined}
            disabled={!unlocked}
            title={unlocked ? undefined : 'Im Tutorial noch gesperrt'}
          >
            <span className="ico">{b.icon}</span>
            <span>{b.label}</span>
            {unlocked && b.id === 'procurement' && actionableOrders > 0 && (
              <span className="dot info" title="Aufträge bereit zum Herrichten">
                {actionableOrders}
              </span>
            )}
            {unlocked && b.badge ? (
              <span className={`dot${b.badgeInfo ? ' info' : ''}`}>{b.badge}</span>
            ) : null}
            {unlocked && b.warn && <span className="dot" title="Produkt ohne Bestand">!</span>}
            {!unlocked && <span className="lock">🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
