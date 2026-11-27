'use client';
// Page two: the festival's Saturday as a slab of a calendar, with the cast on it. One
// leans over the top and calls it; one hangs off a screening until it slides 15 minutes later; the caller climbs
// down and shoves another across to the next venue, with the one holding the clipboard riding on top; one naps
// through all of it. Laid out in fixed pixels on a 666 x 552 board and scaled as one piece, so hands always meet
// what they hold.

import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import { Mascot, type Pose } from './ui/mascot';

const W = 660, H = 552, GX = 52, GY = 94, CW = 150, RH = 111, EW = 140;
const X = (col: number) => GX + col * CW + 5;
const Y = (hm: number) => GY + ((Math.floor(hm) - 13) + (hm % 1) / 0.6) * RH;                     // 15.15 = 3:15 pm
const EV: { id: string; col: number; s: number; e: number; t: string; img: string; who?: string }[] = [
  { id: 'snow', col: 0, s: 13.1, e: 14, t: 'The Weight of Snow', img: 'f-07' },
  { id: 'hymns', col: 1, s: 13.2, e: 14.2, t: 'Saltwater Hymns', img: 'f-24', who: 'FH' },
  { id: 'ethics', col: 2, s: 13, e: 13.45, t: 'Copper Valley', img: 'f-08' },
  { id: 'copper', col: 3, s: 13.05, e: 13.5, t: 'Borrowed Light', img: 'f-19' },
  { id: 'low', col: 0, s: 14.15, e: 15.15, t: 'Low Sun', img: 'f-13', who: 'EG' },
  { id: 'night', col: 2, s: 14.55, e: 16.1, t: 'Night Swimmers', img: 'f-02', who: 'SW' },
];
const of = (id: string) => EV.find(e => e.id === id)!;
const label = (hm: number) => { const h = Math.floor(hm), mm = Math.round((hm % 1) * 100); return `${h % 12 || 12}:${String(mm).padStart(2, '0')}`; };
const plus = (hm: number, min: number) => { const a = Math.floor(hm) * 60 + Math.round((hm % 1) * 100) + min; return Math.floor(a / 60) + (a % 60) / 100; };

const CAST = { headsup: { w: 189, h: 212 }, working: { w: 76, h: 118 }, done: { w: 134, h: 148 }, relax: { w: 117, h: 124 } } as const;
const SAY: Record<keyof typeof CAST, string> = { headsup: 'Snow at 1 pm. Heads-up!', working: 'Moving it next door…', done: 'Done! Everyone’s been told.', relax: 'All calm. Coffee time.' };

export function CoverCal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = root.current!, q = <T extends HTMLElement = HTMLElement>(s: string) => box.querySelector<T>(s)!;
    // scaled as one piece to fit its place on the page, with room above for the one leaning over the top
    const fit = () => {
      const p = box.parentElement!, k = Math.min(p.clientWidth / (W + 40), p.clientHeight / (H + 170));
      box.style.setProperty('--cs', String(Math.max(0.3, k)));
    };
    fit(); window.addEventListener('resize', fit);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => window.removeEventListener('resize', fit);
    const ev = (id: string) => q(`[data-ev="${id}"]`), act = (p: string) => q(`[data-act="${p}"]`), fig = (p: string) => q(`[data-act="${p}"] [data-fig]`);
    const say = (p: string, on: boolean) => () => { q(`[data-said="${p}"]`).classList.toggle('on', on); };
    const cls = (el: HTMLElement, c: string, on: boolean) => () => { el.classList.toggle(c, on); };
    let off = () => {}, offCal = () => {}, io: IntersectionObserver | null = null;
    const ctx = gsap.context(() => {
      const A = { headsup: act('headsup'), working: act('working'), done: act('done'), relax: act('relax') };
      const D = RH / 4, low = of('low'), night = of('night');                                          // D: 15 minutes
      const top = { x: 214, y: -134 }, floor = H - CAST.done.h + 3;
      const ride = { x: X(2) + 34, y: Y(night.s) - CAST.working.h + 4 };
      const hang = { x: X(0) + 28 - 0.09 * CAST.done.w, y: Y(low.e) - 4 - 0.1 * CAST.done.h + 2 };
      const push = { x: X(2) + 5 - 0.95 * CAST.headsup.w, y: Y(night.e) - CAST.headsup.h + 10 };
      gsap.set(A.headsup, { x: top.x, y: 24 }); gsap.set(A.working, ride); gsap.set(A.relax, { x: 506, y: -119 });
      gsap.set(A.done, { x: 62, y: floor, transformOrigin: '9% 10%' });
      gsap.set(fig('done'), { transformOrigin: '60% 98%' }); gsap.set([fig('working'), fig('headsup')], { transformOrigin: '50% 97%' });
      gsap.set(A.headsup, { transformOrigin: '55% 97%' }); gsap.set(A.working, { transformOrigin: '45% 97%' });
      gsap.set(q('[data-paw]'), { scale: 0 });
      const squash = (tl: gsap.core.Timeline, f: HTMLElement, at: number) => tl.to(f, { scaleY: 0.86, scaleX: 1.1, duration: 0.09 }, at).to(f, { scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, .45)' }, at + 0.09);
      const grab = (tl: gsap.core.Timeline, id: string, at: number) => tl.call(cls(ev(id), 'up', true), [], at).to(ev(id), { scale: 1.04, duration: 0.3, ease: 'back.out(3)' }, at).to(q(`[data-slot="${id}"]`), { opacity: 1, duration: 0.2 }, at);
      const drop = (tl: gsap.core.Timeline, id: string, at: number) => tl.call(() => { ev(id).classList.remove('up', 'hit'); ev(id).classList.add('ok'); }, [], at)
        .to(ev(id), { scaleY: 0.95, scaleX: 1.02, rotation: 0, duration: 0.09 }, at).to(ev(id), { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1, .4)' }, at + 0.09)
        .to(q(`[data-slot="${id}"]`), { opacity: 0, duration: 0.5 }, at + 0.2);

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 0.6, paused: true });
      // it plays only while it is on screen
      // it starts from the top when page two comes in (the page sends usher:cal), and only plays while on screen
      let on = false, seen = true;
      const onCal = (e: Event) => { const v = (e as CustomEvent<boolean>).detail; if (v === on) return; on = v; if (v) tl.restart(true); else tl.pause(0); };
      window.addEventListener('usher:cal', onCal);
      io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (on) { if (seen) tl.play(); else tl.pause(); } }, { threshold: 0.25 });
      io.observe(box);
      offCal = () => window.removeEventListener('usher:cal', onCal);
      // someone leans over the top to say so
      tl.to(A.headsup, { y: top.y, duration: 0.75, ease: 'back.out(1.5)' }, 0.5)
        .to(q('[data-paw]'), { scale: 1, duration: 0.35, ease: 'back.out(3)' }, 0.95)
        .call(say('headsup', true), [], 1.15).call(say('headsup', false), [], 2.1)
        .call(() => { ['low', 'night'].forEach(id => ev(id).classList.add('hit')); }, [], 0.9);
      // there is work now: the one resting in the armchair slips down behind the calendar
      tl.set(A.relax, { zIndex: 0 }, 0.5).to(A.relax, { y: -10, autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, 0.5);
      // at the same moment the one below jumps, catches Low Sun by its bottom edge, and swings until it comes down
      tl.to(fig('done'), { scaleY: 0.82, scaleX: 1.1, duration: 0.2, ease: 'power2.out' }, 0.5)
        .to(fig('done'), { scaleY: 1.06, scaleX: 0.96, duration: 0.14 }, 0.7).to(fig('done'), { scaleY: 1, scaleX: 1, duration: 0.2 }, 0.95)
        .to(A.done, { x: hang.x, duration: 0.36, ease: 'sine.out' }, 0.7)
        .to(A.done, { y: hang.y - 10, duration: 0.28, ease: 'power2.out' }, 0.7).to(A.done, { y: hang.y, duration: 0.1, ease: 'power2.in' }, 0.98)
        .to(A.done, { rotation: 20, duration: 0.38, ease: 'sine.out' }, 1.08).to(A.done, { rotation: -15, duration: 0.56, ease: 'sine.inOut' }, 1.46)
        .to(A.done, { rotation: 7, duration: 0.5, ease: 'sine.inOut' }, 2.02).to(A.done, { rotation: 0, duration: 0.44, ease: 'sine.inOut' }, 2.52);
      grab(tl, 'low', 1.08);
      tl.to(ev('low'), { rotation: 1.4, duration: 0.3 }, 1.12).to(ev('low'), { rotation: -1, duration: 0.4 }, 1.55)
        .to([ev('low')], { y: D, duration: 0.95, ease: 'elastic.out(1, .75)' }, 1.6).to(A.done, { y: hang.y + D, duration: 0.95, ease: 'elastic.out(1, .75)' }, 1.6);
      const n = { v: 0 }, small = ev('low').querySelector('small')!;
      tl.to(n, { v: 15, duration: 0.6, ease: 'none', onUpdate: () => { small.textContent = `${label(plus(low.s, Math.round(n.v / 5) * 5))} pm`; } }, 1.6);
      drop(tl, 'low', 2.6);
      tl.to(A.done, { x: 62, duration: 0.36, ease: 'sine.in' }, 3.0).to(A.done, { y: floor, duration: 0.36, ease: 'power2.in' }, 3.0);
      squash(tl, fig('done'), 3.36);
      // half a second before that is done, the caller comes over the top and shoves Night Swimmers to the next venue, rider and all
      tl.to(q('[data-paw]'), { scale: 0, duration: 0.15 }, 2.1)
        .to(A.headsup, { y: top.y - 74, duration: 0.36, ease: 'power2.out' }, 2.1).set(A.headsup, { zIndex: 30 }, 2.46)
        .to(A.headsup, { x: push.x, duration: 0.46, ease: 'sine.in' }, 2.46).to(A.headsup, { y: push.y, duration: 0.46, ease: 'power2.in' }, 2.46);
      squash(tl, fig('headsup'), 2.92);
      tl.to(A.headsup, { rotation: 9, duration: 0.3, ease: 'power2.out' }, 3.4).call(cls(q('[data-target]'), 'on', true), [], 3.3).call(say('working', true), [], 3.4).call(say('working', false), [], 5.2);
      grab(tl, 'night', 3.45);
      [0.44, 1].forEach((k, i) => {
        const at = 3.7 + i * 0.62, d = 0.52;
        tl.to(ev('night'), { x: CW * k, rotation: i ? 0 : 1.4, duration: d, ease: 'power3.inOut' }, at)
          .to(A.headsup, { x: push.x + CW * k, rotation: i ? 6 : 13, duration: d, ease: 'power3.inOut' }, at)
          .to(A.headsup, { y: push.y - 5, duration: d / 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, at)
          .to(A.working, { x: ride.x + CW * k, duration: d, ease: 'power3.inOut' }, at)
          .to(A.working, { rotation: -13, duration: d * 0.45, ease: 'sine.out' }, at).to(A.working, { rotation: 5, duration: d * 0.4, ease: 'sine.inOut' }, at + d * 0.45);
      });
      drop(tl, 'night', 4.86);
      tl.call(cls(q('[data-target]'), 'on', false), [], 4.86).to(A.working, { rotation: 0, duration: 0.5, ease: 'back.out(3)' }, 4.9).to(A.headsup, { rotation: 0, duration: 0.45, ease: 'back.out(2)' }, 4.95);
      squash(tl, fig('working'), 4.9);
      // a jump for joy, and it is calm again
      tl.call(say('done', true), [], 5.6).call(say('done', false), [], 7.4)
        .to(A.done, { y: floor - 50, duration: 0.28, ease: 'power2.out' }, 5.6).to(A.done, { y: floor, duration: 0.28, ease: 'power2.in' }, 5.88);
      squash(tl, fig('done'), 6.16);
      tl.to(A.relax, { y: -119, autoAlpha: 1, duration: 0.55, ease: 'back.out(1.6)' }, 6.8).set(A.relax, { zIndex: 8 }, 7.35)
        .call(say('relax', true), [], 7.5).call(say('relax', false), [], 9.3)
        // back to the start of the day
        .call(() => { ['low', 'night'].forEach(id => ev(id).classList.remove('ok')); small.textContent = `${label(low.s)} pm`; n.v = 0; }, [], 9.6)
        .to(A.headsup, { x: top.x, y: -214, duration: 0.5, ease: 'power2.out' }, 9.4).set(A.headsup, { zIndex: 0 }, 9.9).to(A.headsup, { y: 24, duration: 0.45, ease: 'power2.in' }, 9.9)
        .to(ev('low'), { y: 0, duration: 0.8, ease: 'power3.inOut' }, 9.6).to(ev('night'), { x: 0, duration: 0.8, ease: 'power3.inOut' }, 9.8).to(A.working, { x: ride.x, duration: 0.8, ease: 'power3.inOut' }, 9.8);

      // the whole thing turns a little after the pointer
      if (matchMedia('(pointer: fine)').matches) {
        const st = q('[data-cc-stage]'), ry = gsap.quickTo(st, 'rotationY', { duration: 0.9, ease: 'power3.out' }), rx = gsap.quickTo(st, 'rotationX', { duration: 0.9, ease: 'power3.out' });
        gsap.set(st, { rotationY: -10, rotationX: 5 });
        const mv = (e: PointerEvent) => { ry(-10 + (e.clientX / innerWidth - 0.5) * 9); rx(5 - (e.clientY / innerHeight - 0.5) * 7); };
        window.addEventListener('pointermove', mv, { passive: true });
        off = () => window.removeEventListener('pointermove', mv);
      }
    }, box);
    return () => { off(); offCal(); io?.disconnect(); window.removeEventListener('resize', fit); ctx.revert(); };
  }, []);

  const size = (e: { s: number; e: number }) => ({ top: Y(e.s), height: Y(e.e) - Y(e.s) - 5 });
  const said = (p: keyof typeof CAST) => <span className="cc-say" data-said={p}><span className="s-bubble">{SAY[p]}</span></span>;
  return (
    <div className="cc" ref={root} data-ccal aria-hidden="true" data-lve-skip>
      <div className="cc-stage" data-cc-stage data-cc-home>
        <div className="cc-act" data-act="headsup" style={{ width: CAST.headsup.w, height: CAST.headsup.h, zIndex: 0 }}><div data-fig className="cc-fig"><div className="cc-flip"><Mascot pose="headsup" /></div></div>{said('headsup')}</div>
        <div className="cc-board">
          <div className="cc-date"><b>Saturday</b> January 23</div>
          <div className="cc-head">{['Boulder Theater', 'Macky', 'Canyon', 'eTown Hall'].map(v => <span key={v}>{v}</span>)}</div>
          {[0, 1, 2, 3].map(c => <i key={c} className="cc-col" style={{ left: GX + c * CW }} />)}
          {[13, 14, 15, 16].map(h => <div key={h} className="cc-hour" style={{ top: Y(h) }}><b>{h % 12} pm</b></div>)}
          {['low', 'night'].map(id => <div key={id} className="cc-slot" data-slot={id} style={{ left: X(of(id).col), ...size(of(id)) }} />)}
          <div className="cc-slot target" data-target style={{ left: X(3), ...size(of('night')) }} />
          {EV.map(e => (
            <div key={e.id} className="cc-ev" data-ev={e.id} style={{ left: X(e.col), ...size(e) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/hl/ev/${e.img}.jpg`} alt="" /><span><b>{e.t}</b><small>{label(e.s)} pm</small></span>{e.who && <em>{e.who}</em>}<i className="cc-tick" />
            </div>
          ))}
        </div>
        <i className="cc-paw" data-paw />
        {(['working', 'done', 'relax'] as Pose[]).map(p => p as 'working' | 'done' | 'relax').map(p => (
          <div key={p} className="cc-act" data-act={p} style={{ width: CAST[p].w, height: CAST[p].h }}><div data-fig className="cc-fig"><Mascot pose={p} /></div>{said(p)}</div>
        ))}
      </div>
    </div>
  );
}
