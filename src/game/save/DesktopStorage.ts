// ============================================================================
// Desktop storage backend — filesystem persistence for an Electron/Tauri build.
//
// STUB (V1): not implemented yet and never selected (isDesktop() returns false).
// To enable the desktop port later, only two things are needed:
//   1. Fill in the methods below (read/write/remove/exists) against the desktop
//      shell's file API — e.g. a JSON save file in the app's data directory
//      (Tauri: @tauri-apps/api/fs + appDataDir; Electron: fs + app.getPath).
//   2. Flip isDesktop() in ./saveManager.ts.
// No other code changes are required.
// ============================================================================

import type { StorageBackend } from './StorageBackend';

export const DesktopStorage: StorageBackend = {
  read(_key) {
    // TODO(desktop): read the save file and return its contents (or null).
    return null;
  },
  write(_key, _value) {
    // TODO(desktop): write `value` to the save file.
  },
  remove(_key) {
    // TODO(desktop): delete the save file.
  },
  exists(_key) {
    // TODO(desktop): return whether the save file exists.
    return false;
  },
};
