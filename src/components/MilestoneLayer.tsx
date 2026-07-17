import { useEffect } from 'react';
import { useGame } from '../state/GameProvider';
import { getMilestoneDef } from '../game/constants';
import { Confetti } from './TutorialLayer';

/**
 * Celebration overlay for a just-achieved milestone ("Onkels Notizbuch"). Reuses
 * the tutorial's confetti + overlay-card look. checkMilestones queues the id (it
 * does NOT pause — this layer owns the pause, so a headless run never wedges); the
 * player reads the uncle's note and clicks "Weiter", which pops the queue and
 * resumes once it's empty (several achieved on one tick show one after another).
 */
export function MilestoneLayer() {
  const { state, mutate, setPaused } = useGame();
  const queue = state.celebrateMilestones;
  const showing = !!queue && queue.length > 0 && !state.gameOver && !state.yearComplete;

  // Pause while a celebration is on screen; the "Weiter" handler resumes when the
  // queue drains. Effect (not a sim-side pause) so only the real UI pauses.
  useEffect(() => {
    if (showing) setPaused(true);
  }, [showing, setPaused]);

  if (!showing) return null;

  const def = getMilestoneDef(queue![0]);
  // Unknown id (e.g. a definition removed in a later version) — drop it silently.
  if (!def) {
    mutate((s) => {
      s.celebrateMilestones?.shift();
    });
    return null;
  }

  const achievedWeek = state.milestones.find((m) => m.id === def.id)?.achievedWeek;

  const next = () => {
    mutate((s) => {
      s.celebrateMilestones?.shift();
    });
    // Resume the clock only once the whole queue is done.
    if (queue!.length <= 1) setPaused(false);
  };

  return (
    <div className="overlay-screen">
      <Confetti />
      <div className="overlay-card" style={{ position: 'relative', zIndex: 1 }}>
        <div className="big-emoji">{def.emoji}</div>
        <div className="pill good" style={{ margin: '0 auto 6px', display: 'inline-block' }}>
          📓 Meilenstein{achievedWeek != null ? ` · Woche ${achievedWeek}` : ''}
        </div>
        <h1 style={{ margin: '4px 0' }}>{def.title}</h1>
        <p style={{ maxWidth: 440, margin: '10px auto', fontStyle: 'italic' }}>
          👴 „{def.uncleComment}"
        </p>
        <button
          className="btn primary"
          style={{ fontSize: 15, padding: '10px 22px', marginTop: 6 }}
          onClick={next}
        >
          Weiter ▶
        </button>
      </div>
    </div>
  );
}
