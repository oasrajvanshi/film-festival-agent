'use client';
// The landing page's "new plan" section, shown as the product itself: the
// alert, the recommendation with its checklist, the calendar preview moving
// events, one approval, and the message an attendee receives. It plays when
// it scrolls into view and loops, always forward (old plan to new plan).

import { useEffect, useRef, useState } from 'react';

const VENUES = ['Harbor Theater', 'Canal Street Cinema', 'Pier 9 Hall', 'Riverside Studio'];
const T0 = 13 * 60, T1 = 19 * 60;
const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const top = (hm: string) => ((m(hm) - T0) / (T1 - T0)) * 100;
const h12 = (hm: string) => `${Number(hm.slice(0, 2)) % 12 || 12}:${hm.slice(3)}`;
const add = (hm: string, d: number) => { const t = m(hm) + d; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

interface Ev { col: number; t: string; s: string; e: string; img: string; move?: number; faces?: string[]; swap?: boolean }
const EVENTS: Ev[] = [
  { col: 0, t: 'Open Gods', s: '13:00', e: '14:30', img: 'f-07', faces: ['FH'] },
  { col: 0, t: 'Late Country', s: '15:00', e: '16:40', img: 'f-13', move: 15 },
  { col: 0, t: 'Last Light', s: '17:30', e: '18:50', img: 'f-19' },
  { col: 1, t: 'Silver Water', s: '13:00', e: '14:40', img: 'f-24' },
  { col: 1, t: 'Quiet Animals', s: '15:00', e: '16:30', img: 'f-30', move: 15 },
  { col: 1, t: 'Bright Weather', s: '17:30', e: '18:55', img: 'f-36' },
  { col: 2, t: 'Documentary Ethics', s: '13:30', e: '14:30', img: 'talk-speaker', faces: ['NT', 'YH'] },
  { col: 2, t: 'Selling at Markets', s: '16:00', e: '17:00', img: 'talk-stage', faces: ['PK', 'LP'], swap: true },
  { col: 3, t: 'Wild Tide', s: '15:00', e: '16:20', img: 'f-02', move: 15, faces: ['SW'] },
  { col: 3, t: 'Last Gods', s: '17:30', e: '18:55', img: 'f-08' },
];

const STEPS = [
  { at: 0 },      // 0 alert appears
  { at: 900 },    // 1 recommendation button pressed
  { at: 1500 },   // 2 panel open
  { at: 2100 },   // 3 first item ticked
  { at: 2600 },   // 4 second item
  { at: 3100 },   // 5 third item
  { at: 3700 },   // 6 calendar moves, guest swaps
  { at: 5200 },   // 7 approve pressed
  { at: 5900 },   // 8 approved, the attendee's phone lights up
];
const LOOP = 9600;

export function PlanDemo() {
  const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setStep(8); return; }
    let timers: ReturnType<typeof setTimeout>[] = [];
    let loop: ReturnType<typeof setInterval> | null = null;
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      setSnap(true); setStep(-1);
      timers.push(setTimeout(() => setSnap(false), 60));
      STEPS.forEach((st, i) => timers.push(setTimeout(() => setStep(i), st.at + 120)));
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !loop) { play(); loop = setInterval(play, LOOP); }
      if (!e.isIntersecting && loop) { clearInterval(loop); loop = null; timers.forEach(clearTimeout); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); if (loop) clearInterval(loop); timers.forEach(clearTimeout); };
  }, []);
  const moved = step >= 6;
  const items = ['Start 3 screenings 15 min later', 'Send 21 people their new time', 'Yara Hollis opens Pavel’s panel'];
  return (
    <div ref={box} className={`pd${snap ? ' snap' : ''}`} data-lve-skip aria-label="Usher suggesting a new plan, shown in the product">
      {/* the alert the agent raised */}
      <div className={`pd-alert${step >= 0 ? ' in' : ''}`}>
        <span className="pd-ic">!</span>
        <span className="pd-alert-t"><b>Thunderstorms 3:00 to 6:00 pm</b><small>Day 1 · and Pavel Kettering is running late</small></span>
        <span className={`pd-btn${step === 1 ? ' press' : ''}${step >= 1 ? ' on' : ''}`}>{step >= 2 ? 'Close preview' : 'Agent’s recommendation'}</span>
      </div>

      <div className="pd-main">
        {/* the recommendation: one sentence, then a checklist */}
        <aside className={`pd-rec${step >= 2 ? ' in' : ''}`}>
          <small className="pd-rec-k">Agent’s recommendation</small>
          <b>Two problems, one plan</b>
          <p>Start the storm screenings later and open Pavel’s panel with Yara Hollis.</p>
          <ul>
            {items.map((t, i) => <li key={t} className={step >= 3 + i ? 'on' : ''}><i>✓</i>{t}</li>)}
          </ul>
          <span className={`pd-approve${step >= 6 ? ' in' : ''}${step === 7 ? ' press' : ''}${step >= 8 ? ' done' : ''}`}>
            {step >= 8 ? 'Approved · 9 events moved · 116 messages sent' : 'Approve 3'}
          </span>
        </aside>

        {/* the calendar previewing the plan */}
        <div className={`pd-cal${moved ? ' moved' : ''}`}>
          <div className="pd-head"><span />{VENUES.map(v => <span key={v}>{v}</span>)}</div>
          <div className="pd-body">
            <div className="pd-hours">{[13, 14, 15, 16, 17, 18].map(h => <b key={h} style={{ top: `${((h * 60 - T0) / (T1 - T0)) * 100}%` }}>{h % 12 || 12} pm</b>)}</div>
            {VENUES.map((v, col) => (
              <div className="pd-col" key={v}>
                {EVENTS.filter(e => e.col === col && e.move).map(e => (
                  <div key={`g${e.t}`} className={`pd-ghost${moved ? ' on' : ''}`} style={{ top: `${top(e.s)}%`, height: `calc(${top(e.e) - top(e.s)}% - 3px)` }} />
                ))}
                {EVENTS.filter(e => e.col === col).map(e => {
                  const s = moved && e.move ? add(e.s, e.move) : e.s;
                  const en = moved && e.move ? add(e.e, e.move) : e.e;
                  return (
                    <div key={e.t} className={`pd-ev${e.move || e.swap ? ' hot' : ''}${moved && (e.move || e.swap) ? ' lit' : ''}`} style={{ top: `${top(s)}%`, height: `calc(${top(en) - top(s)}% - 3px)` }}>
                      <div className="pd-ev-main">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/hl/ev/${e.img}.jpg`} alt="" />
                        <span><b>{e.t}</b><small>{moved && e.move ? <><s>{h12(e.s)}</s> {h12(s)}</> : h12(s)}</small></span>
                      </div>
                      {e.faces && (
                        <span className={`pd-faces${e.swap && moved ? ' swapped' : ''}`}>
                          {e.swap && <i className="in">YH</i>}
                          {e.faces.map(f => <i key={f} className={e.swap && f === 'PK' ? 'out' : ''}>{f}</i>)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* what an attendee sees once it is approved */}
      <div className={`pd-phone${step >= 8 ? ' in' : ''}`}>
        <span className="pd-phone-app">Usher · now</span>
        <b>Wild Tide now starts at 3:15 pm</b>
        <small>Your seat is held. Leave 15 minutes early; the shuttle is running late.</small>
      </div>
    </div>
  );
}
