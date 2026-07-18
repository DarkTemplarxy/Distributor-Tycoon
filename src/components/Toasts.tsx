import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/GameProvider';
import type { Notification } from '../game/types';

const TOAST_MS = 4500;
/** Max toasts visible at once (Notification-Diät) — older ones slide into the
 * log, which stays complete. */
const MAX_VISIBLE = 3;

export function Toasts() {
  const { state } = useGame();
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const notes = state.notifications;
  // A key that changes when a NEW event arrives OR an aggregated entry merges
  // another event (its count bumps) — both should (re-)surface a toast.
  const seenKey = (n: Notification) => `${n.id}:${n.count ?? 1}`;
  const last = notes.length > 0 ? seenKey(notes[notes.length - 1]) : '';

  useEffect(() => {
    // 'log'-channel entries never toast; merged aggregates re-toast once per merge.
    const unseen = notes.filter((n) => n.channel !== 'log' && !seenRef.current.has(seenKey(n)));
    if (unseen.length === 0) return;
    const toAdd = unseen.slice(-MAX_VISIBLE);
    setToasts((prev) => [
      // An updated aggregate replaces its previous toast instead of stacking.
      ...prev.filter((p) => !toAdd.some((n) => n.id === p.id)),
      ...toAdd,
    ].slice(-MAX_VISIBLE));
    const timers = toAdd.map((n) =>
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), TOAST_MS),
    );
    // Bound the "seen" set to what's currently relevant.
    seenRef.current = new Set(notes.map(seenKey));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  // Click a toast to dismiss it early (the pending auto-dismiss timer then simply
  // finds nothing to remove).
  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type}`}
          onClick={() => dismiss(t.id)}
          title="Zum Ausblenden klicken"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
