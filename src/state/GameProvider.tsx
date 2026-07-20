// ============================================================================
// GameProvider owns the authoritative game state (in a ref) and drives the
// simulation with a requestAnimationFrame loop. UI re-renders are throttled so
// a 60fps sim doesn't force 60fps React renders. Actions mutate the ref and
// request an immediate render.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { GameState, Speed } from '../game/types';
import { advance, computeYearStats } from '../game/simulation';
import { runSiteManagers, runLogistikleiter } from '../game/actions';
import { createInitialState } from '../game/init';
import { tutorialPausesGame } from '../game/tutorial';
import { deleteSave, load, save } from '../game/save/saveManager';
import { weekOf, yearOf } from '../game/util';

interface GameContextValue {
  state: GameState;
  /** Force a re-render after mutating state directly via an action. */
  mutate: (fn: (s: GameState) => void) => void;
  setSpeed: (speed: Speed) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  newGame: () => void;
  continueYear: () => void;
  saveNow: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const RENDER_INTERVAL_MS = 90; // ~11 fps UI updates
const AUTOSAVE_INTERVAL_MS = 4000;

export function GameProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<GameState>(load() ?? createInitialState());
  const [, forceRender] = useState(0);
  const render = useCallback(() => forceRender((n) => n + 1), []);

  const lastFrameRef = useRef<number>(performance.now());
  const lastRenderRef = useRef<number>(0);
  const lastSaveRef = useRef<number>(performance.now());

  useEffect(() => {
    // A setInterval ticker drives the simulation from wall-clock deltas. This is
    // more robust than requestAnimationFrame, which stalls on hidden/offscreen
    // pages (and never fires for headless browsers). advance() caps the delta so
    // a long gap between ticks can't skip events.
    const TICK_MS = 60;
    lastFrameRef.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;

      const st = stateRef.current;
      if (!st.paused && !st.gameOver && !st.yearComplete) {
        advance(st, dt);
        // Delegated sites run themselves headlessly each tick (Konzern-Delegation),
        // regardless of which site is on screen — no-op unless a Standortleiter is set.
        runSiteManagers(st);
        // Logistikleiter disponiert Waren-Transfers automatisch übers Verteilzentrum
        // (no-op ohne Hub + Logistikleiter).
        runLogistikleiter(st);
      }

      if (now - lastRenderRef.current >= RENDER_INTERVAL_MS) {
        lastRenderRef.current = now;
        render();
      }
      if (now - lastSaveRef.current >= AUTOSAVE_INTERVAL_MS) {
        lastSaveRef.current = now;
        save(st);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [render]);

  // Save on tab hide / unload so nothing is lost.
  useEffect(() => {
    const handler = () => save(stateRef.current);
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, []);

  const mutate = useCallback(
    (fn: (s: GameState) => void) => {
      fn(stateRef.current);
      render();
    },
    [render],
  );

  const setSpeed = useCallback(
    (speed: Speed) => mutate((s) => {
      s.speed = speed;
      // Speed buttons also unpause — but never behind a tutorial story overlay,
      // where the sim running unseen could invalidate the guided sequence.
      if (!tutorialPausesGame(s.tutorial)) s.paused = false;
    }),
    [mutate],
  );

  const togglePause = useCallback(
    () => mutate((s) => {
      if (s.gameOver || s.yearComplete) return;
      // Tutorial story overlays (intro/celebration/month) own the pause state;
      // Space or the pause button must not restart the clock behind them.
      if (tutorialPausesGame(s.tutorial)) return;
      s.paused = !s.paused;
    }),
    [mutate],
  );

  const setPaused = useCallback((paused: boolean) => mutate((s) => {
    s.paused = paused;
  }), [mutate]);

  const newGame = useCallback(() => {
    deleteSave();
    stateRef.current = createInitialState();
    save(stateRef.current);
    render();
  }, [render]);

  const continueYear = useCallback(() => {
    mutate((s) => {
      // Remember the year that just ended as next year's comparison base ("beat
      // yourself"). Done here (not at the boundary) so the balance screen still
      // compares against the PREVIOUS year while it's shown.
      const completedYearIndex = yearOf(weekOf(s.totalDays)) - 1;
      s.lastYearStats = computeYearStats(s, completedYearIndex);
      s.yearComplete = false;
      s.paused = true;
    });
  }, [mutate]);

  const saveNow = useCallback(() => save(stateRef.current), []);

  // A FRESH value object is created on every render on purpose. The render pump
  // (forceRender) re-renders this provider ~11x/sec; because this object's
  // identity changes each time, every useGame() consumer re-renders and reads
  // the latest (mutated-in-place) state. Memoizing it would freeze the UI even
  // though the simulation keeps running. The callbacks themselves stay stable.
  const value: GameContextValue = {
    state: stateRef.current,
    mutate,
    setSpeed,
    togglePause,
    setPaused,
    newGame,
    continueYear,
    saveNow,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
