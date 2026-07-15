import { useEffect, useState } from 'react';
import { useGame } from './state/GameProvider';
import { weekOf } from './game/util';
import { TopBar } from './components/TopBar';
import { Modal } from './components/Modal';
import { IsometricWarehouse } from './components/IsometricWarehouse';
import { OrdersPanel } from './components/OrdersPanel';
import { ActionBar } from './components/ActionBar';
import { Toasts } from './components/Toasts';
import { GameOverScreen, StartScreen, YearCompleteScreen } from './components/OverlayScreens';
import { InventoryModal } from './components/modals/InventoryModal';
import { SortimentModal } from './components/modals/SortimentModal';
import { ProcurementModal } from './components/modals/ProcurementModal';
import { PricingModal } from './components/modals/PricingModal';
import { CustomersModal } from './components/modals/CustomersModal';
import { InquiriesModal } from './components/modals/InquiriesModal';
import { EmployeesModal } from './components/modals/EmployeesModal';
import { FinanceModal } from './components/modals/FinanceModal';
import { ReportsModal } from './components/modals/ReportsModal';
import { LogModal } from './components/modals/LogModal';

export type ModalId =
  | 'inventory'
  | 'sortiment'
  | 'procurement'
  | 'pricing'
  | 'customers'
  | 'inquiries'
  | 'employees'
  | 'finance'
  | 'reports'
  | 'log'
  | null;

export function App() {
  const { state, togglePause, setPaused, newGame } = useGame();
  const [modal, setModal] = useState<ModalId>(null);
  const [startDismissed, setStartDismissed] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);

  const doRestart = () => {
    newGame();
    setRestartOpen(false);
    setModal(null);
    setStartDismissed(false);
  };

  // Spacebar toggles pause (unless typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause]);

  const showStart =
    !startDismissed && state.totalDays === 0 && weekOf(state.totalDays) === 0 && !state.gameOver;

  return (
    <div className="app">
      <TopBar onRestart={() => setRestartOpen(true)} />

      <div className="main">
        <div className="col-left">
          <IsometricWarehouse />
        </div>
        <div className="col-right">
          <OrdersPanel />
        </div>
      </div>

      <ActionBar onOpen={setModal} />

      <Toasts />

      {modal === 'inventory' && <InventoryModal onClose={() => setModal(null)} />}
      {modal === 'sortiment' && <SortimentModal onClose={() => setModal(null)} />}
      {modal === 'procurement' && <ProcurementModal onClose={() => setModal(null)} />}
      {modal === 'pricing' && <PricingModal onClose={() => setModal(null)} />}
      {modal === 'customers' && <CustomersModal onClose={() => setModal(null)} />}
      {modal === 'inquiries' && <InquiriesModal onClose={() => setModal(null)} />}
      {modal === 'employees' && <EmployeesModal onClose={() => setModal(null)} />}
      {modal === 'finance' && <FinanceModal onClose={() => setModal(null)} />}
      {modal === 'reports' && <ReportsModal onClose={() => setModal(null)} />}
      {modal === 'log' && <LogModal onClose={() => setModal(null)} />}

      {showStart && (
        <StartScreen
          onDismiss={() => {
            setStartDismissed(true);
            setPaused(false);
          }}
        />
      )}
      {state.yearComplete && <YearCompleteScreen onRestart={() => setRestartOpen(true)} />}
      {state.gameOver && <GameOverScreen />}

      {restartOpen && (
        <Modal title="Neues Spiel starten?" icon="🔄" onClose={() => setRestartOpen(false)}>
          <p className="hint">
            Der aktuelle Fortschritt geht dabei verloren und kann nicht wiederhergestellt werden.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setRestartOpen(false)}>
              Abbrechen
            </button>
            <button className="btn danger" onClick={doRestart}>
              Ja, neu starten
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
