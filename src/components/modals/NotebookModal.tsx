import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { MILESTONE_DEFS } from '../../game/constants';

export function NotebookModal({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const achievedCount = state.milestones.filter((m) => m.achievedWeek != null).length;
  // The next open goal (first in ascending order not yet achieved) is highlighted.
  const nextOpenId = MILESTONE_DEFS.find(
    (d) => state.milestones.find((m) => m.id === d.id)?.achievedWeek == null,
  )?.id;

  return (
    <Modal title="Onkels Notizbuch" icon="📓" onClose={onClose} wide>
      <p className="hint">
        „Ein paar Ziele, die ich mir selbst immer vorgenommen hatte. Nicht alle hab ich geschafft –
        vielleicht schaffst ja du sie." Erreicht: <b>{achievedCount}/{MILESTONE_DEFS.length}</b>.
      </p>
      <div className="rows">
        {MILESTONE_DEFS.map((def) => {
          const achievedWeek = state.milestones.find((m) => m.id === def.id)?.achievedWeek ?? null;
          const done = achievedWeek != null;
          const isNext = def.id === nextOpenId;
          return (
            <div
              key={def.id}
              className="row"
              style={{
                opacity: done ? 0.72 : 1,
                outline: isNext ? '2px solid var(--accent)' : undefined,
                borderRadius: isNext ? 8 : undefined,
              }}
            >
              <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>
                {done ? '✅' : def.emoji}
              </span>
              <div className="grow">
                <div className="title" style={{ textDecoration: done ? 'line-through' : undefined }}>
                  {def.title}
                  {isNext && <span className="pill" style={{ marginLeft: 8 }}>Nächstes Ziel</span>}
                </div>
                <div className="sub">{done ? def.uncleComment : def.description}</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                {done ? (
                  <span className="pill good">Woche {achievedWeek}</span>
                ) : (
                  <span className="pill">offen</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
