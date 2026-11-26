'use client';
// The hero's conversation: Usher talking, as a chat. A problem comes in from the festival; Usher
// shows it is typing, then answers with what it will do and who it tells. The mascot beside the
// chat is Usher's face and changes with the moment: a jump to say hello, the megaphone when a
// problem lands, writing while it types, a jump when it's done. Plays only while it is on screen.

import { useEffect, useRef, useState } from 'react';
import { Mascot, type Pose } from './ui/mascot';

type Msg = { id: number; who: 'usher' | 'issue' | 'typing'; text: string };

const HELLO = 'Hi, I’m Usher. Don’t worry, I’ll take care of everything.';
/** Each exchange: what comes in, then Usher's answer (**bold** = the part that matters). */
const SCRIPT: [string, string][] = [
  ['Dana’s flight is cancelled. She’s on the 2:00 talk.', 'On it. Ravi steps in, and I’ll tell the **40 people** booked.'],
  ['Snow from 1 pm. The shuttle is 12 minutes late.', 'I’ll start **3 screenings** 15 minutes later and brief the door teams.'],
  ['The print for Low Sun is running late.', 'I’ll swap it with Soft Animals and let **projection** know.'],
  ['Two door volunteers called in sick.', 'I’ve asked **Noor and Theo** to cover the 3:00 doors.'],
];

function Words({ text }: { text: string }) {
  // Usher's words pop in one after another; **bold** stays bold.
  let i = 0;
  return <>{text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part, k) => {
    const bold = part.startsWith('**');
    const words = (bold ? part.slice(2, -2) : part).split(/(\s+)/);
    return <span key={k} className={bold ? 'uc-b' : undefined}>{words.map((w, j) => /^\s+$/.test(w) ? w : <span key={j} className="uc-w" style={{ animationDelay: `${(i++) * 55}ms` }}>{w}</span>)}</span>;
  })}</>;
}

export function UsherChat() {
  const box = useRef<HTMLDivElement>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, who: 'usher', text: HELLO }]);
  const [pose, setPose] = useState<Pose>('done');

  useEffect(() => {
    if (reduce) { setMsgs([{ id: 0, who: 'usher', text: HELLO }, { id: 1, who: 'issue', text: SCRIPT[0][0] }, { id: 2, who: 'usher', text: SCRIPT[0][1] }]); return; }
    const el = box.current!;
    let alive = true, seen = false, id = 1, timer = 0;
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.4 });
    io.observe(el);
    // On screen and not still faded out by the page's scroll animation.
    const shown = () => {
      if (!seen) return false;
      const fade = el.closest<HTMLElement>('[data-hero-fade]');
      if (!fade) return true;
      const cs = getComputedStyle(fade);
      return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.6;
    };
    const sleep = (ms: number) => new Promise<void>(r => { timer = window.setTimeout(r, ms); });
    const wait = async (ms: number) => { await sleep(ms); while (alive && !shown()) await sleep(300); };
    const push = (m: Omit<Msg, 'id'>) => setMsgs(l => [...l.filter(x => x.who !== 'typing'), { ...m, id: id++ }].slice(-4));
    (async () => {
      while (alive && !shown()) await sleep(300);
      // say hello again now that someone is looking
      setMsgs([]); await sleep(120); if (!alive) return;
      setPose('done'); push({ who: 'usher', text: HELLO });
      await wait(2800);
      for (let k = 0; alive; k = (k + 1) % SCRIPT.length) {
        const [issue, reply] = SCRIPT[k];
        setPose('headsup'); push({ who: 'issue', text: issue });
        await wait(1500); if (!alive) return;
        setPose('working'); push({ who: 'typing', text: '' });
        await wait(1500); if (!alive) return;
        setPose('done'); push({ who: 'usher', text: reply });
        await wait(3600);
        if (alive) setPose('relax');
        await wait(900);
      }
    })();
    return () => { alive = false; clearTimeout(timer); io.disconnect(); };
  }, [reduce]);

  return (
    <div className="uc" ref={box} aria-live="polite">
      <div className="uc-face" aria-hidden="true"><Mascot key={pose} pose={pose} /></div>
      <div className="uc-thread">
        {msgs.map(m => (
          <div key={m.id} className={`uc-row ${m.who}`}>
            {m.who === 'typing'
              ? <div className="uc-bub uc-typing" aria-label="Usher is typing"><i /><i /><i /></div>
              : m.who === 'issue'
                ? <div className="uc-bub uc-issue"><span className="uc-dot" aria-hidden="true" />{m.text}</div>
                : <div className="uc-bub uc-usher"><Words text={m.text} /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
