'use client';
// Usher: the product's own website. One story, told by scrolling:
// changes travel by hand today; a schedule change lands; Usher redraws the
// calendar; a person approves once; everyone's phone is right.

import './hl.css';
import './site.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, type MouseEvent } from 'react';
import { Bell, Brief, Move, People, Swap } from './hl/icons';

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
    };
  }, []);

  const go = (hash: string) => (e: MouseEvent) => {
    const el = document.querySelector(hash);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth' });
  };

  // Join links shared before the site had a home page (/?f=...) still open the festival.
  useEffect(() => {
    const q = location.search;
    if (/[?&]f=/.test(q)) location.replace(`/app${q}${location.hash}`);
  }, []);

  return (
    <div className="s-root" ref={root}>
      <div className="s-leader" data-leader data-lve-skip aria-hidden="true">
        <div className="s-leader-ring"><div className="s-leader-sweep" data-sweep /><i /><span className="s-leader-n" data-n>3</span></div>
      </div>

      <nav className="s-nav" aria-label="Site">
        <span className="wordmark">Usher</span>
        <span className="spacer" />
        <a className="navlink" href="#story" onClick={go('#story')}>How Usher works</a>
        <a className="navlink" href="/app">Sign in</a>
        <a className="btn small primary" href="/onboarding">Try the live demo</a>
      </nav>

      {/* hero */}
      <header className="s-hero">
        <div className="s-hero-bg" data-hero-bg style={{ backgroundImage: 'url(/hl/projector.jpg)' }} />
        <div className="s-hero-copy">
          <p className="s-kicker" data-hero-fade>Usher your festival with ease</p>
          <h1 className="s-h1" data-split>Every schedule change, to everyone it affects.</h1>
          <p className="s-lead" data-hero-fade>Festival schedules change all day. A screening moves, a guest runs late, a delivery slips. Usher tracks the schedule, works out who each change affects, and gives every attendee, guest, staff member and vendor their own next step. It flags clashes and checks passes, and your team approves anything that goes out.</p>
          <div className="s-ctas" data-hero-fade>
            <a className="btn primary" href="/onboarding">Try the live demo</a>
            <a className="btn" href="#story" onClick={go('#story')}>See how it works</a>
          </div>
        </div>
        <div className="s-hero-stage" data-lve-skip aria-hidden="true">
          <div style={{ position: 'absolute', inset: '6% 2% 4% 2%', transformStyle: 'preserve-3d' }} data-cal-wrap>
            <Cal id="hero" />
          </div>
          <div className="s-float" data-hero-float style={{ top: '2%', left: '6%' }}>
            <span className="ic"><Move /></span><span><b>Late Country moves to 3:15 pm</b><small>Harbor Theater · 21 people affected</small></span><span className="pill">Recommendation</span>
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
              <div className="row u"><b>Mara Quist</b><span>Pavel is running late, new ETA 4:20</span><em>2:58 pm</em></div>
              <div className="row u"><b>Kaia Ivers</b><span>Re: Re: Fwd: schedule v7 FINAL (2)</span><em>2:41 pm</em></div>
              <div className="row"><b>Lantern Print Couriers</b><span>Prints for 3 screenings running 15 min late</span><em>1:05 pm</em></div>
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

      {/* 3. the recommendation */}
      <section className="s-pin s-rec" data-scene="rec">
        <div className="s-sticky">
          <div className="s-rec-copy">
            <div data-rec-step="1"><h2 className="s-h2">Usher updates the plan.</h2><p className="s-lead">A late print delivery pushes three 3:00 pm screenings to 3:15. Usher finds everyone holding a seat, the door teams and the vendors, and drafts each one a note.</p></div>
            <div data-rec-step="2" style={{ position: 'absolute', top: 0, opacity: 0 }}><h2 className="s-h2">And covers a late guest.</h2><p className="s-lead">Pavel Kettering is running late for his 4:00 panel. Yara Hollis opens it, and he joins when he arrives.</p></div>
          </div>
          <div className="s-rec-stage" data-lve-skip aria-hidden="true">
            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}><Cal id="rec" /></div>
            <div className="s-float" data-rec-alert style={{ top: '-30px', right: '3%' }}>
              <span className="ic"><Brief /></span><span><b>Print delivery 15 min late</b><small>3 screenings at 3:00 pm</small></span><span className="pill">Recommendation</span>
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

      {/* call to action */}
      <footer className="s-footer">
        <div className="s-footer-bg" data-footer-bg />
        <h2 className="s-h1" data-split-scroll>See Usher run a festival day.</h2>
        <p className="s-lead" data-reveal>Set up a festival in a few minutes, move a screening or make a guest run late, then approve Usher&apos;s plan yourself.</p>
        <div className="s-roles" data-reveal>
          <a className="btn primary" href="/onboarding">Try the live demo</a>
        </div>
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
