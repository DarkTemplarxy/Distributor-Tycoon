import { useEffect, useRef, useState } from 'react';
import { useGame } from './state/GameProvider';
import { isFeatureUnlocked, STEP, tutorialPausesGame } from './game/tutorial';
import { TopBar } from './components/TopBar';
import { Modal } from './components/Modal';
import { IsometricWarehouse, type BuildTool } from './components/IsometricWarehouse';
import { BuildBar } from './components/BuildBar';
import { OpsCockpit } from './components/OpsCockpit';
import { OrdersPanel } from './components/OrdersPanel';
import { ActionBar } from './components/ActionBar';
import { buildCoolZone, buildShelf, buildTable, buildInboundSlot, buildDesk, demolishAt, expandHall, expandOffice } from './game/actions';
import { isInAssortment, notify } from './game/simulation';
import {
  LARGE_UNLOCK_MONTHLY,
  MEDIUM_UNLOCK_MONTHLY,
  monthlyRevenue,
  PRODUCT_DEFS,
} from './game/constants';
import { euro, weekOf } from './game/util';
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
import { CompanyModal } from './components/modals/CompanyModal';
import { FinanceModal } from './components/modals/FinanceModal';
import { ReportsModal } from './components/modals/ReportsModal';
import { LogModal } from './components/modals/LogModal';
import { NotebookModal } from './components/modals/NotebookModal';
import { HelpModal } from './components/modals/HelpModal';
import { WikiModal } from './components/modals/WikiModal';

export type ModalId =
  | 'inventory'
  | 'sortiment'
  | 'procurement'
  | 'pricing'
  | 'customers'
  | 'inquiries'
  | 'employees'
  | 'company'
  | 'finance'
  | 'reports'
  | 'log'
  | 'notebook'
  | 'help'
  | 'wiki'
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

  // One-time unlock roadmap ("Jetzt geht's los"): after the first full week —
  // or, for tutorial players, once the tutorial (and its intro/help chain) is
  // done — show WHAT is still locked and HOW to unlock it. Never stacked on
  // another window; if everything is already unlocked, mark it silently done.
  const [unlockIntro, setUnlockIntro] = useState(false);
  const week = weekOf(state.totalDays);
  useEffect(() => {
    if (unlockIntro || state.unlockIntroShown) return;
    if (state.tutorial !== null || state.gameOver || state.yearComplete) return;
    if (week < 1 || modal !== null || notebookIntro || buildMode || restartOpen) return;
    if ((state.celebrateMilestones ?? []).length > 0) return; // Feier zuerst
    const anythingLocked =
      PRODUCT_DEFS.some((d) => !isInAssortment(state, d.id)) ||
      monthlyRevenue(state) < LARGE_UNLOCK_MONTHLY;
    if (!anythingLocked) {
      mutate((s) => {
        s.unlockIntroShown = true;
      });
      return;
    }
    setUnlockIntro(true);
    openUi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, state.tutorial, state.gameOver, state.yearComplete, modal, notebookIntro, buildMode, restartOpen]);
  const closeUnlockIntro = () => {
    setUnlockIntro(false);
    mutate((s) => {
      s.unlockIntroShown = true;
    });
    closeUi();
  };

  // A demand inquiry (Wunsch/Ultimatum eines Bestandskunden, Wachstumsmotor B)
  // is a BLOCKING event: auto-open the inquiries screen so the decision can't
  // slip by — the generic auto-pause above holds the clock while it's open.
  const seenDemandIdsRef = useRef<Set<string>>(new Set());
  const openDemandKey = state.inquiries
    .filter((i) => i.status === 'open' && (i.demand || i.bigOrder))
    .map((i) => i.id)
    .join(',');
  useEffect(() => {
    const fresh = state.inquiries.filter(
      (i) => i.status === 'open' && (i.demand || i.bigOrder) && !seenDemandIdsRef.current.has(i.id),
    );
    if (fresh.length === 0) return;
    for (const i of fresh) seenDemandIdsRef.current.add(i.id);
    if (!state.gameOver && !state.yearComplete) openModal('inquiries');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDemandKey, state.gameOver, state.yearComplete]);

  return (
    <div className="app">
      <TopBar
        onRestart={openRestart}
        onHelp={() => openModal('help')}
        onWiki={() => openModal('wiki')}
      />

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
                        const r =
                          buildTool === 'shelf'
                            ? buildShelf(s, gx, gy)
                            : buildTool === 'table'
                              ? buildTable(s, gx, gy)
                              : buildTool === 'inbound'
                                ? buildInboundSlot(s, gx, gy)
                                : buildTool === 'desk'
                                  ? buildDesk(s, gx, gy)
                                  : buildTool === 'cool'
                                    ? buildCoolZone(s, gx, gy)
                                    : null;
                        // No silent refusal: surface why a placement failed.
                        if (r && !r.ok && r.message) notify(s, `⚠️ ${r.message}`, 'warn');
                      }),
                    onExpand: (block) =>
                      mutate((s) => {
                        if (buildTool === 'officeExpand') expandOffice(s, block);
                        else expandHall(s, block);
                      }),
                    onDemolish: (gx, gy) =>
                      mutate((s) => {
                        const r = demolishAt(s, gx, gy);
                        if (!r.ok && r.message) notify(s, `⚠️ ${r.message}`, 'warn');
                      }),
                  }
                : undefined
            }
            onOpenOffice={
              isFeatureUnlocked(state.tutorial, 'employees')
                ? () => openModal('employees')
                : undefined
            }
          />
          {!buildMode && isFeatureUnlocked(state.tutorial, 'build') && (
            <OpsCockpit onOpen={openModal} onBuild={enterBuild} />
          )}
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
      {modal === 'company' && <CompanyModal onClose={closeModal} />}
      {modal === 'finance' && <FinanceModal onClose={closeModal} />}
      {modal === 'reports' && <ReportsModal onClose={closeModal} />}
      {modal === 'log' && <LogModal onClose={closeModal} />}
      {modal === 'notebook' && <NotebookModal onClose={closeModal} />}
      {modal === 'help' && <HelpModal onClose={closeModal} />}
      {modal === 'wiki' && <WikiModal onClose={closeModal} />}

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

      {unlockIntro && (
        <div className="overlay-screen">
          <div className="overlay-card">
            <div className="big-emoji">🔓</div>
            <h1>Jetzt geht's los!</h1>
            <p style={{ maxWidth: 500, margin: '10px auto' }}>
              Das ist noch gesperrt – und so schaltest du es frei:
            </p>
            <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PRODUCT_DEFS.filter((d) => d.unlockWeek > 0).map((d) => {
                const listed = isInAssortment(state, d.id);
                return (
                  <div key={d.id} className="row" style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 20 }}>{d.emoji}</span>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 14 }}>{d.name}</div>
                      <div className="sub">
                        {listed
                          ? 'Bereits im Sortiment ✅'
                          : `Ab Woche ${d.unlockWeek + 1} im 🧺 Sortiment listbar (Gebühr ${euro(d.listingFee)}) – Bestandskunden fragen es irgendwann aktiv nach!`}
                      </div>
                    </div>
                    <span className="pill">{listed ? '✅' : week >= d.unlockWeek ? 'jetzt listbar' : `ab Woche ${d.unlockWeek + 1}`}</span>
                  </div>
                );
              })}
              <div className="row" style={{ padding: '8px 10px' }}>
                <span style={{ fontSize: 20 }}>🏨</span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 14 }}>Mittlere Kunden (Hotels, Kantinen)</div>
                  <div className="sub">
                    Fragen ab <b>{euro(MEDIUM_UNLOCK_MONTHLY)} Monatsumsatz</b> an (rollierende 4
                    Wochen, aktuell {euro(monthlyRevenue(state))}). Dahin: kleine Kunden über 📨
                    Anfragen gewinnen, Produktbreite listen, pünktlich liefern.
                  </div>
                </div>
                <span className="pill">{monthlyRevenue(state) >= MEDIUM_UNLOCK_MONTHLY ? '✅' : '🔒'}</span>
              </div>
              <div className="row" style={{ padding: '8px 10px' }}>
                <span style={{ fontSize: 20 }}>🏬</span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 14 }}>Große Kunden (Supermärkte)</div>
                  <div className="sub">
                    Fragen ab <b>{euro(LARGE_UNLOCK_MONTHLY)} Monatsumsatz</b> an – das
                    Langzeitziel.
                  </div>
                </div>
                <span className="pill">{monthlyRevenue(state) >= LARGE_UNLOCK_MONTHLY ? '✅' : '🔒'}</span>
              </div>
            </div>
            <p className="hint" style={{ maxWidth: 500, margin: '10px auto 0' }}>
              Den Fortschritt siehst du jederzeit in 📨 Anfragen; alle Regeln stehen im 📖 Handbuch
              (Kopfleiste).
            </p>
            <button
              className="btn primary"
              style={{ fontSize: 15, padding: '10px 22px', marginTop: 10 }}
              onClick={closeUnlockIntro}
            >
              Los geht's ▶
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
