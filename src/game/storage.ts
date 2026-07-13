// ============================================================================
// localStorage persistence. The entire GameState is plain JSON, so saving is
// a single stringify. We keep a version so future saves can be migrated.
// ============================================================================

import { SAVE_KEY, SAVE_VERSION } from './constants';
import { createInitialState } from './init';
import type { GameState } from './types';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    // Storage might be full or unavailable (private mode) — fail quietly.
    console.warn('Speichern fehlgeschlagen:', err);
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== SAVE_VERSION) {
      // Incompatible save — discard rather than crash.
      console.warn('Alter Spielstand verworfen (Version).');
      return null;
    }
    // Always resume paused so the player isn't dropped straight into a running sim.
    parsed.paused = true;
    return parsed;
  } catch (err) {
    console.warn('Laden fehlgeschlagen:', err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadOrCreate(): GameState {
  return loadGame() ?? createInitialState();
}
