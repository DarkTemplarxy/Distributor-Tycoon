import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/GameProvider';
import type { Notification } from '../game/types';

const TOAST_MS = 4500;

export function Toasts() {
  const { state } = useGame();
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const notes = state.notifications;
  const lastId = notes.length > 0 ? notes[notes.length - 1].id : '';

  useEffect(() => {
    const unseen = notes.filter((n) => !seenRef.current.has(n.id));
    if (unseen.length === 0) return;
    // At high speed many events fire at once — surface only the most recent few.
    const toAdd = unseen.slice(-3);
    setToasts((prev) => [...prev, ...toAdd].slice(-4));
    const timers = toAdd.map((n) =>
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), TOAST_MS),
    );
    // Bound the "seen" set to what's currently relevant.
    seenRef.current = new Set(notes.map((n) => n.id));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

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
