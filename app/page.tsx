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
import { PHOTOS } from './ui/photos';

// ---------------------------------------------------------------- the calendar (1 pm to 7 pm, four venues)

const VENUES = ['Harbor Theater', 'Canal Street Cinema', 'Pier 9 Hall', 'Riverside Studio'];
const T0 = 13 * 60, T1 = 19 * 60;
const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const pct = (hm: string) => Math.max(0, (m(hm) - T0) / (T1 - T0)) * 100;
const span = (a: string, b: string) => Math.min(100, pct(b)) - pct(a);
const h12 = (hm: string) => { const h = Number(hm.slice(0, 2)); return `${h % 12 || 12}:${hm.slice(3)}`; };

interface Ev { col: number; t: string; s: string; e: string; kind?: 'panel'; move?: number; swap?: boolean; who?: string; img: string; faces?: string[] }
const EVENTS: Ev[] = [
  { col: 0, t: 'Open Gods', s: '12:30', e: '14:12', who: 'Femi Hollis', img: 'f-07', faces: ['Femi Hollis'] },
  { col: 0, t: 'Q&A: Open Gods', s: '14:12', e: '14:32', img: 'talk-qa' },
  { col: 0, t: 'Late Country', s: '15:00', e: '16:41', move: 15, img: 'f-13' },
  { col: 0, t: 'Last Light', s: '17:30', e: '18:53', img: 'f-19' },
  { col: 1, t: 'Silver Water', s: '12:30', e: '14:17', img: 'f-24' },
  { col: 1, t: 'Quiet Animals', s: '15:00', e: '16:29', move: 15, img: 'f-30' },
  { col: 1, t: 'Bright Weather', s: '17:30', e: '19:10', img: 'f-36' },
  { col: 2, t: 'Documentary Ethics Now', s: '13:30', e: '14:30', kind: 'panel', who: 'Nico Thibault, Yara Hollis', img: 'talk-speaker', faces: ['Nico Thibault', 'Yara Hollis', 'Luca Pell'] },
  { col: 2, t: 'Selling at Markets', s: '16:00', e: '17:00', kind: 'panel', swap: true, img: 'talk-stage', faces: ['Pavel Kettering', 'Luca Pell', 'Luca Hollis'] },
  { col: 2, t: 'Writing for Small Budgets', s: '18:30', e: '19:30', kind: 'panel', img: 'talk-speaker', faces: ['Pavel Kettering', 'Sami Whitlock', 'Luca Abara'] },
  { col: 3, t: 'Wild Tide', s: '15:00', e: '16:17', move: 15, who: 'Sami Whitlock', img: 'f-02', faces: ['Sami Whitlock'] },
  { col: 3, t: 'Q&A: Wild Tide', s: '16:17', e: '16:37', move: 15, img: 'talk-qa' },
  { col: 3, t: 'Last Gods', s: '17:30', e: '18:57', who: 'Elif Galloway', img: 'f-08', faces: ['Elif Galloway'] },
];

const TONES = ['#b9825a', '#8f6a4f', '#a4744e', '#7d5b46', '#c39367', '#6f5a4e'];
const initials = (n: string) => n.split(' ').map(w => w[0]).join('');
const tone = (n: string) => TONES[[...n].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length];

/** `rich`: the app's own calendar look, with each event's picture and its guests' avatars. */
function Cal({ id, rich }: { id: string; rich?: boolean }) {
  const hours = [13, 14, 15, 16, 17, 18];
  return (
    <div className={`s-cal${rich ? ' rich' : ''}`} data-cal={id}>
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
                    {rich ? <>
                      <div className="s-ev-main">
                        {!short && <img className="s-ev-img" src={`/hl/ev/${e.img}.jpg`} alt="" />}
                        <div className="s-ev-txt"><b>{e.t}</b><small data-time>{h12(e.s)} to {h12(e.e)}</small></div>
                      </div>
                      {!short && e.faces && (
                        <span className="s-faces">
                          {e.swap && <i className="in" data-in style={{ display: 'none', background: tone('Yara Hollis') }}>YH</i>}
                          {e.faces.map(n => <i key={n} className={n === 'Pavel Kettering' ? 'late' : ''} data-late={n === 'Pavel Kettering' ? '' : undefined} style={{ background: tone(n) }} title={n}>{initials(n)}</i>)}
                        </span>
                      )}
                      {e.swap && <em className="s-ev-note" data-out>Pavel Kettering is running late</em>}
                    </> : <>
                      <b>{e.t}</b>
                      <small data-time>{h12(e.s)} to {h12(e.e)}</small>
                      {e.swap ? <em><ins data-in style={{ display: 'none' }}>Yara Hollis opens · </ins>Luca Pell, <span data-out>Pavel Kettering</span></em> : e.who && <em>{e.who}</em>}
                    </>}
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

      const phone = matchMedia('(max-width: 760px)').matches;
      // Phones: the four tools are a swipeable row; the dots follow the swipe.
      if (phone) {
        const row = q('[data-tools]')[0] as HTMLElement | undefined;
        const dots = q('[data-dots] i');
        row?.addEventListener('scroll', () => {
          const w = (row.firstElementChild as HTMLElement | null)?.offsetWidth || 1;
          const i = Math.round(row.scrollLeft / (w + 12));
          dots.forEach((d, j) => d.classList.toggle('on', i === j));
        }, { passive: true });
      }
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
        .fromTo(q('[data-cal="hero"]'), { rotateX: phone ? 30 : 60, rotateZ: phone ? -4 : -14, y: 140, autoAlpha: 0 }, { rotateX: phone ? 0 : 24, rotateZ: phone ? 0 : -6, y: 0, autoAlpha: 1, duration: 1.8, ease: 'power3.out' }, '<0.1')
        .fromTo(q('[data-hero-float]'), { y: -40, autoAlpha: 0, z: 120 }, { y: 0, autoAlpha: 1, z: 60, duration: 1, stagger: 0.25, ease: 'power3.out' }, '<0.6');

      // hero: the calendar keeps showing what the product does, on a loop
      const heroCal = q('[data-cal="hero"]')[0];
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.5, delay: 3.4, defaults: { ease: 'power3.inOut' } });
      loop.to(heroCal.querySelectorAll('[data-snowband]'), { opacity: 1, duration: 0.8 })
        .to(heroCal.querySelectorAll('[data-ghost]'), { opacity: 1, duration: 0.4 }, '<0.4')
        .add(moveBlocks(heroCal, 1), '<')
        .call(() => heroCal.querySelectorAll('[data-move]').forEach(e => e.classList.add('hot')), [], '<')
        .add(swapGuest(heroCal, true), '+=0.2')
        .to({}, { duration: 1.5 })
        // back to the original plan in one frame, so only the change forward is ever shown
        .call(() => resetHero(heroCal));
      gsap.to(q('[data-hero-bg]'), { yPercent: 12, ease: 'none', scrollTrigger: { trigger: q('.s-hero')[0], start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.to(q('[data-cal-wrap]'), { y: phone ? -8 : -14, rotateX: phone ? 0 : 3, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2.4 });
      if (!phone) gsap.fromTo(q('[data-cal="hero"]'), { rotateX: 24, rotateZ: -6, y: 0 }, { rotateX: 14, rotateZ: -3, y: -60, ease: 'none', immediateRender: false, scrollTrigger: { trigger: q('.s-hero')[0], start: 'top top', end: 'bottom top', scrub: 1 } });

      const scene = (name: string) => {
        const el = q(`[data-scene="${name}"]`)[0];
        return gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 1 } })
          .to(el.querySelector('.s-progress i'), { scaleX: 1, duration: 10 }, 0);
      };

      // --- 1. the problem: changes travel by hand, in pieces, late
      const p = scene('problem');
      const tools = phone ? [] : q('[data-tool]');
      if (tools.length) p.fromTo(tools, { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.7, ease: 'power3.out' }, 0.3)
        .fromTo(q('[data-tool] .edit, [data-tool] .clash, [data-tool] .row.u'), { backgroundColor: 'rgba(232, 104, 75, 0)' }, { backgroundColor: 'rgba(232, 104, 75, .18)', duration: 0.6, stagger: 0.15 }, 3.8)
        .to(tools, { y: -30, autoAlpha: 0, duration: 1.4, stagger: 0.08, ease: 'power2.in' }, 7.6)
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
        .to(q('[data-trigger-copy], [data-feeds]'), { autoAlpha: matchMedia('(max-width: 760px)').matches ? 1 : 0, scale: 0.94, duration: 0.8 }, 9.2);

      // --- 3. the recommendation: the calendar turns to face you and redraws itself
      const r = scene('rec');
      const big = q('[data-cal="rec"]')[0];
      r.fromTo(big, phone ? { rotateX: 24, rotateZ: -4, scale: 0.92, y: 40, autoAlpha: 0.6 } : { rotateX: 62, rotateZ: -14, rotateY: 8, scale: 0.78, y: 120, autoAlpha: 0.3 }, { rotateX: 0, rotateZ: 0, rotateY: 0, scale: 1, y: 0, autoAlpha: 1, duration: phone ? 1.6 : 2.6, ease: 'power2.inOut' }, 0)
        .fromTo(q('[data-rec-alert]'), { y: -80, z: 200, autoAlpha: 0 }, { y: 0, z: 60, autoAlpha: 1, duration: 1, ease: 'power3.out' }, 2.4)
        .to(big.querySelectorAll('[data-snowband]'), { opacity: 1, duration: 0.8 }, 2.6)
        .to(big.querySelectorAll('[data-ghost]'), { opacity: 1, duration: 0.6 }, 3.6)
        .add(moveBlocks(big, 1, 3.8), 3.6)
        .call(() => big.querySelectorAll('[data-move]').forEach(e => e.classList.add('hot')), [], 3.7)
        .fromTo(q('[data-chg]'), { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.7, stagger: 0.5, ease: 'power3.out' }, 3.9)
        .add(swapGuest(big, true), 6.6)
        .to(q('[data-rec-step="1"]'), { autoAlpha: 0, y: -20, duration: 0.5 }, 5.8)
        .fromTo(q('[data-rec-step="2"]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 6.4);

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
        <div className="s-hero-bg" data-hero-bg style={{ backgroundImage: `url(${PHOTOS.hero.src})` }} />
        <div className="s-hero-copy">
          <h1 className="s-h1" data-split>Usher helps you manage every unexpected change at your festival.</h1>
          <p className="s-lead" data-hero-fade>It tracks your schedule and tells everyone affected by a change what to do next. Your staff approve anything sent publicly.</p>
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
            <p className="s-mono">The problem</p>
            <h2 className="s-h2">Schedule changes are still passed on by hand.</h2>
            <p className="s-lead">Every change travels across spreadsheets, emails and group chats, so updates arrive late or reach the wrong people.</p>
          </div>
          <div className="s-tools" data-tools data-lve-skip aria-hidden="true">
            <figure className="s-tool t-sheets" data-tool>
              <figcaption><i className="ap sheets" />Google Sheets</figcaption>
              <div className="win">
                <div className="win-bar"><b>Harbor Lights 2027 · Schedule</b></div>
                <table><tbody>
                  <tr><th /><th>A</th><th>B</th><th>C</th></tr>
                  <tr><th>1</th><td className="h">Start</td><td className="h">Event</td><td className="h">Guest</td></tr>
                  <tr><th>2</th><td className="edit">3:15 pm</td><td>Late Country</td><td>None</td></tr>
                  <tr><th>3</th><td>4:00 pm</td><td>Selling at Markets</td><td className="clash">Pavel Kettering</td></tr>
                  <tr><th>4</th><td>4:15 pm</td><td>Q&amp;A: Wild Tide</td><td className="clash">Pavel Kettering</td></tr>
                  <tr><th>5</th><td>5:30 pm</td><td>Last Light</td><td>None</td></tr>
                </tbody></table>
              </div>
              <p className="s-pain">Guests get double-booked.</p>
            </figure>
            <figure className="s-tool t-gmail" data-tool>
              <figcaption><i className="ap gmail" />Gmail</figcaption>
              <div className="win">
                <div className="row u"><b>Mara Quist</b><span>Pavel is running late, new ETA 4:20</span><em>2:58 pm</em></div>
                <div className="row u"><b>Kaia Ivers</b><span>Re: Fwd: schedule v7 FINAL</span><em>2:41 pm</em></div>
                <div className="row"><b>Lantern Print</b><span>Prints running 15 min late</span><em>1:05 pm</em></div>
                <div className="row"><b>Box office</b><span>21 people asking about Wild Tide</span><em>12:50 pm</em></div>
              </div>
              <p className="s-pain">Updates arrive late, or reach the wrong people.</p>
            </figure>
            <figure className="s-tool t-word" data-tool>
              <figcaption><i className="ap word" />Word</figcaption>
              <div className="win">
                <div className="page">
                  <b>Door brief · Thursday</b>
                  <p>Doors open <del>2:45</del> <ins>3:00</ins> for the <del>3:00</del> <ins>3:15</ins> screenings.</p>
                  <p>Shuttle every 20 min from Canal Street.</p>
                </div>
              </div>
              <p className="s-pain">Volunteers work from an outdated brief.</p>
            </figure>
            <figure className="s-tool t-whatsapp" data-tool>
              <figcaption><i className="ap whatsapp" />WhatsApp</figcaption>
              <div className="win">
                <div className="wa-head"><b>Harbor Lights volunteers</b><span>83 members</span></div>
                <div className="wa-body">
                  <p className="wa-them"><b>Noor</b>Is the 3:00 still on?</p>
                  <p className="wa-them"><b>Theo</b>Sheet says 3:00, email says 3:15</p>
                  <p className="wa-me">Checking with the office</p>
                </div>
              </div>
              <p className="s-pain">Staff spend the day relaying information.</p>
            </figure>
          </div>
          <div className="s-swipe" aria-hidden="true"><span data-dots>{[0, 1, 2, 3].map(i => <i key={i} className={i === 0 ? 'on' : ''} />)}</span>Swipe to see all four</div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* 2. the trigger */}
      <section className="s-pin s-trigger" data-scene="trigger">
        <div className="s-sticky">
          <canvas className="s-snowfield" data-snowfield aria-hidden="true" />
          <div className="s-trigger-copy" data-trigger-copy>
            <span className="s-clock">Thursday · 1:10 pm</span>
            <h2 className="s-h2">Usher keeps an eye on everything that could go wrong.</h2>
            <p className="s-lead" style={{ textAlign: 'center' }}>It follows the weather, flight arrivals and shuttle times all day. When one of them affects your programme, it shows you exactly what it touches.</p>
          </div>
          <div className="s-flow" data-feeds data-lve-skip>
            <div className="s-flow-col">
              {[['❄', 'Weather', 'Snow 2:00 to 7:00 pm'], ['✈', 'Flights', 'DL2207 landed 21 min late'], ['◷', 'Shuttle', 'Harbor Loop 12 min late']].map(([ic, k, v]) => (
                <div className="s-flow-feed" data-feed-in key={k}><span className="ic">{ic}</span><span><b>{k}</b><small>{v}</small></span></div>
              ))}
            </div>
            <div className="s-flow-mid">
              <svg viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true">
                {[50, 150, 250].map(y => <path key={`i${y}`} data-feed="in" d={`M0 ${y} C 60 ${y}, 60 150, 100 150`} />)}
                {[38, 113, 188, 263].map(y => <path key={`o${y}`} data-feed="out" className="out" d={`M100 150 C 140 150, 140 ${y}, 200 ${y}`} />)}
              </svg>
              <div className="s-flow-node" data-node><b>Usher</b><small>checks 40 screenings, 312 tickets, 60 shifts</small></div>
            </div>
            <div className="s-flow-col">
              {[['3 screenings move to 3:15 pm', 'Late Country, Quiet Animals, Wild Tide'], ['21 attendees get their new time', 'Seats held, leave 15 min early'], ['Yara Hollis opens Pavel’s panel', 'He joins at 4:20 pm'], ['3 door teams briefed', 'Hold doors until 3:20 pm']].map(([b2, sm]) => (
                <div className="s-flow-out" data-feed-out key={b2}><b>{b2}</b><small>{sm}</small></div>
              ))}
            </div>
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>


      {/* 3. the recommendation */}
      <section className="s-pin s-rec" data-scene="rec">
        <div className="s-sticky">
          <div className="s-rec-copy">
            <div data-rec-step="1"><h2 className="s-h2">It suggests a new plan, and you decide.</h2><p className="s-lead">The prints are 15 minutes late, so Usher proposes starting three screenings at 3:15. You see every change on the calendar before anything is sent.</p></div>
            <div data-rec-step="2" style={{ position: 'absolute', top: 0, opacity: 0 }}><h2 className="s-h2">It looks after your guests, too.</h2><p className="s-lead">Pavel Kettering is stuck on the harbor bridge. Usher asks Yara Hollis, who is already at Pier 9 Hall, to open his panel until he arrives.</p></div>
          </div>
          <div className="s-rec-stage" data-lve-skip aria-hidden="true">
            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}><Cal id="rec" rich /></div>
            <div className="s-float" data-rec-alert style={{ top: '-30px', right: '3%' }}>
              <span className="ic"><Brief /></span><span><b>Print delivery 15 min late</b><small>3 screenings at 3:00 pm</small></span><span className="pill">Recommendation</span>
            </div>
          </div>
          <div className="s-rec-list" data-lve-skip>
            <div className="s-rec-malert"><Brief /><span><b>Print delivery 15 min late</b><small>3 screenings at 3:00 pm</small></span></div>
            <h3>Changes</h3>
            {[
              [Move, '"Wild Tide" 3:00 → 3:15 pm', 'Riverside Studio'],
              [Move, '"Late Country" 3:00 → 3:15 pm', 'Harbor Theater'],
              [Move, '"Quiet Animals" 3:00 → 3:15 pm', 'Canal Street Cinema'],
              [People, 'Tell 21 people with these in their plan', 'Seats are held'],
              [Brief, 'Brief 3 door teams', 'Staff only'],
              [Swap, 'Yara Hollis opens "Selling at Markets"', 'Pavel Kettering joins on arrival'],
            ].map(([I, t, s]) => { const Icon = I as typeof Move; return <div className="s-chg" data-chg key={String(t)}><Icon /><span>{String(t)}<small>{String(s)}</small></span>{I === Swap && <span className="s-chg-swap"><i className="out">PK</i>→<i className="in">YH</i></span>}</div>; })}
          </div>
          <div className="s-progress"><i /></div>
        </div>
      </section>

      {/* call to action */}
      <footer className="s-footer">
        <div className="s-footer-bg" data-footer-bg />
        <h2 className="s-h1" data-split-scroll>See how Usher handles a snow day at Harbor Lights.</h2>
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

/** Put the hero calendar back on the original plan instantly (no reverse animation). */
function resetHero(cal: Element) {
  cal.querySelectorAll<HTMLElement>('[data-move]').forEach(el => {
    gsap.set(el, { top: `${Number(el.dataset.top)}%` });
    el.classList.remove('hot');
    const tag = el.querySelector('[data-tag]'); if (tag) gsap.set(tag, { opacity: 0 });
    const time = el.querySelector('[data-time]'); if (time?.getAttribute('data-orig')) time.textContent = time.getAttribute('data-orig');
  });
  const ev = cal.querySelector<HTMLElement>('[data-swap]');
  if (ev) {
    ev.classList.remove('hot');
    const ins = ev.querySelector<HTMLElement>('[data-in]'); if (ins) ins.style.display = 'none';
    const out = ev.querySelector<HTMLElement>('[data-out]'); if (out) out.innerHTML = 'Pavel Kettering';
  }
  gsap.set(cal.querySelectorAll('[data-ghost], [data-snowband]'), { opacity: 0 });
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
      const rich = cal.classList.contains('rich');
      if (ins) ins.style.display = on ? (rich ? 'inline-grid' : 'inline') : 'none';
      if (out) {
        if (rich) out.textContent = on ? 'Yara Hollis opens · Pavel joins 4:20' : 'Pavel Kettering is running late';
        else out.innerHTML = on ? '<s>Pavel Kettering</s>' : 'Pavel Kettering';
      }
    })
    .fromTo(ev, { rotateX: 90 }, { rotateX: 0, duration: 0.5, ease: 'power3.out' });
  return tl;
}

/** Reduced motion: show every scene in its final state. */
function finalStates(q: (s: string) => Element[]) {
  for (const cal of q('[data-cal]')) {
    cal.querySelectorAll<HTMLElement>('[data-move]').forEach(el => { el.style.top = `${Number(el.dataset.top) + (Number(el.dataset.move) / (T1 - T0)) * 100}%`; el.classList.add('hot'); });
    cal.querySelectorAll<HTMLElement>('[data-ghost], [data-snowband]').forEach(el => { el.style.opacity = '1'; });
    const ins = cal.querySelector<HTMLElement>('[data-in]'); if (ins) ins.style.display = cal.classList.contains('rich') ? 'inline-grid' : 'inline';
  }
  q('[data-cal="hero"]').forEach(el => { (el as HTMLElement).style.transform = 'rotateX(24deg) rotateZ(-6deg)'; });
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
