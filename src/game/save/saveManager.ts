// ============================================================================
// saveManager — the single entry point for all game-state persistence. Nothing
// else in the app reads or writes storage directly. It delegates to a swappable
// StorageBackend chosen by isDesktop(); the GameState is plain JSON, so saving is
// just a stringify and loading a parse + version check.
// ============================================================================

import { SAVE_KEY, SAVE_VERSION } from '../constants';
import type { GameState } from '../types';
import type { StorageBackend } from './StorageBackend';
import { BrowserStorage } from './BrowserStorage';
import { DesktopStorage } from './DesktopStorage';

/**
 * The one switch that selects the storage medium. V1 always uses the browser;
 * for a desktop build, fill in DesktopStorage and make this return true (e.g.
 * detect the Electron/Tauri shell). Nothing else needs to change.
 */
export function isDesktop(): boolean {
  return false;
}

const backend: StorageBackend = isDesktop() ? DesktopStorage : BrowserStorage;

/** Persist the whole game state (plain JSON). */
export function save(state: GameState): void {
  backend.write(SAVE_KEY, JSON.stringify(state));
}

/**
 * Load the saved game, or null if there is none / it can't be parsed / it is
 * from an incompatible version. Loaded games always start paused.
 */
export function load(): GameState | null {
  const raw = backend.read(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== SAVE_VERSION) {
      console.warn('Alter Spielstand verworfen (Version).');
      return null;
    }
    // Don't drop the player straight into a running simulation.
    parsed.paused = true;
    return parsed;
  } catch (err) {
    console.warn('Laden fehlgeschlagen:', err);
    return null;
  }
}

/** Whether a saved game is present. */
export function hasSave(): boolean {
  return backend.exists(SAVE_KEY);
}

/** Delete the saved game. */
export function deleteSave(): void {
  backend.remove(SAVE_KEY);
}
