import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../state/GameProvider';
import { finishTutorial, isInAssortment, tutorialContinueFromCelebrate } from '../game/simulation';
import { STEP, TUTORIAL_INQUIRY_IDS, TUTORIAL_MEAT_INQUIRY_ID } from '../game/tutorial';
import { euro } from '../game/util';

// Fallback for saves from before celebrateAmount was recorded (the starter
// order in init.ts: 30 × 33,50 €). Normally the real paid amount is stored on
// the tutorial state by truckPickup when the celebration triggers.
const STARTER_REWARD_FALLBACK = 30 * 33.5;

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
        Dein erster Auftrag wartet! Drücke rechts bei <b>Pizza Giuseppe</b> auf den leuchtenden{' '}
        <b>👷 Herrichten</b>-Button – deine Mitarbeiter machen die Palette fertig.
      </>
    ),
  },
  [STEP.REWARD]: {
    emoji: '📦',
    text: (
      <>
        Deine Mitarbeiter arbeiten von <b>6–20 Uhr</b>. Ist die Palette fertig, holt sie der{' '}
        <b>LKW täglich um 18:00</b> ab. ⏩ Beschleunige die Zeit und warte auf den LKW – nachts
        (20–6 Uhr) läuft die Zeit automatisch im Schnellvorlauf.
      </>
    ),
  },
  [STEP.GROWTH]: {
    emoji: '📨',
    text: (
      <>
        Dein Onkel hat dir <b>2 Anfragen</b> hinterlassen! Öffne unten <b>Anfragen</b>: Nimm die{' '}
        <b>erste an</b> und schick bei der <b>zweiten</b> ein <b>Gegenangebot</b> mit höherem
        Preis.
      </>
    ),
  },
  [STEP.ORDER]: {
    emoji: '🛒',
    text: (
      <>
        Deine Ware wird knapp. Am <b>Samstag</b> öffnet der <b>Wocheneinkauf</b> – bestelle
        dann genug, um die <b>fixe Nachfrage</b> der nächsten Woche zu decken (Lieferung am
        Montag).
      </>
    ),
  },
  [STEP.CAPACITY]: {
    emoji: '📊',
    text: (
      <>
        Dein erster Monat läuft – gleich kommt die Abrechnung. Dein Lager kannst du{' '}
        <b>jederzeit</b> über <b>🏗️ Bauen</b> oder <b>Personal</b> ausbauen (kein Muss).
      </>
    ),
  },
};

// Waiting card while the uncle's inquiries haven't arrived yet (GROWTH beat
// starts Monday evening; inquiries come on the Thursday inquiry day).
const GROWTH_WAIT_COACH: { emoji: string; text: ReactNode } = {
  emoji: '⏳',
  text: (
    <>
      Gut gemacht! Am <b>Donnerstag</b> schauen sich neue Kunden um – lass die Zeit laufen
      (⏩ beschleunigen hilft).
    </>
  ),
};

// The meat beat's guided phases — each gets its own card and its own dismiss
// key (700+phase), so dismissing one doesn't swallow the next.
const MEAT_COACH: Record<number, { emoji: string; text: ReactNode }> = {
  1: {
    emoji: '🥩',
    text: (
      <>
        Neu freigeschaltet: <b>Fleisch</b>! Öffne <b>🧺 Sortiment</b> und nimm Fleisch auf
        (500 € Listungsgebühr) – dann kannst du es verkaufen.
      </>
    ),
  },
  2: {
    emoji: '⏳',
    text: (
      <>
        <b>Fleisch ist gelistet!</b> Am <b>Donnerstag</b> meldet sich ein Fleisch-Interessent –
        lass die Zeit laufen.
      </>
    ),
  },
  3: {
    emoji: '📨',
    text: (
      <>
        Ein <b>Fleisch-Interessent</b> hat angefragt – öffne <b>Anfragen</b> und nimm ihn an.
      </>
    ),
  },
  4: {
    emoji: '🛒',
    text: (
      <>
        Bestelle am <b>Samstag</b> im <b>Wocheneinkauf</b> auch <b>Fleisch</b>, damit die erste
        Lieferung rechtzeitig am Montag kommt.
      </>
    ),
  },
};

export function TutorialLayer() {
  const { state, mutate, setPaused } = useGame();
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
            <CountUp to={t.celebrateAmount ?? STARTER_REWARD_FALLBACK} /> <span>bar erhalten</span>
          </div>
          <p className="hint" style={{ maxWidth: 420, margin: '10px auto' }}>
            💡 Kleine Kunden zahlen <b>sofort bar</b> bei Abholung – so wächst deine Kasse mit
            jeder Lieferung. Größere Kunden zahlen später auf Rechnung: mittlere nach{' '}
            <b>1 Woche</b>, große nach <b>2 Wochen</b>.
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
  // While the weekly order screen is auto-opened, the modal itself is the guide —
  // a coach card underneath it would be a second simultaneous hint.
  if ((step === STEP.ORDER || step === STEP.MEAT) && state.pendingOrderWeek != null) return null;

  let coach = COACH[step];
  let dismissKey = step;
  if (step === STEP.GROWTH && !state.inquiries.some((i) => TUTORIAL_INQUIRY_IDS.includes(i.id))) {
    // The uncle's inquiries only arrive on Thursday — until then, explain the wait.
    coach = GROWTH_WAIT_COACH;
    dismissKey = 401;
  }
  if (step === STEP.MEAT) {
    // Phase from the live state: list → wait for Thursday → accept → Saturday
    // restock; nothing once done.
    const meatInq = state.inquiries.find((i) => i.id === TUTORIAL_MEAT_INQUIRY_ID);
    let phase: number | null;
    if (!isInAssortment(state, 'fleisch')) phase = 1;
    else if (!meatInq) phase = 2; // waiting for the Thursday inquiry
    else if (meatInq.status === 'open') phase = 3;
    else if (state.currentWeekPoId == null) phase = 4;
    else phase = null; // lesson done — waiting for the monthly statement
    if (phase == null) return null;
    coach = MEAT_COACH[phase];
    dismissKey = 700 + phase;
  }

  const dismissed = t.dismissedCoach?.includes(dismissKey) ?? false;
  if (coach && !dismissed) {
    const dismiss = () =>
      mutate((s) => {
        const tt = s.tutorial;
        if (tt && !(tt.dismissedCoach ??= []).includes(dismissKey)) tt.dismissedCoach.push(dismissKey);
      });
    return (
      <div className="coach-card">
        <span className="coach-emoji">{coach.emoji}</span>
        <div className="coach-text">{coach.text}</div>
        <button className="btn ghost small" onClick={dismiss}>
          Verstanden
        </button>
      </div>
    );
  }

  return null;
}
