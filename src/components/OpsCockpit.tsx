import { useGame } from '../state/GameProvider';
import { opsStatus, type OpsGauge, type OpsLevel } from '../game/simulation';
import type { ModalId } from '../App';

const LEVEL_COLOR: Record<OpsLevel, string> = {
  ok: 'var(--good)',
  warn: 'var(--warn)',
  crit: 'var(--bad)',
};

/**
 * Always-on operations dashboard overlaid at the top of the scene: at a glance
 * you see whether staff, storage, customer slots and liquidity can keep up —
 * and a warning fires BEFORE a bottleneck bites. Each chip jumps to the screen
 * where you'd act on it. Hidden in build mode (the BuildBar owns that space).
 */
export function OpsCockpit({
  onOpen,
  onBuild,
}: {
  onOpen: (m: ModalId) => void;
  onBuild: () => void;
}) {
  const { state } = useGame();
  const { gauges, worst, alerts } = opsStatus(state);

  const go = (g: OpsGauge) => {
    if (g.target === 'build') onBuild();
    else onOpen(g.target);
  };

  return (
    <div
      className="ops-cockpit"
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', pointerEvents: 'auto' }}>
        {gauges.map((g) => {
          const color = LEVEL_COLOR[g.level];
          const alert = g.level !== 'ok';
          return (
            <button
              key={g.key}
              className="ops-chip"
              onClick={() => go(g)}
              title={`${g.label}: ${g.detail}${g.hint ? `\n→ ${g.hint}` : ''}\n\n(Klick öffnet den passenden Bereich)`}
              style={{
                flex: '1 1 130px',
                minWidth: 120,
                textAlign: 'left',
                padding: '6px 9px',
                borderRadius: 9,
                background: '#0e141b',
                border: `1px solid ${alert ? color : 'rgba(255,255,255,0.12)'}`,
                boxShadow: g.level === 'crit' ? `0 0 0 1px ${color}, 0 0 10px -2px ${color}` : 'none',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>{g.icon}</span>
                <span style={{ fontSize: 11, opacity: 0.85, flex: 1 }}>{g.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: alert ? color : 'var(--text)' }}>
                  {g.value}
                </span>
              </div>
              <div
                style={{
                  marginTop: 5,
                  height: 4,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.10)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(g.fill * 100)}%`,
                    height: '100%',
                    background: color,
                    transition: 'width 240ms ease',
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {worst !== 'ok' && alerts.length > 0 && (
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px',
            borderRadius: 9,
            background: '#0e141b',
            border: `1px solid ${LEVEL_COLOR[worst]}`,
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          <span>{worst === 'crit' ? '⚠️' : '💡'}</span>
          <span style={{ opacity: 0.92 }}>{alerts[0].text}</span>
          {alerts.length > 1 && (
            <span style={{ opacity: 0.6, marginLeft: 'auto', fontSize: 11 }}>
              +{alerts.length - 1} weitere{alerts.length - 1 === 1 ? 'r' : ''} Hinweis
              {alerts.length - 1 === 1 ? '' : 'e'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
