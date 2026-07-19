import { useGame } from '../state/GameProvider';
import { catalogStatus, hasMarginPressure, inventoryTotal, isInAssortment, shelfStock } from '../game/simulation';
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

/** Why a button is still locked and what unlocks it — shown on hover so the
 * lock is never a mystery. Features without an early tutorial beat open when
 * the tutorial ends (keyed loosely: 'notebook' is gated but not a Feature). */
const LOCK_HINT: Record<string, string> = {
  notebook: '🔒 Öffnet am Ende des Tutorials – der Onkel übergibt dir dann sein Notizbuch mit den Zielen.',
  inventory: '🔒 Öffnet am Ende des Tutorials – folge einfach Onkels Anleitung.',
  sortiment: '🔒 Schaltet mit der Fleisch-Lektion des Tutorials frei (sobald Fleisch listbar wird).',
  procurement: '🔒 Schaltet mit der Bestell-Lektion frei – das erste Bestellfenster öffnet am Samstag.',
  pricing: '🔒 Öffnet am Ende des Tutorials – folge einfach Onkels Anleitung.',
  customers: '🔒 Öffnet am Ende des Tutorials – folge einfach Onkels Anleitung.',
  inquiries: '🔒 Schaltet mit der Wachstums-Lektion frei – schließe zuerst deine erste Lieferung ab.',
  employees: '🔒 Schaltet mit der Kapazitäts-Lektion frei – erst kommt die erste eigene Lieferung.',
  company: '🔒 Öffnet am Ende des Tutorials – Investitionen & Strategie sind fürs spätere Wachstum.',
  finance: '🔒 Schaltet mit der Monats-Lektion des Tutorials frei.',
  reports: '🔒 Schaltet mit der Monats-Lektion des Tutorials frei.',
  log: '🔒 Öffnet am Ende des Tutorials – folge einfach Onkels Anleitung.',
  build: '🔒 Schaltet mit der Kapazitäts-Lektion des Tutorials frei.',
};

export function ActionBar({ onOpen, onBuild }: { onOpen: (id: ModalId) => void; onBuild: () => void }) {
  const { state } = useGame();

  const openInquiries = state.inquiries.filter((i) => i.status === 'open').length;
  const actionableOrders = state.orders.filter(
    (o) => o.status === 'pending' && shelfStock(state.products.find((p) => p.id === o.productId)!) >= o.quantity,
  ).length;
  const lowStock = state.products.some((p) => inventoryTotal(p) <= 0);
  const addableProducts = catalogStatus(state).filter((e) => e.status === 'addable').length;
  const marginPressure = hasMarginPressure(state);

  const buttons: { id: ModalId; icon: string; label: string; badge?: number; badgeInfo?: boolean; warn?: boolean; warnTitle?: string }[] = [
    { id: 'inventory', icon: '📦', label: 'Inventar', warn: lowStock, warnTitle: 'Produkt ohne Bestand' },
    { id: 'sortiment', icon: '🧺', label: 'Sortiment', badge: addableProducts, badgeInfo: true },
    { id: 'procurement', icon: '🛒', label: 'Einkauf' },
    { id: 'pricing', icon: '🏷️', label: 'Preise', warn: marginPressure, warnTitle: 'Marge unter Zielmarge – Preise anpassen' },
    { id: 'customers', icon: '🤝', label: 'Kunden' },
    { id: 'inquiries', icon: '📨', label: 'Anfragen', badge: openInquiries, badgeInfo: true },
    { id: 'employees', icon: '🧑‍💼', label: 'Personal' },
    { id: 'company', icon: '🏢', label: 'Ausbau' },
    { id: 'finance', icon: '🏦', label: 'Finanzen' },
    { id: 'reports', icon: '📊', label: 'Reports' },
    { id: 'notebook', icon: '📓', label: 'Notizbuch' },
    { id: 'log', icon: '📜', label: 'Log' },
  ];

  const buildUnlocked = isFeatureUnlocked(state.tutorial, 'build');

  return (
    <div className="actionbar">
      <button
        className={`action-btn${buildUnlocked ? '' : ' locked'}`}
        onClick={buildUnlocked ? onBuild : undefined}
        disabled={!buildUnlocked}
        title={buildUnlocked ? 'Lager bauen & erweitern' : LOCK_HINT.build}
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
            title={unlocked ? undefined : LOCK_HINT[b.id as string]}
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
            {unlocked && b.warn && <span className="dot" title={b.warnTitle ?? 'Achtung'}>!</span>}
            {!unlocked && <span className="lock">🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
