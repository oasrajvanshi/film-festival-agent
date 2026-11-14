'use client';
// Festival Agent: the product's own website. One story, told by scrolling:
// changes travel by hand today; the forecast changes; the agent redraws the
// calendar; a person approves once; everyone's phone is right.

import 'lenis/dist/lenis.css';
import './site.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useEffect, useRef, type MouseEvent } from 'react';
import { Bell, Brief, Clapper, Message, Move, People, Snow, Swap } from './hl/icons';

// ---------------------------------------------------------------- the calendar (1 pm to 7 pm, four venues)

const VENUES = ['Harbor Theater', 'Canal Street Cinema', 'Pier 9 Hall', 'Riverside Studio'];
const T0 = 13 * 60, T1 = 19 * 60;
const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const pct = (hm: string) => Math.max(0, (m(hm) - T0) / (T1 - T0)) * 100;
const span = (a: string, b: string) => Math.min(100, pct(b)) - pct(a);
const h12 = (hm: string) => { const h = Number(hm.slice(0, 2)); return `${h % 12 || 12}:${hm.slice(3)}`; };

interface Ev { col: number; t: string; s: string; e: string; kind?: 'panel'; move?: number; swap?: boolean; who?: string }
const EVENTS: Ev[] = [
  { col: 0, t: 'Open Gods', s: '12:30', e: '14:12', who: 'Femi Hollis' },
  { col: 0, t: 'Q&A: Open Gods', s: '14:12', e: '14:32' },
  { col: 0, t: 'Late Country', s: '15:00', e: '16:41', move: 15 },
  { col: 0, t: 'Last Light', s: '17:30', e: '18:53' },
  { col: 1, t: 'Silver Water', s: '12:30', e: '14:17' },
  { col: 1, t: 'Quiet Animals', s: '15:00', e: '16:29', move: 15 },
  { col: 1, t: 'Bright Weather', s: '17:30', e: '19:10' },
  { col: 2, t: 'Documentary Ethics Now', s: '13:30', e: '14:30', kind: 'panel', who: 'Nico Thibault, Yara Hollis' },
  { col: 2, t: 'Selling at Markets', s: '16:00', e: '17:00', kind: 'panel', swap: true },
  { col: 2, t: 'Writing for Small Budgets', s: '18:30', e: '19:30', kind: 'panel' },
  { col: 3, t: 'Wild Tide', s: '15:00', e: '16:17', move: 15, who: 'Sami Whitlock' },
  { col: 3, t: 'Q&A: Wild Tide', s: '16:17', e: '16:37', move: 15 },
  { col: 3, t: 'Last Gods', s: '17:30', e: '18:57', who: 'Elif Galloway' },
];

const MAIL_TEXT = 'Hi Xavi, snow is expected from 2:00 to 7:00 pm, so we are holding the start of Wild Tide at Riverside Studio until 3:15 pm (it was 3:00). Your seat is held.';
const OUTBOX = [
  { to: '66 pass holders', msg: 'Snow from 2 to 7 pm. Allow extra time between venues.', Icon: Snow },
  { to: '21 ticket holders', msg: 'Your screening now starts at 3:15 pm. Your seat is held.', Icon: Bell },
  { to: 'Yara Hollis', msg: 'Please open "Selling at Markets" at 4:00 pm.', Icon: Message },
  { to: 'Pavel Kettering and his assistant', msg: 'No rush. Come to the stage door when you arrive.', Icon: Message },
  { to: '3 door teams', msg: 'Hold the doors 15 minutes. Seats are held.', Icon: Brief },
];

function Cal({ id }: { id: string }) {
  const hours = [13, 14, 15, 16, 17, 18];
  return (
    <div className="s-cal" data-cal={id}>
      <div className="s-cal-board">
        <div className="s-cal-head"><span />{VENUES.map(v => <span key={v}>{v}</span>)}</div>
        <div className="s-cal-body">
          <div className="s-cal-hours">{hours.map(h => <b key={h} style={{ top: `${((h * 60 - T0) / (T1 - T0)) * 100}%` }}>{h % 12 || 12} {h < 12 ? 'am' : 'pm'}</b>)}</div>
          {hours.map(h => <div key={h} className="s-cal-line" style={{ top: `${((h * 60 - T0) / (T1 - T0)) * 100}%` }} />)}
          <div className="s-cal-snow" data-snowband style={{ top: `${pct('14:00')}%`, height: `${span('14:00', '19:00')}%` }} />
          {VENUES.map((v, col) => (
            <div className="s-cal-col" key={v}>
              {EVENTS.filter(e => e.col === col && e.move).map(e => <div key={`g${e.t}`} className="s-ghost" data-ghost style={{ top: `${pct(e.s)}%`, height: `calc(${span(e.s, e.e)}% - 3px)` }} />)}
              {EVENTS.filter(e => e.col === col).map(e => {
                const short = span(e.s, e.e) < 9;
                return (
                  <div key={e.t} className={`s-ev${e.kind ? ` k-${e.kind}` : ''}${short ? ' short' : ''}`} data-move={e.move ?? undefined} data-swap={e.swap ? '' : undefined}
                    data-top={pct(e.s)} style={{ top: `${pct(e.s)}%`, height: `calc(${span(e.s, e.e)}% - 3px)` }}>
                    <b>{e.t}</b>
                    <small data-time>{h12(e.s)} to {h12(e.e)}</small>
                    {e.swap ? <em><ins data-in style={{ display: 'none' }}>Yara Hollis opens · </ins>Luca Pell, <span data-out>Pavel Kettering</span></em> : e.who && <em>{e.who}</em>}
                    {e.move && <span className="tag" data-tag>+{e.move} min</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="s-now" style={{ top: `${pct('13:10')}%` }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Site() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.registerPlugin(ScrollTrigger);
    let lenis: Lenis | null = null;
    let tick: ((t: number) => void) | null = null;
    if (!reduce) {
      lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
      lenis.on('scroll', ScrollTrigger.update);
      tick = (t: number) => lenis!.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }
    const stopSnow = snowfield(root.current!.querySelector<HTMLCanvasElement>('[data-snowfield]'), reduce);

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);
      if (reduce) { finalStates(q); q('[data-leader]').forEach(e => e.remove()); return; }

      // --- film leader, then the hero
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const seen = (() => { try { return sessionStorage.getItem('fa:leader') === '1'; } catch { return false; } })();
      const leader = q('[data-leader]')[0];
      if (leader && !seen) {
        try { sessionStorage.setItem('fa:leader', '1'); } catch { /* none */ }
        const n = leader.querySelector('[data-n]')!;
        const sweep = leader.querySelector<HTMLElement>('[data-sweep]')!;
        ['3', '2', '1'].forEach((v, i) => {
          intro.call(() => { n.textContent = v; }, [], i * 0.5)
            .fromTo(sweep, { '--sweep': '0deg' }, { '--sweep': '360deg', duration: 0.5, ease: 'none' }, i * 0.5);
        });
        intro.to(leader, { yPercent: -100, duration: 0.8, ease: 'power4.inOut' }, 1.55).set(leader, { display: 'none' });
      } else if (leader) { leader.remove(); }
      split(q('[data-split]'));
      intro.fromTo(q('.s-hero .split-word'), { yPercent: 110 }, { yPercent: 0, duration: 1.05, stagger: 0.05, ease: 'power4.out' }, seen ? 0.1 : 1.75)
        .fromTo(q('[data-hero-fade]'), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1 }, '<0.35')
        .fromTo(q('[data-cal="hero"]'), { rotateX: 70, rotateZ: -18, y: 120, autoAlpha: 0 }, { rotateX: 52, rotateZ: -12, y: 0, autoAlpha: 1, duration: 1.6, ease: 'power3.out' }, '<0.1')
        .fromTo(q('[data-hero-float]'), { y: -40, autoAlpha: 0, z: 120 }, { y: 0, autoAlpha: 1, z: 60, duration: 1, stagger: 0.25, ease: 'power3.out' }, '<0.6');

      // hero: the calendar keeps showing what the product does, on a loop
      const heroCal = q('[data-cal="hero"]')[0];
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 3.4, defaults: { ease: 'power3.inOut' } });
      loop.to(heroCal.querySelectorAll('[data-snowband]'), { opacity: 1, duration: 0.8 })
        .to(heroCal.querySelectorAll('[data-ghost]'), { opacity: 1, duration: 0.4 }, '<0.4')
        .add(moveBlocks(heroCal, 1), '<')
        .call(() => heroCal.querySelectorAll('[data-move]').forEach(e => e.classList.add('hot')), [], '<')
        .add(swapGuest(heroCal, true), '+=0.2')
        .to({}, { duration: 2.4 })
        .add(swapGuest(heroCal, false))
        .add(moveBlocks(heroCal, 0))
        .to(heroCal.querySelectorAll('[data-ghost], [data-snowband]'), { opacity: 0, duration: 0.5 }, '<');
      gsap.to(q('[data-hero-bg]'), { yPercent: 12, ease: 'none', scrollTrigger: { trigger: q('.s-hero')[0], start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.to(q('[data-cal="hero"]'), { rotateX: 30, rotateZ: -4, y: -60, ease: 'none', scrollTrigger: { trigger: q('.s-hero')[0], start: 'top top', end: 'bottom top', scrub: 1 } });

      const scene = (name: string) => {
        const el = q(`[data-scene="${name}"]`)[0];
        return gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 1 } })
          .to(el.querySelector('.s-progress i'), { scaleX: 1, duration: 10 }, 0);
      };

      // --- 1. the problem: changes travel by hand, in pieces, late
      const p = scene('problem');
      const cards = q('[data-chaos] .s-card');
      cards.forEach((c, i) => {
        const a = (i % 2 ? 1 : -1) * (12 + (i * 7) % 20);
        p.fromTo(c, { z: -900, y: 160, rotateX: 12, rotateY: a / 2, rotateZ: a / 3, autoAlpha: 0 },
          { z: 0, y: 0, rotateX: 0, rotateY: a / 8, rotateZ: Number(c.getAttribute('data-r') ?? 0), autoAlpha: 1, duration: 1.6, ease: 'power3.out' }, 0.2 + i * 0.42);
      });
      p.fromTo(q('[data-chaos] .s-stamp'), { scale: 1.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, stagger: 0.35, ease: 'back.out(2)' }, 4.4)
        .fromTo(q('[data-p2]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1 }, 4.6)
        .to(cards, { y: (i: number) => 380 + i * 30, rotateZ: (i: number) => (i % 2 ? 24 : -24), rotateX: -30, autoAlpha: 0, duration: 2, stagger: 0.08, ease: 'power2.in' }, 7.6)
        .to(q('.s-problem-copy'), { autoAlpha: 0, y: -40, duration: 1.2 }, 8.6);

      // --- 2. the forecast changes: feeds converge on the agent, the agent finds who is affected
      const t = scene('trigger');
      q('[data-feed]').forEach(pth => { const len = (pth as unknown as SVGPathElement).getTotalLength(); gsap.set(pth, { strokeDasharray: len, strokeDashoffset: len }); });
      t.fromTo(q('[data-trigger-copy] > *'), { autoAlpha: 0, y: 30, filter: 'blur(8px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: 0.3 }, 0.2)
        .fromTo(q('[data-feed-in]'), { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.8, stagger: 0.25 }, 1.4)
        .to(q('[data-feed="in"]'), { strokeDashoffset: 0, duration: 2, stagger: 0.25 }, 1.8)
        .fromTo(q('[data-node]'), { scale: 0.4, autoAlpha: 0, transformOrigin: '50% 50%' }, { scale: 1, autoAlpha: 1, duration: 1, ease: 'back.out(1.6)' }, 3.6)
        .to(q('[data-feed="out"]'), { strokeDashoffset: 0, duration: 2, stagger: 0.2 }, 4.6)
        .fromTo(q('[data-feed-out]'), { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.8, stagger: 0.25 }, 5.2)
        .to(q('[data-trigger-copy], [data-feeds]'), { autoAlpha: 0, scale: 0.94, duration: 1.4 }, 8.6);

      // --- 3. the recommendation: the calendar turns to face you and redraws itself
      const r = scene('rec');
      const big = q('[data-cal="rec"]')[0];
      r.fromTo(big, { rotateX: 62, rotateZ: -14, rotateY: 8, scale: 0.78, y: 120, autoAlpha: 0.3 }, { rotateX: 0, rotateZ: 0, rotateY: 0, scale: 1, y: 0, autoAlpha: 1, duration: 2.6, ease: 'power2.inOut' }, 0)
        .fromTo(q('[data-rec-alert]'), { y: -80, z: 200, autoAlpha: 0 }, { y: 0, z: 60, autoAlpha: 1, duration: 1, ease: 'power3.out' }, 2.4)
        .to(big.querySelectorAll('[data-snowband]'), { opacity: 1, duration: 0.8 }, 2.6)
        .to(big.querySelectorAll('[data-ghost]'), { opacity: 1, duration: 0.6 }, 3.6)
        .add(moveBlocks(big, 1, 3.8), 3.6)
        .call(() => big.querySelectorAll('[data-move]').forEach(e => e.classList.add('hot')), [], 3.7)
        .fromTo(q('[data-chg]'), { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.7, stagger: 0.5, ease: 'power3.out' }, 3.9)
        .add(swapGuest(big, true), 6.6)
        .fromTo(q('[data-rec-step="2"]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 6.4)
        .to(q('[data-rec-step="1"]'), { autoAlpha: 0, y: -20, duration: 0.6 }, 6.2);

      // --- 4. one approval
      const a = scene('approve');
      a.fromTo(q('[data-approve-card]'), { rotateY: -28, rotateX: 10, z: -300, autoAlpha: 0 }, { rotateY: 0, rotateX: 0, z: 0, autoAlpha: 1, duration: 2, ease: 'power3.out' }, 0)
        .fromTo(q('[data-tick] svg'), { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, stagger: 0.4 }, 2)
        .to(q('[data-tick]'), { backgroundColor: '#C99863', borderColor: '#C99863', duration: 0.3, stagger: 0.4 }, 2)
        .fromTo(q('[data-cursor]'), { x: 260, y: 260, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 1.6, ease: 'power2.inOut' }, 3.4)
        .to(q('[data-press]'), { scale: 0.96, duration: 0.15, yoyo: true, repeat: 1 }, 5.0)
        .fromTo(q('[data-ripple]'), { scale: 0, autoAlpha: 1 }, { scale: 14, autoAlpha: 0, duration: 1.2, ease: 'power2.out' }, 5.1)
        .to(q('[data-press] .done'), { autoAlpha: 1, duration: 0.4 }, 5.3)
        .fromTo(q('[data-signed]'), { scale: 1.8, rotate: -14, autoAlpha: 0 }, { scale: 1, rotate: -6, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.4)' }, 5.8)
        .fromTo(q('[data-rules] > *'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.4 }, 0.6);

      // --- 4b. the agent writes the message, sends it, and the outbox fills up
      const nt = scene('notify');
      const typed = q('[data-type]')[0];
      const typer = { n: 0 };
      nt.fromTo(q('[data-notify-copy] > *'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.25 }, 0)
        .fromTo(q('[data-mail]'), { rotateY: -18, rotateX: 8, z: -260, autoAlpha: 0 }, { rotateY: 0, rotateX: 0, z: 0, autoAlpha: 1, duration: 1.4, ease: 'power3.out' }, 0.3)
        .call(() => { typed.textContent = ''; }, [], 1.2)
        .to(typer, { n: MAIL_TEXT.length, duration: 2.6, ease: 'none', onUpdate: () => { typed.textContent = MAIL_TEXT.slice(0, Math.round(typer.n)); } }, 1.3)
        .fromTo(q('[data-mail-rec]'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 4.0)
        .to(q('[data-send]'), { scale: 0.94, duration: 0.15, yoyo: true, repeat: 1 }, 4.8)
        .fromTo(q('[data-env]'), { autoAlpha: 0, x: 0, y: 0, scale: 1, rotate: 0 }, { autoAlpha: 1, duration: 0.15 }, 5.0)
        .to(q('[data-env]'), { x: 260, y: -120, scale: 0.5, rotate: 18, autoAlpha: 0, duration: 1, ease: 'power2.in' }, 5.15)
        .fromTo(q('[data-sent]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 5.2)
        .fromTo(q('[data-out]'), { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.42, ease: 'power3.out' }, 5.4)
        .fromTo(q('[data-ok]'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, stagger: 0.42 }, 5.8)
        .fromTo({ v: 0 }, { v: 0 }, { v: 93, duration: 2.4, ease: 'none', onUpdate: function (this: gsap.core.Tween) { const c = q('[data-count]')[0]; if (c) c.textContent = String(Math.round((this.targets()[0] as { v: number }).v)); } }, 5.5);

      // --- 5. everyone in step: three phones fan out
      const mm = gsap.matchMedia();
      mm.add({ wide: '(min-width: 761px)', narrow: '(max-width: 760px)' }, c => {
        const wide = (c.conditions as { wide: boolean }).wide;
        const s = scene('people');
        const phones = q('[data-phone]');
        const x = wide ? [-330, 0, 330] : [-0.26, 0, 0.26].map(f => f * window.innerWidth);
        s.fromTo(q('[data-people-copy] > *'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.3 }, 0)
          .fromTo(phones, { x: 0, y: 220, z: -400, rotateY: 0, rotateX: 30, autoAlpha: 0 }, { y: 0, z: -200, rotateX: 0, autoAlpha: 1, duration: 2, stagger: 0.2, ease: 'power3.out' }, 0.6)
          .to(phones, { x: (i: number) => x[i], z: (i: number) => (i === 1 ? 0 : -120), rotateY: (i: number) => [26, 0, -26][i], duration: 2.4, ease: 'power3.inOut' }, 3)
          .fromTo(q('[data-phone] figcaption'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, stagger: 0.2 }, 5)
          .to(phones, { rotateY: (i: number) => [16, 0, -16][i], y: -10, duration: 2 }, 6.5);
      });

      // --- proof: sticky stack recedes as the next card arrives
      const stack = q('[data-stack-card]');
      stack.forEach((card, i) => {
        const next = stack[i + 1];
        if (!next) return;
        gsap.to(card, { scale: 0.92 + i * 0.015, autoAlpha: 0.55, y: -20, ease: 'none', scrollTrigger: { trigger: next, start: 'top 85%', end: 'top 20%', scrub: true } });
      });
      q('[data-reveal]').forEach(el => gsap.fromTo(el, { y: 40, autoAlpha: 0, filter: 'blur(8px)' }, { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 1, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } }));
      q('[data-split-scroll]').forEach(el => {
        split([el]);
        gsap.fromTo(el.querySelectorAll('.split-word'), { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: 0.05, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
      gsap.fromTo(q('[data-footer-bg]'), { yPercent: -10, scale: 1.1 }, { yPercent: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: q('.s-footer')[0], start: 'top bottom', end: 'bottom bottom', scrub: 1 } });
    }, root);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    return () => {
      window.removeEventListener('load', refresh);
      stopSnow();
      ctx.revert();
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, []);

  const go = (hash: string) => (e: MouseEvent) => {
    const el = document.querySelector(hash);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="s-root" ref={root}>
      <div className="s-leader" data-leader data-lve-skip aria-hidden="true">
        <div className="s-leader-ring"><div className="s-leader-sweep" data-sweep /><i /><span className="s-leader-n" data-n>3</span></div>
      </div>

      <nav className="s-nav" aria-label="Site">
        <span className="wordmark">Festival Agent</span>
        <span className="spacer" />
        <a className="navlink" href="#story" onClick={go('#story')}>How the agent works</a>
        <a className="navlink" href="#proof" onClick={go('#proof')}>What it runs on</a>
        <a className="btn small primary" href="/app">Try the live demo</a>
      </nav>

      {/* hero */}
      <header className="s-hero">
        <div className="s-hero-bg" data-hero-bg style={{ backgroundImage: 'url(/hl/projector.jpg)' }} />
        <div className="s-hero-copy">
          <p className="s-kicker" data-hero-fade>An AI operations agent for film festivals</p>
          <h1 className="s-h1" data-split>An agent that re-plans your festival.</h1>
          <p className="s-lead" data-hero-fade>When snow hits or a guest runs late, the agent works out who is affected, rewrites the schedule, and emails every attendee, guest and volunteer their own next step. You approve it in one tap.</p>
          <div className="s-ctas" data-hero-fade>
            <a className="btn primary" href="/app">Try the live demo</a>
            <a className="btn" href="#story" onClick={go('#story')}>See the agent work</a>
          </div>
        </div>
        <div className="s-hero-stage" data-lve-skip aria-hidden="true">
          <div style={{ position: 'absolute', inset: '6% 2% 4% 2%', transformStyle: 'preserve-3d' }} data-cal-wrap>
            <Cal id="hero" />
          </div>
          <div className="s-float" data-hero-float style={{ top: '2%', left: '6%' }}>
            <span className="ic"><Snow /></span><span><b>Snow coming in 50 min</b><small>About 3 in · Harbor Loop 12 min late</small></span><span className="pill">Recommendation</span>
          </div>
          <div className="s-float" data-hero-float style={{ bottom: '6%', right: '0%' }}>
            <span className="ic"><Bell /></span><span><b>Wild Tide now 3:15 pm</b><small>Your seat is held. Leave 15 min early.</small></span>
          </div>
        </div>
        <div className="s-scrollcue" aria-hidden="true">Scroll<i /></div>
      </header>

      {/* 1. the problem */}
      <section id="story" className="s-pin s-problem" data-scene="problem">
        <div className="s-sticky">
          <div className="s-problem-copy">
            <p className="s-mono">Before</p>
            <h2 className="s-h2">One change takes hours of copying by hand.</h2>
            <p>The schedule lives in a spreadsheet, the briefs in Word, the updates in email and group chats. Every change is copied between them by hand.</p>
            <p data-p2>So updates arrive late, reach the wrong people, or never arrive.</p>
          </div>
          <div className="s-chaos" data-chaos data-lve-skip aria-hidden="true">
            <div className="s-card s-doc d-sheet" data-r="-2" style={{ left: '0%', top: '0%' }}>
              <div className="bar"><i /><i /><i /><span>Harbor Lights 2027 · Schedule grid (v7 FINAL)</span></div>
              <table><tbody>
                <tr><th /><th>A</th><th>B</th><th>C</th><th>D</th></tr>
                <tr><th>1</th><td>Event</td><td>Start</td><td>Title</td><td>Venue</td></tr>
                <tr><th>2</th><td>e-003</td><td>15:00</td><td>Wild Tide</td><td>Riverside</td></tr>
                <tr><th>3</th><td>e-023</td><td className="hl">15:15??</td><td>Late Country</td><td>Harbor</td></tr>
                <tr><th>4</th><td>e-040</td><td>15:00</td><td>Quiet Animals</td><td>Canal St</td></tr>
                <tr><th>5</th><td>e-056</td><td className="cm">16:00</td><td>Selling at Markets</td><td>Pier 9</td></tr>
              </tbody></table>
              <span className="s-stamp">Version 7</span>
            </div>
            <div className="s-card s-doc d-mail" data-r="3" style={{ right: '0%', top: '12%' }}>
              <div className="bar"><b>Inbox</b><span>47 unread</span></div>
              <div className="row u"><b>Mara Quist</b><span>Pavel is stuck on the bridge, new ETA 4:20</span><em>2:58 pm</em></div>
              <div className="row u"><b>Kaia Ivers</b><span>Re: Re: Fwd: schedule v7 FINAL (2)</span><em>2:41 pm</em></div>
              <div className="row"><b>Weather service</b><span>Winter weather advisory, 2 to 7 pm</span><em>1:05 pm</em></div>
              <div className="row"><b>Box office</b><span>21 people asking about Wild Tide</span><em>12:50 pm</em></div>
              <span className="s-stamp">Late</span>
            </div>
            <div className="s-card s-doc d-word" data-r="-3" style={{ left: '3%', top: '42%' }}>
              <div className="bar"><span>Door brief v3.docx</span></div>
              <div className="page">
                <b>Door brief, Thursday</b>
                <p>Doors open <del>2:45</del> <ins>3:00?</ins> for the <del>3:00</del> <ins>3:15??</ins> screenings.</p>
                <p>Shuttle every 20 min from Canal Street.</p>
                <span className="cmt">Is this still right? K.</span>
              </div>
              <span className="s-stamp">Outdated</span>
            </div>
            <div className="s-card s-doc d-chat" data-r="4" style={{ right: '1%', top: '50%' }}>
              <div className="bar"><b>Volunteers · Harbor Lights</b><span>83 members</span></div>
              <p className="them">who is telling the door teams??</p>
              <p className="them">sheet says 3:00, the email says 3:15</p>
              <p className="me">can someone call Yara?</p>
              <span className="s-stamp">Wrong people</span>
            </div>
            <div className="s-card s-doc d-phone" data-r="-4" style={{ left: '38%', top: '72%' }}>
              <b>3 missed calls</b><span>Guest relations · 2:59 pm</span>
              <b>Voicemail</b><span>Pier 9 Hall stage door</span>
              <span className="s-stamp">Missed</span>
            </div>
            <div className="s-card note" data-r="-6" style={{ left: '46%', top: '30%' }}>call Pavel&apos;s assistant!! panel at 4</div>
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 2. the trigger */}
      <section className="s-pin s-trigger" data-scene="trigger">
        <div className="s-sticky">
          <canvas className="s-snowfield" data-snowfield aria-hidden="true" />
          <div className="s-trigger-copy" data-trigger-copy>
            <span className="s-clock">Thursday · 1:10 pm</span>
            <h2 className="s-h2">The agent sees the snow coming.</h2>
            <p className="s-lead" style={{ textAlign: 'center' }}>It reads the weather, flight and shuttle feeds, then checks every screening, guest and shift against them.</p>
          </div>
          <div className="s-feeds" data-feeds data-lve-skip>
            <svg viewBox="0 0 1100 420" role="img" aria-label="Weather, flights and the shuttle feed reach the agent, which finds three screenings, twenty-one people, one guest and three door teams affected">
              {[['Weather', '3 in of snow, 2 to 7 pm', 90], ['Flights', 'DL2207 lands 2:41 pm', 210], ['Shuttle', 'Harbor Loop 12 min late', 330]].map(([l, s, y]) => (
                <g key={String(l)} data-feed-in>
                  <text className="lbl" x="20" y={Number(y) - 6}>{l}</text>
                  <text className="sub" x="20" y={Number(y) + 16}>{s}</text>
                  <path className="dim" d={`M250 ${y} C 380 ${y}, 420 210, 500 210`} />
                  <path data-feed="in" d={`M250 ${y} C 380 ${y}, 420 210, 500 210`} />
                </g>
              ))}
              <g data-node>
                <circle className="node" cx="550" cy="210" r="56" />
                <text className="node-t" x="550" y="220" textAnchor="middle">Agent</text>
              </g>
              {[['3 screenings', 60], ['21 people', 160], ['1 guest', 260], ['3 door teams', 360]].map(([l, y]) => (
                <g key={String(l)} data-feed-out>
                  <path className="dim" d={`M600 210 C 680 210, 720 ${y}, 840 ${y}`} />
                  <path data-feed="out" d={`M600 210 C 680 210, 720 ${y}, 840 ${y}`} />
                  <text className="out" x="860" y={Number(y) + 7}>{l}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 3. the recommendation */}
      <section className="s-pin s-rec" data-scene="rec">
        <div className="s-sticky">
          <div className="s-rec-copy">
            <div data-rec-step="1"><h2 className="s-h2">It rewrites the schedule.</h2><p className="s-lead">Three 3:00 pm screenings move to 3:15, so people on the late shuttle make the start.</p></div>
            <div data-rec-step="2" style={{ position: 'absolute', top: 0, opacity: 0 }}><h2 className="s-h2">And finds a backup speaker.</h2><p className="s-lead">Pavel is stuck on the bridge. Yara Hollis opens his panel, and he joins when he arrives.</p></div>
          </div>
          <div className="s-rec-stage" data-lve-skip aria-hidden="true">
            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}><Cal id="rec" /></div>
            <div className="s-float" data-rec-alert style={{ top: '-30px', right: '3%' }}>
              <span className="ic"><Snow /></span><span><b>Snow coming in 50 min</b><small>About 3 in, 2 to 7 pm</small></span><span className="pill">Recommendation</span>
            </div>
          </div>
          <div className="s-rec-list" data-lve-skip>
            <h3>Changes</h3>
            {[
              [Move, '"Wild Tide" 3:00 → 3:15 pm', 'Riverside Studio'],
              [Move, '"Late Country" 3:00 → 3:15 pm', 'Harbor Theater'],
              [Move, '"Quiet Animals" 3:00 → 3:15 pm', 'Canal Street Cinema'],
              [People, 'Tell 21 people with these in their plan', 'Seats are held'],
              [Brief, 'Brief 3 door teams', 'Staff only'],
              [Swap, 'Yara Hollis opens "Selling at Markets"', 'Pavel Kettering joins on arrival'],
            ].map(([I, t, s]) => { const Icon = I as typeof Move; return <div className="s-chg" data-chg key={String(t)}><Icon /><span>{String(t)}<small>{String(s)}</small></span></div>; })}
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 4. approval */}
      <section className="s-pin short s-approve" data-scene="approve">
        <div className="s-sticky">
          <div style={{ position: 'relative', perspective: 1200 }} data-lve-skip>
            <div className="s-approve-card" data-approve-card>
              <span className="s-signed" data-signed>Approved · Zane Marchetti · 1:14 pm</span>
              {[['Send the snow notice', 'Comms · 66 pass holders'], ['Hold the 3:00 pm starts by 15 min', 'Operations · 21 people told'], ['Skip the extra bus, watch the load', 'Operations · nothing goes out']].map(([t, s]) => (
                <div className="row" key={t}><span className="s-tick" data-tick><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span><span>{t}<small>{s}</small></span></div>
              ))}
              <div className="s-press" data-press>Approve all 3<span className="s-ripple" data-ripple /><span className="done">Approved. This is the new plan.</span></div>
              <svg className="s-cursor" data-cursor viewBox="0 0 24 24" style={{ left: '52%', bottom: '8px' }}><path d="M5 3l14 8-6 1.6L10 19z" fill="#EFE5D3" stroke="#1A0F0B" strokeWidth="1.2" /></svg>
            </div>
          </div>
          <div className="s-rules" data-rules>
            <h2 className="s-h2">You approve the plan in one tap.</h2>
            <p className="s-lead">Every recommendation comes with the facts behind it. Messages to the public and schedule changes wait for you; staff briefs and warnings run on their own.</p>
            <div className="cols">
              <div className="col"><h4>On its own</h4><p>Warnings on the calendar</p><p>Briefs and heads-ups for staff</p><p>Re-checks later</p></div>
              <div className="col wait"><h4>Waits for you</h4><p>Messages to attendees and guests</p><p>Changes to the schedule</p><p>Orders from vendors</p></div>
            </div>
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 4b. the agent writes to everyone */}
      <section className="s-pin s-notify" data-scene="notify">
        <div className="s-sticky">
          <div className="s-notify-copy" data-notify-copy>
            <p className="s-mono">1:14 pm</p>
            <h2 className="s-h2">Then it writes to everyone affected.</h2>
            <p className="s-lead">One message per person, with their own next step, by email, text or the app.</p>
          </div>
          <div className="s-mail" data-mail data-lve-skip>
            <div className="s-mail-bar"><span>New message</span><em>Written by the agent</em></div>
            <div className="s-mail-row"><span>To</span><b>Xavi Nakamura</b><em>and 20 others with Wild Tide in their plan</em></div>
            <div className="s-mail-row"><span>Subject</span><b>Wild Tide now starts at 3:15 pm</b></div>
            <div className="s-mail-body"><span data-type>{MAIL_TEXT}</span><i className="caret" /></div>
            <div className="s-mail-rec" data-mail-rec><span>Your next step</span><b>Leave by 2:30 pm. The Harbor Loop shuttle is running 12 minutes late.</b></div>
            <div className="s-mail-foot"><span className="s-send" data-send>Send to 21 people</span><span className="s-sent" data-sent>Sent at 1:14 pm</span></div>
            <svg className="s-env" data-env viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
          </div>
          <div className="s-outbox" data-outbox data-lve-skip>
            <header><b data-count>0</b> messages sent</header>
            {OUTBOX.map(o => (
              <div className="s-out" data-out key={o.to}>
                <span className="ic"><o.Icon /></span>
                <span className="tx"><b>{o.to}</b><small>{o.msg}</small></span>
                <span className="ok" data-ok>Sent</span>
              </div>
            ))}
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 5. everyone in step */}
      <section className="s-pin s-people" data-scene="people">
        <div className="s-sticky">
          <div data-people-copy style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
            <h2 className="s-h2">Each person sees what changed for them.</h2>
            <p className="s-lead" style={{ textAlign: 'center' }}>Attendees get their new start time. Guests get their cue. Volunteers get the new door brief.</p>
          </div>
          <div className="s-phones" data-lve-skip>
            {[['/site/phone-staff.jpg', 'Staff', 'The door brief updates itself'], ['/site/phone-attendee.jpg', 'Attendee', 'Their seat moved with the film'], ['/site/phone-team.jpg', 'Festival team', 'One tap to approve']].map(([src, t, s], i) => (
              <figure className="s-phone" data-phone key={t} style={{ zIndex: i === 1 ? 3 : 2 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${t} app: ${s}`} loading="lazy" />
                <figcaption><b>{t}</b>{s}</figcaption>
              </figure>
            ))}
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* proof */}
      <section id="proof" className="s-stack">
        <header><h2 className="s-h2" data-split-scroll>What the agent runs on.</h2></header>
        {[
          { n: '01', h: 'Connects to your festival sheet', p: 'Schedule, venues, guests, passes, shifts and the call sheet, read live from Google Sheets.', img: '/hl/hall.jpg' },
          { n: '02', h: 'Monitors weather, flights and shuttles', p: 'It also reads emails from guests and their assistants and keeps only the facts, such as a new arrival time.', img: '/hl/snow.jpg' },
          { n: '03', h: 'Solid recommendations from our agent', p: 'Each one is costed in people, messages and money, with a safe default if nobody answers in time.', img: '/hl/chair.jpg' },
          { n: '04', h: 'Runs on local models', big: '18/18', p: 'Qwen 3 plans and calls the tools; Llama 3.1 takes over if it fails. Every check passes on the snow day and the late-guest day.', img: '/hl/doorway.jpg' },
        ].map(c => (
          <article className="s-stack-card" data-stack-card key={c.n}>
            <div className="copy">
              <span className="n">{c.n}</span>
              {c.big && <span className="big">{c.big}</span>}
              <div style={{ display: 'grid', gap: 16 }}><h3>{c.h}</h3><p>{c.p}</p></div>
            </div>
            <div className="media" style={{ backgroundImage: `url(${c.img})` }} />
          </article>
        ))}
      </section>

      {/* call to action */}
      <footer className="s-footer">
        <div className="s-footer-bg" data-footer-bg />
        <h2 className="s-h1" data-split-scroll>Watch the agent handle a snow day.</h2>
        <p className="s-lead" data-reveal>Open the demo as an attendee, the festival team or staff. Play the snow day or the late guest, and approve the agent&apos;s plan yourself.</p>
        <div className="s-roles" data-reveal>
          <a className="btn primary" href="/app">Try the live demo</a>
          <a className="btn" href="/start/attendee">As an attendee</a>
          <a className="btn" href="/start/team">As the festival team</a>
          <a className="btn" href="/start/staff">As staff</a>
        </div>
        <div className="s-credit"><span>Festival Agent · Group Blue</span><span>A prototype. Everyone in it is made up.</span></div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function split(els: Element[]) {
  for (const el of els) {
    if ((el as HTMLElement).dataset.splitReady) continue;
    const text = el.textContent ?? '';
    el.setAttribute('aria-label', text.trim());
    el.textContent = '';
    for (const part of text.split(/(\s+)/)) {
      if (!part.trim()) { el.appendChild(document.createTextNode(part)); continue; }
      const mask = document.createElement('span'); mask.className = 'split-mask'; mask.setAttribute('aria-hidden', 'true');
      const w = document.createElement('span'); w.className = 'split-word'; w.textContent = part;
      mask.appendChild(w); el.appendChild(mask);
    }
    (el as HTMLElement).dataset.splitReady = '1';
  }
}

/** Slide the held blocks to their new start (1) or back (0). */
function moveBlocks(cal: Element, to: 0 | 1, dur = 1.1) {
  const tl = gsap.timeline();
  cal.querySelectorAll<HTMLElement>('[data-move]').forEach((el, i) => {
    const base = Number(el.dataset.top);
    const shift = (Number(el.dataset.move) / (T1 - T0)) * 100;
    tl.to(el, { top: `${base + shift * to}%`, duration: dur, ease: 'power3.inOut' }, i * 0.14);
    tl.to(el.querySelector('[data-tag]'), { opacity: to, duration: 0.3 }, i * 0.14 + dur * 0.7);
    const time = el.querySelector('[data-time]');
    if (time) tl.call(() => { time.textContent = to ? shifted(time.getAttribute('data-orig') ?? time.textContent ?? '', Number(el.dataset.move)) : (time.getAttribute('data-orig') ?? time.textContent ?? ''); }, [], i * 0.14 + dur * 0.5);
    if (time && !time.getAttribute('data-orig')) time.setAttribute('data-orig', time.textContent ?? '');
    if (!to) tl.call(() => el.classList.remove('hot'), [], i * 0.14);
  });
  return tl;
}

function shifted(text: string, by: number) {
  return text.replace(/(\d{1,2}):(\d{2})/g, (_, h, mm) => {
    let t = Number(h) * 60 + Number(mm) + by;
    if (Number(h) < 8) t += 12 * 60;
    const hh = Math.floor(t / 60) % 12 || 12;
    return `${hh}:${String(t % 60).padStart(2, '0')}`;
  });
}

/** Strike the late guest and bring the backup on stage (or undo it). */
function swapGuest(cal: Element, on: boolean) {
  const tl = gsap.timeline();
  const ev = cal.querySelector<HTMLElement>('[data-swap]');
  if (!ev) return tl;
  const ins = ev.querySelector<HTMLElement>('[data-in]');
  const out = ev.querySelector<HTMLElement>('[data-out]');
  // a split-flap turn: fold away, change the names, fold back
  tl.to(ev, { rotateX: -90, duration: 0.32, ease: 'power2.in' })
    .call(() => {
      ev.classList.toggle('hot', on);
      if (ins) ins.style.display = on ? 'inline' : 'none';
      if (out) out.innerHTML = on ? '<s>Pavel Kettering</s>' : 'Pavel Kettering';
    })
    .fromTo(ev, { rotateX: 90 }, { rotateX: 0, duration: 0.5, ease: 'power3.out' });
  return tl;
}

/** Reduced motion: show every scene in its final state. */
function finalStates(q: (s: string) => Element[]) {
  for (const cal of q('[data-cal]')) {
    cal.querySelectorAll<HTMLElement>('[data-move]').forEach(el => { el.style.top = `${Number(el.dataset.top) + (Number(el.dataset.move) / (T1 - T0)) * 100}%`; el.classList.add('hot'); });
    cal.querySelectorAll<HTMLElement>('[data-ghost], [data-snowband]').forEach(el => { el.style.opacity = '1'; });
    const ins = cal.querySelector<HTMLElement>('[data-in]'); if (ins) ins.style.display = 'inline';
  }
  q('[data-cal="hero"]').forEach(el => { (el as HTMLElement).style.transform = 'rotateX(52deg) rotateZ(-12deg)'; });
  q('[data-phone]').forEach((el, i) => { (el as HTMLElement).style.transform = `translateX(${[-330, 0, 330][i]}px)`; });
}

/** Soft snow in the trigger scene; pauses when off screen. */
function snowfield(canvas: HTMLCanvasElement | null, reduce: boolean) {
  if (!canvas || reduce) return () => undefined;
  const c = canvas.getContext('2d');
  if (!c) return () => undefined;
  let w = 0, h = 0, raf = 0, visible = false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const flakes = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.0006 + Math.random() * 0.0016, d: Math.random() * Math.PI * 2 }));
  const size = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const frame = () => {
    c.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.0004;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      c.beginPath(); c.arc(f.x * w, f.y * h, f.r, 0, Math.PI * 2);
      c.fillStyle = `rgba(239, 229, 211, ${0.25 + f.r / 5})`; c.fill();
    }
    if (visible) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) { size(); raf = requestAnimationFrame(frame); } });
  io.observe(canvas);
  window.addEventListener('resize', size);
  return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
}
