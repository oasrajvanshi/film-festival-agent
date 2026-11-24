'use client';
// Usher: the product's own website. One story, told by scrolling:
// changes travel by hand today; a schedule change lands; Usher redraws the
// calendar; a person approves once; everyone's phone is right.

import './hl.css';
import './site.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useEffect, useRef, type MouseEvent } from 'react';
import { Bell } from './hl/icons';
import { PlanDemo } from './sitedemo';
import { Mascot, type Pose } from './ui/mascot';
import { filmReel } from './reel';
import { UsherChat } from './usherchat';

// ---------------------------------------------------------------- the calendar (1 pm to 7 pm, four venues)

const VENUES = ['Boulder Theater', 'Macky Auditorium', 'Canyon Theater', 'eTown Hall'];
const T0 = 13 * 60, T1 = 19 * 60;
const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const pct = (hm: string) => Math.max(0, (m(hm) - T0) / (T1 - T0)) * 100;
const span = (a: string, b: string) => Math.min(100, pct(b)) - pct(a);
const h12 = (hm: string) => { const h = Number(hm.slice(0, 2)); return `${h % 12 || 12}:${hm.slice(3)}`; };

interface Ev { col: number; t: string; s: string; e: string; kind?: 'panel'; move?: number; swap?: boolean; who?: string; img: string; faces?: string[] }
const EVENTS: Ev[] = [
  { col: 0, t: 'The Weight of Snow', s: '12:30', e: '14:12', who: 'Femi Hollis', img: 'f-07', faces: ['Femi Hollis'] },
  { col: 0, t: 'Q&A: The Weight of Snow', s: '14:12', e: '14:32', img: 'talk-qa' },
  { col: 0, t: 'Low Sun', s: '15:00', e: '16:41', move: 15, img: 'f-13' },
  { col: 0, t: 'Borrowed Light', s: '17:30', e: '18:53', img: 'f-19' },
  { col: 1, t: 'Saltwater Hymns', s: '12:30', e: '14:17', img: 'f-24' },
  { col: 1, t: 'Soft Animals', s: '15:00', e: '16:29', move: 15, img: 'f-30' },
  { col: 1, t: 'Every Kind of Weather', s: '17:30', e: '19:10', img: 'f-36' },
  { col: 2, t: 'The State of the Documentary', s: '13:30', e: '14:30', kind: 'panel', who: 'Nico Thibault, Ravi Castellanos', img: 'talk-speaker', faces: ['Nico Thibault', 'Ravi Castellanos', 'Luca Pell'] },
  { col: 2, t: 'Cinema Café: Producers', s: '16:00', e: '17:00', kind: 'panel', swap: true, img: 'talk-stage', faces: ['Dana Whitfield', 'Luca Pell', 'Luca Hollis'] },
  { col: 2, t: 'Financing Without a Net', s: '18:30', e: '19:30', kind: 'panel', img: 'talk-speaker', faces: ['Dana Whitfield', 'Sami Whitlock', 'Luca Abara'] },
  { col: 3, t: 'Night Swimmers', s: '15:00', e: '16:17', move: 15, who: 'Sami Whitlock', img: 'f-02', faces: ['Sami Whitlock'] },
  { col: 3, t: 'Q&A: Night Swimmers', s: '16:17', e: '16:37', move: 15, img: 'talk-qa' },
  { col: 3, t: 'Copper Valley', s: '17:30', e: '18:57', who: 'Elif Galloway', img: 'f-08', faces: ['Elif Galloway'] },
];

const TONES = ['#b9825a', '#8f6a4f', '#a4744e', '#7d5b46', '#c39367', '#6f5a4e'];
const initials = (n: string) => n.split(' ').map(w => w[0]).join('');
const tone = (n: string) => TONES[[...n].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length];

/** The cover's cast: Usher in six moods riding beside the film ribbon. They take turns to speak, and
 *  together their lines tell the whole story in miniature: hello, a problem, two ways out, the work,
 *  done, calm again. `s`: where along the ribbon (0 top, 1 bottom); `side`: which side of it;
 *  `gap`: how far off it; `depth`: how much it leans after the pointer. */
const CAST: { pose: Pose; say: string; s: number; side: 1 | -1; gap: number; depth: number; sp?: number; sideP?: 1 | -1 }[] = [
  { pose: 'ask', say: 'Hi, I\u2019m Usher!', s: 0.3, side: -1, gap: 8, depth: 1, sp: 0.45, sideP: -1 },
  { pose: 'headsup', say: 'Snow at 1 pm. Heads-up!', s: 0.13, side: -1, gap: 6, depth: 0.7, sp: 0.2, sideP: 1 },
  { pose: 'options', say: 'Two ways to fix it. You pick.', s: 0.45, side: 1, gap: 4, depth: 0.9 },
  { pose: 'working', say: 'Moving 3 screenings\u2026', s: 0.58, side: 1, gap: 4, depth: 0.6 },
  { pose: 'done', say: 'Done! Everyone\u2019s been told.', s: 0.66, side: -1, gap: 6, depth: 0.8, sp: 0.9, sideP: 1 },
  { pose: 'relax', say: 'All calm. Coffee time.', s: 0.8, side: -1, gap: 4, depth: 0.5 },
];

/** `rich`: the app's own calendar look, with each event's picture and its guests' avatars. */
const FILM_FRAMES = ['f-02', 'f-13', 'f-19', 'f-24', 'f-30', 'f-07', 'f-36', 'f-08', 'f-11', 'f-27'];

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
                          {e.swap && <i className="in" data-in style={{ display: 'none', background: tone('Ravi Castellanos') }}>YH</i>}
                          {e.faces.map(n => <i key={n} className={n === 'Dana Whitfield' ? 'late' : ''} data-late={n === 'Dana Whitfield' ? '' : undefined} style={{ background: tone(n) }} title={n}>{initials(n)}</i>)}
                        </span>
                      )}
                      {e.swap && <em className="s-ev-note" data-out>Dana Whitfield can't make it</em>}
                    </> : <>
                      <b>{e.t}</b>
                      <small data-time>{h12(e.s)} to {h12(e.e)}</small>
                      {e.swap ? <em><ins data-in style={{ display: 'none' }}>Ravi Castellanos · </ins>Luca Pell, <span data-out>Dana Whitfield</span></em> : e.who && <em>{e.who}</em>}
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
    let stopLean: (() => void) | null = null;
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
    const reelWrap = root.current!.querySelector<HTMLElement>('[data-reel]');
    const reelCanvas = root.current!.querySelector<HTMLCanvasElement>('[data-reel-canvas]');
    const reel = reelWrap && reelCanvas && !reduce
      ? filmReel(reelWrap, reelCanvas, FILM_FRAMES.map(id => `/hl/ev/${id}.jpg`), { phone: matchMedia('(max-width: 760px)').matches, reduce })
      : null;
    // Development only: lets a test browser run the timelines at real speed in a background tab.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __gsap?: typeof gsap }).__gsap = gsap;
    const stopSnow = snowfield(root.current!.querySelector<HTMLCanvasElement>('[data-snowfield]'), reduce);

    // Computers: the wheel glides (one smoothing for the whole page, so every scene follows it evenly).
    // Phones keep their own native scrolling.
    const glide = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(max-width: 760px)').matches && !matchMedia('(pointer: coarse)').matches
      ? ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 0.9, effects: false, smoothTouch: false })
      : null;
    smootherRef = glide;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);
      if (reduce) { finalStates(q); q('[data-leader]').forEach(e => e.remove()); q('[data-reel]').forEach(e => e.remove()); root.current?.classList.add('ready'); return; }

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
      // Hero, revealed step by step: first only the headline, large and centred;
      // scrolling brings it into place and lets the rest arrive.
      const hero = q('.s-hero')[0] as HTMLElement;
      const h1 = q('.s-hero .s-h1')[0] as HTMLElement;
      // Phones: native scrolling only. The address bar resizing the page must not re-lay out scenes,
      // and nothing is pinned or scrubbed; each part fades up once as it comes into view.
      if (phone) ScrollTrigger.config({ ignoreMobileResize: true });
      gsap.set(q('[data-cal="hero"]'), { rotateX: phone ? 0 : 24, rotateZ: phone ? 0 : -6 });
      intro.fromTo(q('.s-hero .split-word'), { yPercent: 110 }, { yPercent: 0, duration: 1.05, stagger: 0.05, ease: 'power4.out' }, seen ? 0.1 : 1.75);
      // The film unrolls down the right after the headline; each figure pops up as the film reaches it.
      if (reel) intro.fromTo(reel.state, { reveal: 0 }, { reveal: 1, duration: 1.9, ease: 'power2.inOut' }, (seen ? 0.1 : 1.75) + 0.35);
      // Scrolling on, they fly apart outwards (each away from the centre) and the page moves on.
      const flo = q('[data-flo]') as HTMLElement[];
      const apart = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const dx = (r.left + r.width / 2 - innerWidth / 2) / (innerWidth / 2), dy = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2);
        return { x: dx * innerWidth * 0.3, y: dy * innerHeight * 0.3 - 40, rotation: dx * 20, scale: 0.55, autoAlpha: 0 };
      };
      // The hero: the headline first, alone and centred. One scroll settles it into place while the
      // page holds still; everything else arrives in that same scroll, then the page rests a moment
      // before it moves on. Phones: no holding; the rest arrives on its own after the headline.
      gsap.set(q('[data-hero-fade]'), { autoAlpha: 0, y: 24 });
      gsap.set(q('.s-hero-stage'), { autoAlpha: 0, y: phone ? 30 : 60 });
      gsap.set(q('[data-hero-float]'), { autoAlpha: 0, y: 18 });
      if (!phone) {
        // The title starts on the left, alone and a little larger, at the middle of the screen; the film is on the right.
        const r0 = h1.getBoundingClientRect();
        const toCentre = { x: 0, y: innerHeight / 2 - (r0.top + r0.height / 2) };
        gsap.set(h1, { x: toCentre.x, y: toCentre.y, scale: 1.12, transformOrigin: '0% 50%', force3D: true });
        const settle = gsap.timeline({ defaults: { ease: 'power2.out' }, scrollTrigger: { trigger: hero, start: 'top top', end: '+=80%', scrub: true, pin: true, anticipatePin: 1 } })
          .to(h1, { x: 0, y: 0, scale: 1, duration: 1, ease: 'power2.inOut' }, 0)
          .to(q('.s-scrollcue'), { autoAlpha: 0, duration: 0.2 }, 0)
          .to(q('[data-reel-canvas]'), { autoAlpha: 0, xPercent: 18, rotation: 4, duration: 0.6, ease: 'power2.in' }, 0.08);
        flo.forEach((el, i) => settle.to(el, { ...apart(el), duration: 0.55, ease: 'power2.in' }, 0.04 + i * 0.03));
        settle
          .to(q('[data-hero-fade]'), { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08 }, 0.7)
          .to(q('.s-hero-stage'), { autoAlpha: 1, y: 0, duration: 0.5 }, 0.75)
          .to(q('[data-hero-float]'), { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, 0.9)
          // everything is in place: a short rest before the page moves on
          .to({}, { duration: 0.4 });
      } else {
        const settle = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } })
          .to(q('[data-hero-fade]'), { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0)
          .to(q('.s-hero-stage'), { autoAlpha: 1, y: 0, duration: 0.8 }, 0.1)
          .to(q('[data-hero-float]'), { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.2);
        intro.call(() => { settle.play(); }, [], (seen ? 0.1 : 1.75) + 1.4);
        // The film and the cast leave as the page starts to move (decoration only).
        gsap.to(q('[data-reel-canvas]'), { yPercent: -20, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: '+=40%', scrub: 0.6 } });
        flo.forEach(el => gsap.to(el, { ...apart(el), ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: '+=40%', scrub: 0.6 } }));
      }
      // Computers: the cast leans after the pointer a little, the nearer ones more.
      if (!phone) {
        const lean = (q('[data-flo-par]') as HTMLElement[]).map(el => ({ d: Number(el.dataset.depth) || 0.5, x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }) }));
        const onMove = (e: PointerEvent) => {
          const dx = e.clientX / innerWidth - 0.5, dy = e.clientY / innerHeight - 0.5;
          lean.forEach(l => { l.x(dx * 46 * l.d); l.y(dy * 30 * l.d); });
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        stopLean = () => window.removeEventListener('pointermove', onMove);
      }
      // Every starting state is set: now the hero may be seen (it was hidden so the finished layout never flashes first).
      root.current?.classList.add('ready');

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
      if (!phone) gsap.to(q('[data-hero-bg]'), { yPercent: 12, ease: 'none', scrollTrigger: { trigger: q('.s-hero')[0], start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to(q('[data-cal-wrap]'), { y: phone ? -8 : -14, rotateX: phone ? 0 : 3, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2.4 });

      // The problems: each one plays in full where you can see it. The headline rises, the cards
      // follow one after another, their pictures settle, and the trouble in each one lights up.
      q('.s-prob').forEach(sec => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: sec, start: 'top 70%', once: true } })
          .fromTo(sec.querySelectorAll('.s-prob-copy > *'), { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.09 }, 0);
        if (!phone) tl.fromTo(sec.querySelectorAll('.s-prob-item'), { autoAlpha: 0, y: 56 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.14 }, 0.25)
          .fromTo(sec.querySelectorAll('.s-risk-img'), { scale: 1.12 }, { scale: 1, duration: 1.6, ease: 'power2.out' }, 0.25);
        tl.fromTo(sec.querySelectorAll('.s-risk-card li'), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.08 }, phone ? 0.3 : 0.75);
        const marks = sec.querySelectorAll('[data-tool] .edit, [data-tool] .clash, [data-tool] .row.u');
        if (marks.length) tl.fromTo(marks, { backgroundColor: 'rgba(232, 104, 75, 0)' }, { backgroundColor: 'rgba(232, 104, 75, .2)', duration: 0.5, stagger: 0.1 }, phone ? 0.4 : 1.1);
      });

      // The watch: the weather, flights and shuttle feed into Usher, and what it found comes out.
      // Computers: the scene holds while one scroll draws it, then rests before moving on.
      // Phones: it plays on its own once it is on screen.
      // The lines are stretched to the space between the cards (and keep a fixed stroke), so their
      // drawn length on screen is longer than their own length: dash generously so each draws in full.
      q('[data-feed]').forEach(pth => { const len = (pth as unknown as SVGPathElement).getTotalLength() * 6; gsap.set(pth, { strokeDasharray: len, strokeDashoffset: len }); });
      const watchEl = q('[data-scene="trigger"]')[0];
      const watch = phone
        ? gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: watchEl, start: 'top 55%', once: true } })
        : gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: watchEl, start: 'top top', end: '+=90%', scrub: true, pin: true, anticipatePin: 1 } });
      watch.fromTo(q('[data-trigger-copy] > *'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0)
        .fromTo(q('[data-feed-in]'), { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.1 }, 0.25)
        .to(q('[data-feed="in"]'), { strokeDashoffset: 0, duration: 0.5, stagger: 0.06 }, 0.55)
        .fromTo(q('[data-node]'), { scale: 0.6, autoAlpha: 0, transformOrigin: '50% 50%' }, { scale: 1, autoAlpha: 1, duration: 0.4 }, 0.95)
        .to(q('[data-feed="out"]'), { strokeDashoffset: 0, duration: 0.5, stagger: 0.06 }, 1.2)
        .fromTo(q('[data-feed-out]'), { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.1 }, 1.45);
      if (!phone) watch.to({}, { duration: 0.45 });

      // The new plan: when it reaches the top of the screen the page stops there until the demo
      // has played through once, so nothing in it is missed; then scrolling carries on.
      const planEl = q('.pd')[0] as HTMLElement | undefined;
      if (planEl && !reduce) {
        let held = false;
        const release = () => {
          if (!held) return;
          held = false;
          if (glide) glide.paused(false);
          else { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; document.body.style.touchAction = ''; }
        };
        releasePlan = release;
        ScrollTrigger.create({
          trigger: planEl, start: phone ? 'top 64px' : 'top 14%', once: true,
          onEnter: () => {
            held = true;
            if (glide) { glide.scrollTo(planEl, true, 'top 14%'); setTimeout(() => { if (held) glide.paused(true); }, 450); }
            else {
              window.scrollTo({ top: planEl.getBoundingClientRect().top + window.scrollY - 64 });
              document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; document.body.style.touchAction = 'none';
            }
            window.dispatchEvent(new Event('pd-play'));
            setTimeout(release, 9500);
          },
        });
        window.addEventListener('pd-done', release);
      }

      // --- 3. the recommendation: the calendar turns to face you and redraws itself
      q('[data-reveal]').forEach(el => gsap.fromTo(el, { y: 40, autoAlpha: 0, filter: 'blur(8px)' }, { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 1, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } }));
      q('[data-split-scroll]').forEach(el => {
        split([el]);
        gsap.fromTo(el.querySelectorAll('.split-word'), { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: 0.05, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
      gsap.fromTo(q('[data-footer-bg]'), { yPercent: -10, scale: 1.1 }, { yPercent: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: q('.s-footer')[0], start: 'top bottom', end: 'bottom bottom', scrub: true } });
    }, root);

    const stopTalk = reduce ? () => {} : castTalk(root.current!, 3.4);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    return () => {
      window.removeEventListener('load', refresh);
      stopSnow();
      stopTalk(); stopLean?.(); stopLean = null; reel?.stop();
      ctx.revert();
      glide?.kill(); smootherRef = null;
      if (releasePlan) { window.removeEventListener('pd-done', releasePlan); releasePlan(); releasePlan = null; }
    };
  }, []);

  const go = (hash: string) => (e: MouseEvent) => {
    const el = document.querySelector(hash);
    if (!el) return;
    e.preventDefault();
    if (smootherRef) smootherRef.scrollTo(el, true, 'top top'); else el.scrollIntoView({ behavior: 'smooth' });
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
      <div id="smooth-wrapper"><div id="smooth-content">

      {/* hero */}
      <header className="s-hero">
        <div className="s-hero-bg" data-hero-bg style={{ backgroundImage: 'url(/hl/paint/hero.webp)' }} />
        {/* The film ribbon down the right, folding over twice, with the cast riding beside it.
            Point at it, drag it, or scroll: the film runs. Hover a figure to hear it. */}
        <div className="s-reel" data-reel aria-hidden="true" data-lve-skip>
          <canvas className="s-reel-canvas" data-reel-canvas />
          <div className="s-cast" data-cast>
            {CAST.map(c => (
              <div key={c.pose} className={`s-flo s-flo-${c.pose} s-flo-wait`} data-flo data-s={c.s} data-side={c.side} data-gap={c.gap} data-sp={c.sp} data-sidep={c.sideP}>
                <div className="s-flo-par" data-flo-par data-depth={c.depth}>
                  <div className="s-flo-pop">
                    <div className="s-flo-bob">
                      <span className="s-bubble" data-bubble>{c.say}</span>
                      <Mascot pose={c.pose} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="s-hero-copy">
          <h1 className="s-h1 s-h1-hero" aria-label="Usher, the best film festival change management agent">
            <span className="s-wordmark" data-split>Usher</span>
            <span className="s-h1-sub" data-split>{'The best film festival\nchange management agent.'}</span>
          </h1>
          {/* Usher, talking: a problem comes in, it types, it answers with what it does and who it tells. */}
          <div className="s-chat" data-hero-fade data-lve-skip><UsherChat /></div>
          <div className="s-ctas" data-hero-fade>
            <a className="btn" href="#story" onClick={go('#story')}>See how I work</a>
          </div>
        </div>
        <div className="s-hero-stage" data-lve-skip aria-hidden="true">
          <div className="s-hero-cal" data-cal-wrap>
            <Cal id="hero" />
          </div>
          {/* The problems as the product raises them: alerts with the agent's recommendation. */}
          <div className="s-float s-float-alert" data-hero-float>
            <span className="ic">!</span><span><b>Snow 1:00 to 7:00 pm</b></span>
          </div>
          <div className="s-float s-float-alert late" data-hero-float>
            <span className="ic"><Bell /></span><span><b>Dana Whitfield can't make it</b></span>
          </div>
        </div>
        <div className="s-scrollcue" aria-hidden="true">Scroll<i /></div>
      </header>

      {/* The two problems on one page, laid out the same way: label, headline, one line, then the facts. */}
      <section id="story" className="s-probs">
      <div className="s-prob s-risk">
        <div className="s-prob-copy">
          <p className="s-mono">Problem 1</p>
          <h2 className="s-h2">Anything can go wrong at a film festival. Trust me, I&apos;ve seen it.</h2>
          <p className="s-lead">One change moves screenings, people and volunteer shifts within minutes. Here are two from a single Saturday.</p>
        </div>
        <div className="s-prob-row s-risk-cards">
          <article className="s-prob-item s-risk-card">
            <div className="s-risk-pic"><div className="s-risk-img" style={{ backgroundImage: 'url(/hl/paint/snow.webp)' }} /></div>
            <p className="s-risk-k"><i className="ap wx">❄</i>Weather · Saturday</p>
            <h3>Snow from 1:00 to 7:00 pm</h3>
            <ul>
              <li><b>HOP bus</b> runs 12 min late</li>
              <li><b>3 screenings</b> start with people still outside</li>
              <li><b>3 door teams</b> need new instructions</li>
            </ul>
          </article>
          <article className="s-prob-item s-risk-card">
            <div className="s-risk-pic"><div className="s-risk-img" style={{ backgroundImage: 'url(/hl/paint/flight.webp)' }} /></div>
            <p className="s-risk-k"><i className="ap late">!</i>Flight cancelled · 7:10 am</p>
            <h3>Dana Whitfield&apos;s flight is cancelled</h3>
            <ul>
              <li><b>2:00 talk</b> has no producer</li>
              <li><b>6:00 premiere Q&amp;A</b> is at risk</li>
              <li><b>2 other panelists</b> don&apos;t know yet</li>
            </ul>
          </article>
        </div>
      </div>

      <div className="s-prob s-problem">
          <div className="s-prob-copy">
            <p className="s-mono">Problem 2</p>
            <h2 className="s-h2">Your team works from four versions of the same day.</h2>
            <p className="s-lead">The schedule is in a spreadsheet, updates go out by email, volunteers read a Word brief and decisions happen in a group chat. By lunch, no two people have the same plan. That&apos;s where I come in.</p>
          </div>
          <div className="s-prob-row s-tools" data-tools data-lve-skip aria-hidden="true">
            <figure className="s-prob-item s-tool t-sheets" data-tool>
              <figcaption><i className="ap sheets" />Google Sheets</figcaption>
              <div className="win">
                <div className="win-bar"><b>Sundance 2027 · Schedule</b></div>
                <table><tbody>
                  <tr><th /><th>A</th><th>B</th><th>C</th></tr>
                  <tr><th>1</th><td className="h">Start</td><td className="h">Event</td><td className="h">Guest</td></tr>
                  <tr><th>2</th><td className="edit">3:15 pm</td><td>Low Sun</td><td>None</td></tr>
                  <tr><th>3</th><td>4:00 pm</td><td>Cinema Café: Producers</td><td className="clash">Dana Whitfield</td></tr>
                  <tr><th>4</th><td>4:15 pm</td><td>Q&amp;A: Night Swimmers</td><td className="clash">Dana Whitfield</td></tr>
                  <tr><th>5</th><td>5:30 pm</td><td>Borrowed Light</td><td>None</td></tr>
                </tbody></table>
              </div>
            </figure>
            <figure className="s-prob-item s-tool t-gmail" data-tool>
              <figcaption><i className="ap gmail" />Gmail</figcaption>
              <div className="win">
                <div className="row u"><b>Mara Quist</b><span>Dana’s flight is cancelled, lands Sat</span><em>2:58 pm</em></div>
                <div className="row u"><b>Kaia Ivers</b><span>Re: Fwd: schedule v7 FINAL</span><em>2:41 pm</em></div>
                <div className="row"><b>Lantern Print</b><span>Prints running 15 min late</span><em>1:05 pm</em></div>
                <div className="row"><b>Box office</b><span>21 people asking about Night Swimmers</span><em>12:50 pm</em></div>
              </div>
            </figure>
            <figure className="s-prob-item s-tool t-word" data-tool>
              <figcaption><i className="ap word" />Word</figcaption>
              <div className="win">
                <div className="page">
                  <b>Door brief · Saturday</b>
                  <p>Doors open <del>2:45</del> <ins>3:00</ins> for the <del>3:00</del> <ins>3:15</ins> screenings.</p>
                  <p>HOP bus every 10 to 15 min, free.</p>
                </div>
              </div>
            </figure>
            <figure className="s-prob-item s-tool t-whatsapp" data-tool>
              <figcaption><i className="ap whatsapp" />WhatsApp</figcaption>
              <div className="win">
                <div className="wa-head"><b>Sundance volunteers</b><span>83 members</span></div>
                <div className="wa-body">
                  <p className="wa-them"><b>Noor</b>Is the 3:00 still on?</p>
                  <p className="wa-them"><b>Theo</b>Sheet says 3:00, email says 3:15</p>
                  <p className="wa-me">Checking with the office</p>
                </div>
              </div>
            </figure>
          </div>
          <div className="s-swipe" aria-hidden="true"><span data-dots>{[0, 1, 2, 3].map(i => <i key={i} className={i === 0 ? 'on' : ''} />)}</span>Swipe to see all four</div>
      </div>
      </section>

      {/* 2. the trigger */}
      <section className="s-trigger" data-scene="trigger">
        <div className="s-sticky">
          <canvas className="s-snowfield" data-snowfield aria-hidden="true" />
          <div className="s-trigger-copy" data-trigger-copy>
            <span className="s-clock">Saturday · 12:40 pm</span>
            <h2 className="s-h2 s-watch-h">{'I keep an eye on\neverything that could go wrong.'}</h2>
            <p className="s-lead" style={{ textAlign: 'center' }}>I follow the weather, flight arrivals and shuttle times all day. When one of them touches your programme, I show you exactly what it changes.</p>
          </div>
          <div className="s-flow" data-feeds data-lve-skip>
            <div className="s-flow-col">
              {[['❄', 'Weather', 'Snow 1:00 to 7:00 pm'], ['✈', 'Flights', 'UA JFK→DEN cancelled'], ['◷', 'Shuttle', 'HOP bus 12 min late']].map(([ic, k, v]) => (
                <div className="s-flow-feed" data-feed-in key={k}><span className="ic">{ic}</span><span><b>{k}</b><small>{v}</small></span></div>
              ))}
            </div>
            <div className="s-flow-mid">
              <svg viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true">
                {[50, 150, 250].map(y => <path key={`i${y}`} data-feed="in" d={`M0 ${y} C 60 ${y}, 60 150, 100 150`} />)}
                {[38, 113, 188, 263].map(y => <path key={`o${y}`} data-feed="out" className="out" d={`M100 150 C 140 150, 140 ${y}, 200 ${y}`} />)}
              </svg>
              <div className="s-flow-node" data-node><span className="s-node-guy"><span className="s-bubble l still">Heads-up!</span><Mascot pose="headsup" /></span><b>Usher</b><small>checks 559 events, 1,107 plans, 595 shifts</small></div>
            </div>
            <div className="s-flow-col">
              {[['3 screenings move to 3:15 pm', 'Low Sun, Soft Animals, Night Swimmers'], ['21 attendees get their new time', 'Seats held, leave 15 min early'], ['Ravi Castellanos takes Dana’s seat', 'She joins the Q&A by video'], ['3 door teams briefed', 'Hold doors until 3:20 pm']].map(([b2, sm]) => (
                <div className="s-flow-out" data-feed-out key={b2}><b>{b2}</b><small>{sm}</small></div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* 3. the new plan, shown as the product itself */}
      <section className="s-plan" id="plan" data-section>
        <div className="s-plan-head">
          <div className="s-plan-copy" data-reveal>
            <p className="s-mono">The new plan</p>
            <h2 className="s-h2">I suggest a new plan. You decide.</h2>
            <p className="s-lead">I put every change on the calendar before anything is sent. You approve once, and I tell everyone affected straight away.</p>
          </div>
          <span className="s-plan-mascot" data-reveal><span className="s-bubble l still">Your call!</span><Mascot pose="options" /></span>
        </div>
        <PlanDemo />
      </section>

      {/* call to action */}
      <footer className="s-footer">
        <div className="s-footer-bg" data-footer-bg />
        <h2 className="s-h1" data-split-scroll>Come and watch me handle a snow day at Sundance in Boulder.</h2>
        <div className="s-roles" data-reveal>
          <a className="btn primary" href="/onboarding">Try the live demo</a>
          <span className="s-cta-guy"><span className="s-bubble still">Let&apos;s go!</span><Mascot pose="done" /></span>
        </div>
      </footer>
      </div></div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

/** The cast takes turns to speak, one bubble at a time; hovering one makes it speak (and hop) now. */
function castTalk(root: HTMLElement, startAfter: number) {
  const pars = [...root.querySelectorAll<HTMLElement>('[data-flo-par]')];
  let now = -1, timer = 0, quietUntil = 0;
  const speak = (k: number) => { pars.forEach((p, j) => p.querySelector('[data-bubble]')?.classList.toggle('on', j === k)); now = k; };
  const seen = (p: HTMLElement) => p.offsetParent !== null && getComputedStyle(p).visibility !== 'hidden';
  const next = () => {
    if (Date.now() < quietUntil) return;
    const order = pars.map((p, j) => j).filter(j => seen(pars[j]));
    if (!order.length) { speak(-1); return; }
    speak(order[(order.indexOf(now) + 1) % order.length]);
  };
  const begin = window.setTimeout(() => { next(); timer = window.setInterval(next, 2600); }, startAfter * 1000);
  const onEnter = (e: Event) => {
    const p = e.currentTarget as HTMLElement;
    speak(pars.indexOf(p)); quietUntil = Date.now() + 3200;
    gsap.fromTo(p, { yPercent: 0 }, { yPercent: -12, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
  };
  pars.forEach(p => p.addEventListener('pointerenter', onEnter));
  return () => { clearTimeout(begin); clearInterval(timer); pars.forEach(p => p.removeEventListener('pointerenter', onEnter)); };
}


let smootherRef: ScrollSmoother | null = null;
let releasePlan: (() => void) | null = null;

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
    const out = ev.querySelector<HTMLElement>('[data-out]'); if (out) out.innerHTML = 'Dana Whitfield';
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
        if (rich) out.textContent = on ? 'Ravi Castellanos steps in · Dana by video' : 'Dana Whitfield can’t make it';
        else out.innerHTML = on ? '<s>Dana Whitfield</s>' : 'Dana Whitfield';
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
