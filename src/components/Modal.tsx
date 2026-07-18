import { useEffect, type ReactNode } from 'react';

export function Modal({
  title,
  icon,
  onClose,
  children,
  wide,
  top,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Render ABOVE the overlay screens (z 80 > 70) — for dialogs that must stay
   * reachable while a story overlay (Jahresbilanz/Game Over) is showing, like
   * the restart confirmation. Normal modals stay below the overlays. */
  top?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`modal-overlay${top ? ' top' : ''}`} onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
