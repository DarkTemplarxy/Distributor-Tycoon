import { useEffect, useRef, useState } from 'react';
import { useGame } from './state/GameProvider';
import { STEP, tutorialPausesGame } from './game/tutorial';
import { TopBar } from './components/TopBar';
import { Modal } from './components/Modal';
import { IsometricWarehouse, type BuildTool } from './components/IsometricWarehouse';
import { BuildBar } from './components/BuildBar';
import { OrdersPanel } from './components/OrdersPanel';
import { ActionBar } from './components/ActionBar';
import { buildShelf, buildTable, buildInboundSlot, buildDesk, expandHall, expandOffice } from './game/actions';
import { Toasts } from './components/Toasts';
import { TutorialLayer } from './components/TutorialLayer';
import { MilestoneLayer } from './components/MilestoneLayer';
import { GameOverScreen, YearCompleteScreen } from './components/OverlayScreens';
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
import { NotebookModal } from './components/modals/NotebookModal';
import { HelpModal } from './components/modals/HelpModal';

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
  | 'notebook'
  | 'help'
  | null;

export function App() {
  const { state, mutate, togglePause, setPaused, newGame } = useGame();
  const [modal, setModal] = useState<ModalId>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [buildMode, setBuildMode] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool | null>(null);
  // One-time "uncle left you his notebook" intro, shown when the tutorial ends
  // (before the help recap, never stacked on top of it).
  const [notebookIntro, setNotebookIntro] = useState(false);

  // --- Auto-pause on decision windows (Entscheidungen R2) ---
  // Opening ANY modal, the build mode or the restart dialog pauses the game;
  // closing the last of them restores the previous state — if the game was
  // already paused manually before, it stays paused. Info views (Reports, Log,
  // Notizbuch, Inventar) pause too, deliberately: consistent is simpler.
  const uiOpenRef = useRef(false);
  const pausedBeforeUiRef = useRef(false);
  const openUi = () => {
    if (!uiOpenRef.current) {
      uiOpenRef.current = true;
      pausedBeforeUiRef.current = state.paused;
      setPaused(true);
    }
  };
  const closeUi = () => {
    if (!uiOpenRef.current) return;
    uiOpenRef.current = false;
    // Never restart the clock behind a tutorial story overlay or an end screen,
    // and never when the game was already paused before the window opened.
    if (
      !pausedBeforeUiRef.current &&
      !tutorialPausesGame(state.tutorial) &&
      !state.gameOver &&
      !state.yearComplete
    ) {
      setPaused(false);
    }
  };

  // Opening a modal leaves build mode; entering build mode closes any modal.
  const openModal = (id: ModalId) => {
    setBuildMode(false);
    setBuildTool(null);
    setModal(id);
    openUi();
  };
  const closeModal = () => {
    setModal(null);
    closeUi();
  };
  const enterBuild = () => {
    setModal(null);
    setBuildMode(true);
    openUi();
  };
  const exitBuild = () => {
    setBuildMode(false);
    setBuildTool(null);
    closeUi();
  };
  const openRestart = () => {
    setRestartOpen(true);
    openUi();
  };
  const cancelRestart = () => {
    setRestartOpen(false);
    closeUi();
  };

  const doRestart = () => {
    newGame();
    setRestartOpen(false);
    setModal(null);
    // Fresh game owns its pause state (tutorial intro) — drop any UI capture.
    uiOpenRef.current = false;
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

  // When the tutorial finishes by COMPLETION (last step MONTH → null), introduce
  // the uncle's notebook once; its button then opens the help recap. A skip (from
  // INTRO) does neither. The step is mutated in place, so we track the primitive.
  const prevTutStepRef = useRef<number | null>(state.tutorial?.active ? state.tutorial.step : null);
  useEffect(() => {
    const now = state.tutorial?.active ? state.tutorial.step : null;
    if (prevTutStepRef.current === STEP.MONTH && now === null) {
      setNotebookIntro(true);
      openUi(); // the intro + following help recap count as one UI window
    }
    prevTutStepRef.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tutorial?.active, state.tutorial?.step]);

  // Whenever the simulation raises pendingOrderWeek (Saturday without Einkäufer,
  // or the tutorial's ordering beat), open the weekly order screen — the generic
  // auto-pause captures the running state and closing restores it.
  useEffect(() => {
    if (state.pendingOrderWeek != null && !state.gameOver && !state.yearComplete) {
      openModal('procurement');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingOrderWeek, state.gameOver, state.yearComplete]);

  // Closing the weekly order screen: clear any pending prompt (a skipped week),
  // then restore the pre-open pause state like every other decision window.
  const closeProcurement = () => {
    if (state.pendingOrderWeek != null) mutate((s) => { s.pendingOrderWeek = null; });
    closeModal();
  };

  return (
    <div className="app">
      <TopBar onRestart={openRestart} onHelp={() => openModal('help')} />

      <div className={`main${state.settings.ordersPanelCollapsed ? ' orders-collapsed' : ''}`}>
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
                        else if (buildTool === 'desk') buildDesk(s, gx, gy);
                      }),
                    onExpand: (block) =>
                      mutate((s) => {
                        if (buildTool === 'officeExpand') expandOffice(s, block);
                        else expandHall(s, block);
                      }),
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
      <TutorialLayer />
      <MilestoneLayer />

      {modal === 'inventory' && <InventoryModal onClose={closeModal} />}
      {modal === 'sortiment' && <SortimentModal onClose={closeModal} />}
      {modal === 'procurement' && <ProcurementModal onClose={closeProcurement} />}
      {modal === 'pricing' && <PricingModal onClose={closeModal} />}
      {modal === 'customers' && <CustomersModal onClose={closeModal} />}
      {modal === 'inquiries' && <InquiriesModal onClose={closeModal} />}
      {modal === 'employees' && <EmployeesModal onClose={closeModal} />}
      {modal === 'finance' && <FinanceModal onClose={closeModal} />}
      {modal === 'reports' && <ReportsModal onClose={closeModal} />}
      {modal === 'log' && <LogModal onClose={closeModal} />}
      {modal === 'notebook' && <NotebookModal onClose={closeModal} />}
      {modal === 'help' && <HelpModal onClose={closeModal} />}

      {state.yearComplete && <YearCompleteScreen onRestart={openRestart} />}
      {state.gameOver && <GameOverScreen />}

      {notebookIntro && (
        <div className="overlay-screen">
          <div className="overlay-card">
            <div className="big-emoji">📓</div>
            <h1>Onkels Notizbuch</h1>
            <p style={{ maxWidth: 460, margin: '10px auto' }}>
              „Er hat dir auch sein Notizbuch dagelassen. Darin ein paar Ziele, die er sich immer
              vorgenommen hatte – nicht alle hat er geschafft. Von jetzt an findest du sie unten
              unter <b>📓 Notizbuch</b>. Immer eins nach dem anderen."
            </p>
            <button
              className="btn primary"
              style={{ fontSize: 15, padding: '10px 22px', marginTop: 6 }}
              onClick={() => {
                setNotebookIntro(false);
                setModal('help');
              }}
            >
              Alles klar ▶
            </button>
          </div>
        </div>
      )}

      {restartOpen && (
        <Modal title="Neues Spiel starten?" icon="🔄" top onClose={cancelRestart}>
          <p className="hint">
            Der aktuelle Fortschritt geht dabei verloren und kann nicht wiederhergestellt werden.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn ghost" onClick={cancelRestart}>
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
