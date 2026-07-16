import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../state/GameProvider';
import { finishTutorial, tutorialContinueFromCelebrate } from '../game/simulation';
import { STEP } from '../game/tutorial';
import { euro } from '../game/util';

// The starter order that pays the first cash reward (see makeStartingOrders in
// init.ts: 30 × 33,50 €).
const STARTER_REWARD = 30 * 33.5;

/** A short-lived burst of falling confetti pieces (pure CSS animation). */
function Confetti() {
  const colors = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#f78c6b', '#c4f1be'];
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.4,
        color: colors[i % colors.length],
        rot: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Number that animates up to `to` over ~1.1s — the cash-in dopamine moment. */
function CountUp({ to }: { to: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{euro(val)}</>;
}

const COACH: Record<number, { emoji: string; text: ReactNode }> = {
  [STEP.HERRICHTEN]: {
    emoji: '🫱',
    text: (
      <>
        Dein erster Auftrag wartet! Drücke rechts bei <b>Pizza Giuseppe</b> auf{' '}
        <b>👷 Herrichten</b> – deine Mitarbeiter machen die Palette fertig.
      </>
    ),
  },
  [STEP.GROWTH]: {
    emoji: '📨',
    text: (
      <>
        Ein neuer Kunde interessiert sich für dich! Öffne unten <b>Anfragen</b> und mach ihm ein{' '}
        <b>Angebot</b> – so wächst dein Geschäft.
      </>
    ),
  },
  [STEP.ORDER]: {
    emoji: '🛒',
    text: (
      <>
        Deine Ware wird knapp. Bestätige im <b>Einkaufsfenster</b> die empfohlene Bestellmenge –
        die Lieferung kommt nächsten Montag.
      </>
    ),
  },
  [STEP.CAPACITY]: {
    emoji: '📦',
    text: (
      <>
        Die Aufträge stauen sich beim Herrichten. Kauf über <b>🏗️ Bauen</b> einen
        Vorbereitungstisch oder stell über <b>Personal</b> jemanden ein.
      </>
    ),
  },
};

export function TutorialLayer() {
  const { state, mutate, setPaused } = useGame();
  const [dismissed, setDismissed] = useState<number | null>(null);
  const t = state.tutorial;
  if (!t || !t.active) return null;
  const step = t.step;

  // ---- INTRO: uncle hands over the business ----
  if (step === STEP.INTRO) {
    const start = () => {
      mutate((s) => {
        if (s.tutorial) s.tutorial.step = STEP.HERRICHTEN;
      });
      setPaused(false);
    };
    const skip = () => {
      mutate((s) => {
        finishTutorial(s);
        s.settings.autoPrep = true;
      });
      setPaused(false);
    };
    return (
      <div className="overlay-screen">
        <div className="overlay-card">
          <div className="big-emoji">👴</div>
          <h1>Der Onkel</h1>
          <p style={{ maxWidth: 460, margin: '10px auto' }}>
            „Mein Junge, ich übergebe dir meine kleine Distributionsfirma: <b>2 langjährige
            Mitarbeiter</b>, <b>2 kleine Stammkunden</b> und etwas Ware im Lager. Ich hab dir für
            alles eine Anleitung dagelassen – fangen wir an."
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn primary" style={{ fontSize: 15, padding: '10px 22px' }} onClick={start}>
              ▶ Los geht's
            </button>
            <button className="btn ghost" onClick={skip}>
              Tutorial überspringen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- CELEBRATE: first delivery paid in cash ----
  if (step === STEP.CELEBRATE) {
    const next = () => {
      mutate((s) => tutorialContinueFromCelebrate(s));
      setPaused(false);
    };
    return (
      <div className="overlay-screen">
        <Confetti />
        <div className="overlay-card" style={{ position: 'relative', zIndex: 1 }}>
          <div className="big-emoji">🍕</div>
          <h1>Erste Lieferung!</h1>
          <p style={{ maxWidth: 420, margin: '8px auto' }}>
            <b>Pizza Giuseppe:</b> „Danke für die schnelle Lieferung! Hier hast du direkt dein
            Geld."
          </p>
          <div className="cash-pop">
            <CountUp to={STARTER_REWARD} /> <span>bar erhalten</span>
          </div>
          <p className="hint" style={{ maxWidth: 420, margin: '10px auto' }}>
            💡 Kleine Kunden zahlen <b>sofort bar</b> bei Abholung – so wächst deine Kasse mit
            jeder Lieferung.
          </p>
          <button className="btn primary" style={{ fontSize: 15, padding: '10px 22px' }} onClick={next}>
            Weiter ▶
          </button>
        </div>
      </div>
    );
  }

  // ---- MONTH: first monthly statement, then the tutorial ends ----
  if (step === STEP.MONTH) {
    const monthReports = state.reports.slice(0, 4);
    const rev = monthReports.reduce((s, r) => s + r.revenue, 0);
    const profit = monthReports.reduce((s, r) => s + r.profit, 0);
    const done = () => {
      mutate((s) => finishTutorial(s));
      setPaused(false);
    };
    return (
      <div className="overlay-screen">
        <div className="overlay-card">
          <div className="big-emoji">🗓️</div>
          <h1>Erster Monat geschafft!</h1>
          <p style={{ maxWidth: 460, margin: '6px auto' }}>
            Deine erste Monatsabrechnung. <b>Personal &amp; Miete</b> werden am Monatsende{' '}
            <b>gesammelt</b> abgebucht – der Wochenreport hat sie vorher nur anteilig
            zurückgestellt.
          </p>
          <div className="report-grid" style={{ textAlign: 'left' }}>
            <div className="stat-box">
              <div className="k">Monatsumsatz</div>
              <div className="v">{euro(rev)}</div>
            </div>
            <div className="stat-box">
              <div className="k">Monatsgewinn</div>
              <div className="v" style={{ color: profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{euro(profit)}</div>
            </div>
            <div className="stat-box">
              <div className="k">Kasse</div>
              <div className="v" style={{ color: state.cash >= 0 ? 'var(--cash)' : 'var(--bad)' }}>{euro(state.cash)}</div>
            </div>
          </div>
          <button className="btn primary" style={{ fontSize: 15, padding: '10px 22px', marginTop: 6 }} onClick={done}>
            Ab jetzt läuft dein Geschäft – viel Erfolg! ▶
          </button>
        </div>
      </div>
    );
  }

  // ---- Coach cards for the interactive beats ----
  const coach = COACH[step];
  if (coach && dismissed !== step) {
    return (
      <div className="coach-card">
        <span className="coach-emoji">{coach.emoji}</span>
        <div className="coach-text">{coach.text}</div>
        <button className="btn ghost small" onClick={() => setDismissed(step)}>
          Verstanden
        </button>
      </div>
    );
  }

  return null;
}
