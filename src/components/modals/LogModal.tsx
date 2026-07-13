import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';

const COLOR = {
  info: 'var(--accent)',
  success: 'var(--good)',
  warn: 'var(--warn)',
  error: 'var(--bad)',
} as const;

export function LogModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const notes = [...state.notifications].reverse();

  return (
    <Modal title="Ereignis-Log" icon="📜" onClose={onClose}>
      {notes.length === 0 && <div className="empty">Noch keine Ereignisse.</div>}
      <div className="rows">
        {notes.map((n) => (
          <div
            key={n.id}
            className="row"
            style={{ padding: '8px 10px', borderLeft: `3px solid ${COLOR[n.type]}` }}
          >
            <span className="pill" style={{ width: 54, textAlign: 'center' }}>
              W{n.week}
            </span>
            <div className="grow" style={{ fontSize: 13 }}>
              {n.message}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
