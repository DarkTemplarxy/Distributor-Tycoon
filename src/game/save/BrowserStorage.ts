// ============================================================================
// Browser storage backend — the only place in the app that touches localStorage.
// Active in the web build (V1). All access is wrapped in try/catch so a full or
// unavailable store (e.g. private mode) fails quietly instead of crashing.
// ============================================================================

import type { StorageBackend } from './StorageBackend';

export const BrowserStorage: StorageBackend = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      // Storage might be full or unavailable — fail quietly.
      console.warn('Speichern fehlgeschlagen:', err);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  exists(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  },
};
