import { useEffect, useState } from 'react';
import { useGame } from './state/GameProvider';
import { weekOf } from './game/util';
import { TopBar } from './components/TopBar';
import { Modal } from './components/Modal';
import { IsometricWarehouse, type BuildTool } from './components/IsometricWarehouse';
import { BuildBar } from './components/BuildBar';
import { OrdersPanel } from './components/OrdersPanel';
import { ActionBar } from './components/ActionBar';
import { buildShelf, buildTable, buildInboundSlot, expandHall } from './game/actions';
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
  const { state, mutate, togglePause, setPaused, newGame } = useGame();
  const [modal, setModal] = useState<ModalId>(null);
  const [startDismissed, setStartDismissed] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  // True while the auto-opened Monday order screen is up, so closing it resumes
  // the game (a manually-opened Einkauf screen must not touch the pause state).
  const [orderPromptActive, setOrderPromptActive] = useState(false);
  const [buildMode, setBuildMode] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool | null>(null);

  // Opening a modal leaves build mode; entering build mode closes any modal.
  const openModal = (id: ModalId) => {
    setBuildMode(false);
    setBuildTool(null);
    setModal(id);
  };
  const enterBuild = () => {
    setModal(null);
    setBuildMode(true);
  };
  const exitBuild = () => {
    setBuildMode(false);
    setBuildTool(null);
  };

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

  // Every Monday without an Einkäufer the simulation raises pendingOrderWeek. Open
  // the weekly order screen and pause the game until the player has dealt with it.
  useEffect(() => {
    if (state.pendingOrderWeek != null && !showStart && !state.gameOver && !state.yearComplete) {
      setModal('procurement');
      setPaused(true);
      setOrderPromptActive(true);
    }
  }, [state.pendingOrderWeek, showStart, state.gameOver, state.yearComplete, setPaused]);

  // Closing the weekly order screen: clear any pending prompt (a skipped week) and
  // resume the clock only if it was the auto-opened Monday prompt.
  const closeProcurement = () => {
    setModal(null);
    if (state.pendingOrderWeek != null) mutate((s) => { s.pendingOrderWeek = null; });
    if (orderPromptActive) {
      setPaused(false);
      setOrderPromptActive(false);
    }
  };

  return (
    <div className="app">
      <TopBar onRestart={() => setRestartOpen(true)} />

      <div className="main">
        <div className="col-left" style={{ position: 'relative' }}>
          {buildMode && <BuildBar tool={buildTool} onSelect={setBuildTool} onExit={exitBuild} />}
          <IsometricWarehouse
            build={
              buildMode
                ? {
                    tool: buildTool,
                    onPlaceTile: (gx, gy) =>
                      mutate((s) => {
                        if (buildTool === 'shelf') buildShelf(s, gx, gy);
                        else if (buildTool === 'table') buildTable(s, gx, gy);
                        else if (buildTool === 'inbound') buildInboundSlot(s, gx, gy);
                      }),
                    onExpand: (block) => mutate((s) => expandHall(s, block)),
                  }
                : undefined
            }
          />
        </div>
        <div className="col-right">
          <OrdersPanel />
        </div>
      </div>

      <ActionBar onOpen={openModal} onBuild={enterBuild} />

      <Toasts />

      {modal === 'inventory' && <InventoryModal onClose={() => setModal(null)} />}
      {modal === 'sortiment' && <SortimentModal onClose={() => setModal(null)} />}
      {modal === 'procurement' && <ProcurementModal onClose={closeProcurement} />}
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
