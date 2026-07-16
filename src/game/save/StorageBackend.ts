// ============================================================================
// Storage backend abstraction. The saveManager talks only to this interface, so
// the underlying medium (browser localStorage, desktop filesystem, …) can be
// swapped without touching the rest of the game.
// ============================================================================

export interface StorageBackend {
  /** Return the stored string for `key`, or null if absent/unreadable. */
  read(key: string): string | null;
  /** Persist `value` under `key`. Should fail quietly (never throw). */
  write(key: string, value: string): void;
  /** Remove `key` if present. Should fail quietly. */
  remove(key: string): void;
  /** Whether a value is currently stored under `key`. */
  exists(key: string): boolean;
}
