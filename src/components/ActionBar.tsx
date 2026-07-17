import { useGame } from '../state/GameProvider';
import { catalogStatus, inventoryTotal, isInAssortment, shelfStock } from '../game/simulation';
import {
  isFeatureUnlocked,
  STEP,
  TUTORIAL_INQUIRY_IDS,
  TUTORIAL_MEAT_INQUIRY_ID,
  type Feature,
} from '../game/tutorial';
import type { GameState } from '../game/types';
import type { ModalId } from '../App';

/** Which action button glows to point at the next tutorial step. Nothing glows
 * during the waiting phases (inquiries come Thursday, the order window opens
 * Saturday) — the coach card explains the wait; the glow follows the moment the
 * window is actually there. */
function tutorialGlowTarget(state: GameState): ModalId {
  const t = state.tutorial;
  if (!t?.active) return null;
  if (t.step === STEP.GROWTH) {
    const anyOpen = state.inquiries.some(
      (i) => TUTORIAL_INQUIRY_IDS.includes(i.id) && i.status === 'open',
    );
    return anyOpen ? 'inquiries' : null;
  }
  if (t.step === STEP.ORDER) {
    return state.pendingOrderWeek != null ? 'procurement' : null;
  }
  if (t.step === STEP.MEAT) {
    if (!isInAssortment(state, 'fleisch')) return 'sortiment';
    const meatInq = state.inquiries.find((i) => i.id === TUTORIAL_MEAT_INQUIRY_ID);
    if (meatInq?.status === 'open') return 'inquiries';
    if (meatInq && state.currentWeekPoId == null && state.pendingOrderWeek != null) return 'procurement';
  }
  return null;
}

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
        const glow = unlocked && b.id != null && tutorialGlowTarget(state) === b.id;
        return (
          <button
            key={b.id}
            className={`action-btn${unlocked ? '' : ' locked'}${glow ? ' tut-glow' : ''}`}
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
