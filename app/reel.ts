// The cover's film ribbon: a strip of film that curves down the right of the screen and twists over
// twice (where it folds, you see the back of the film). Frames run along it; it bends away from the
// pointer, runs faster when you point at it, can be dragged to scrub, and runs as the page scrolls.
// The cast of mascots rides beside it: each one is pinned to a point along the ribbon, on one side,
// so when the ribbon moves they move with it. Drawn on a canvas, about 60 frames a second, only
// while the cover is on screen.

import { gsap } from 'gsap';

export interface ReelState { reveal: number }

/** Through-points of the ribbon, as fractions of its box: computers, then phones. */
const PATH_DESK: [number, number][] = [[1.1, 0.02], [0.8, 0.12], [0.44, 0.27], [0.3, 0.47], [0.52, 0.6], [0.84, 0.73], [0.7, 0.92], [0.42, 1.1]];
const PATH_PHONE: [number, number][] = [[1.15, 0.0], [0.72, 0.1], [0.28, 0.3], [0.36, 0.55], [0.8, 0.7], [0.62, 0.92], [0.25, 1.12]];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function filmReel(wrap: HTMLElement, canvas: HTMLCanvasElement, frames: string[], opts: { phone: boolean; reduce: boolean }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { state: { reveal: 1 } as ReelState, stop: () => {} };
  const state: ReelState = { reveal: opts.reduce ? 1 : 0 };
  const imgs = frames.map(src => { const i = new Image(); i.decoding = 'async'; i.src = src; return i; });
  const cast = [...wrap.querySelectorAll<HTMLElement>('[data-flo]')];
  const half = opts.phone ? 24 : 36;                 // half the film's width
  const pitch = opts.phone ? 46 : 64, frameLen = opts.phone ? 40 : 56, holeGap = opts.phone ? 9 : 11;

  let W = 0, H = 0, dpr = 1, N = 0, total = 1;
  let bx = new Float32Array(0), by = bx, nx = bx, ny = bx, len = bx;
  const px = { x: -9999, y: -9999, k: 0, tk: 0 };   // the pointer, eased
  let flow = 0, speed = 26, boost = 0, drag: null | { i: number; x: number; y: number; t: number; v: number } = null;
  let lastScroll = window.scrollY, raf = 0, running = false, visible = true, lastHop = 0;

  function build() {
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, opts.phone ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const pts = (opts.phone ? PATH_PHONE : PATH_DESK).map(([x, y]) => [x * W, y * H]);
    // Catmull-Rom through the points, finely sampled, then measured.
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 90; k++) {
        const t = k / 90, t2 = t * t, t3 = t2 * t;
        xs.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3));
        ys.push(0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    N = xs.length;
    bx = new Float32Array(xs); by = new Float32Array(ys); nx = new Float32Array(N); ny = new Float32Array(N); len = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      const tx = bx[b] - bx[a], ty = by[b] - by[a], m = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / m; ny[i] = tx / m;
      if (i) len[i] = len[i - 1] + Math.hypot(bx[i] - bx[i - 1], by[i] - by[i - 1]);
    }
    total = len[N - 1] || 1;
    for (const el of cast) { el.dataset.h = String(el.offsetHeight || 100); el.dataset.w = String(el.offsetWidth || 100); }
  }

  // Each frame: the ribbon's points after the pointer's push and a slow idle wave, and its width
  // (negative where it has twisted over and we see its back).
  let X = new Float32Array(0), Y = X, F = X;
  function shape(t: number) {
    if (X.length !== N) { X = new Float32Array(N); Y = new Float32Array(N); F = new Float32Array(N); }
    const c1 = 0.36 + 0.025 * Math.sin(t * 0.37), c2 = 0.71 + 0.025 * Math.sin(t * 0.29 + 1.3), tw = 0.05;
    const R = opts.phone ? 110 : 170;
    for (let i = 0; i < N; i++) {
      const s = len[i] / total;
      let off = Math.sin(len[i] * 0.006 - t * 0.8) * (opts.phone ? 4 : 7);
      if (px.k > 0.01) {
        const dx = bx[i] - px.x, dy = by[i] - px.y, d = Math.hypot(dx, dy);
        if (d < R) off += Math.sign(dx * nx[i] + dy * ny[i] || 1) * (1 - d / R) ** 2 * (opts.phone ? 22 : 46) * px.k;
      }
      X[i] = bx[i] + nx[i] * off; Y[i] = by[i] + ny[i] * off;
      F[i] = Math.cos(Math.PI * (smooth(c1 - tw, c1 + tw, s) + smooth(c2 - tw, c2 + tw, s)));
    }
  }

  const at = (l: number) => { // index of the sample at arc length l
    let lo = 0, hi = N - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (len[m] < l) lo = m + 1; else hi = m; }
    return lo;
  };

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const end = Math.max(2, Math.round(N * state.reveal));
    if (end < 3) return;
    // the ribbon's body, with its shadow
    ctx!.save();
    ctx!.shadowColor = 'rgba(0, 0, 0, .55)'; ctx!.shadowBlur = 28; ctx!.shadowOffsetY = 16;
    ctx!.beginPath();
    for (let i = 0; i < end; i++) { const w = half * Math.abs(F[i]); const x = X[i] + nx[i] * w, y = Y[i] + ny[i] * w; if (i) ctx!.lineTo(x, y); else ctx!.moveTo(x, y); }
    for (let i = end - 1; i >= 0; i--) { const w = half * Math.abs(F[i]); ctx!.lineTo(X[i] - nx[i] * w, Y[i] - ny[i] * w); }
    ctx!.closePath(); ctx!.fillStyle = '#0d0806'; ctx!.fill();
    ctx!.restore();
    // where it has turned over, the back of the film: a little warmer, a little lighter
    ctx!.beginPath();
    for (let i = 0; i < end - 1; i++) {
      if (F[i] >= 0 && F[i + 1] >= 0) continue;
      const w0 = half * Math.abs(F[i]), w1 = half * Math.abs(F[i + 1]);
      ctx!.moveTo(X[i] + nx[i] * w0, Y[i] + ny[i] * w0); ctx!.lineTo(X[i + 1] + nx[i + 1] * w1, Y[i + 1] + ny[i + 1] * w1);
      ctx!.lineTo(X[i + 1] - nx[i + 1] * w1, Y[i + 1] - ny[i + 1] * w1); ctx!.lineTo(X[i] - nx[i] * w0, Y[i] - ny[i] * w0); ctx!.closePath();
    }
    ctx!.fillStyle = '#2a1d16'; ctx!.fill();
    const lim = len[end - 1];
    // the frames, carried along by the film
    const k0 = Math.floor((-flow) / pitch) - 1;
    for (let k = k0; ; k++) {
      const l = flow + k * pitch;
      if (l > lim - frameLen / 2) break;
      if (l < frameLen / 2) continue;
      const i = at(l), f = F[i];
      if (Math.abs(f) < 0.18) continue;
      const a = Math.max(0, i - 3), b = Math.min(N - 1, i + 3), ang = Math.atan2(Y[b] - Y[a], X[b] - X[a]);
      const across = (half * 2 - (opts.phone ? 18 : 24));
      const img = imgs[((k % imgs.length) + imgs.length) % imgs.length];
      ctx!.setTransform(dpr * Math.cos(ang), dpr * Math.sin(ang), -dpr * Math.sin(ang) * f, dpr * Math.cos(ang) * f, dpr * X[i], dpr * Y[i]);
      if (img.complete && img.naturalWidth) {
        const ar = frameLen / across, iw = img.naturalWidth, ih = img.naturalHeight;
        const sw = Math.min(iw, ih * ar), sh = sw / ar;
        ctx!.globalAlpha = f < 0 ? 0.42 : 1;
        ctx!.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, -frameLen / 2, -across / 2, frameLen, across);
        ctx!.globalAlpha = 1;
      }
      ctx!.fillStyle = f < 0 ? 'rgba(42, 29, 22, .45)' : 'rgba(36, 18, 8, .16)';
      ctx!.fillRect(-frameLen / 2, -across / 2, frameLen, across);
    }
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the sprocket holes down both edges
    ctx!.beginPath();
    const hw = opts.phone ? 2 : 2.6, hh = opts.phone ? 1.6 : 2;
    for (let l = ((flow % holeGap) + holeGap) % holeGap; l < lim; l += holeGap) {
      const i = at(l), f = F[i];
      if (Math.abs(f) < 0.35) continue;
      const tx = ny[i], ty = -nx[i];                       // along the film
      for (const side of [1, -1]) {
        const o = side * (half - (opts.phone ? 5 : 6.5)) * f;
        const cx = X[i] + nx[i] * o, cy = Y[i] + ny[i] * o, hy = hh * Math.abs(f);
        ctx!.moveTo(cx - tx * hw - nx[i] * hy, cy - ty * hw - ny[i] * hy);
        ctx!.lineTo(cx + tx * hw - nx[i] * hy, cy + ty * hw - ny[i] * hy);
        ctx!.lineTo(cx + tx * hw + nx[i] * hy, cy + ty * hw + ny[i] * hy);
        ctx!.lineTo(cx - tx * hw + nx[i] * hy, cy - ty * hw + ny[i] * hy);
        ctx!.closePath();
      }
    }
    ctx!.fillStyle = 'rgba(239, 229, 211, .82)'; ctx!.fill();
  }

  // The cast sits beside the ribbon: anchored at a point along it (data-s), on one side (data-side),
  // a little way off (data-gap). They drift slowly along it.
  function placeCast(t: number) {
    for (const el of cast) {
      const s0 = Number(opts.phone && el.dataset.sp ? el.dataset.sp : el.dataset.s);
      const s = s0 + 0.012 * Math.sin(t * 0.5 + s0 * 9);
      const i = Math.min(N - 1, Math.max(0, Math.round(at(s * total))));
      const side = Number(opts.phone && el.dataset.sidep ? el.dataset.sidep : el.dataset.side) || 1, gap = Number(el.dataset.gap) || 16;
      const h = Number(el.dataset.h), w = Number(el.dataset.w);
      const d = side * (half + gap + h * 0.42);
      const x = X[i] + nx[i] * d - w / 2, y = Y[i] + ny[i] * d - h / 2;
      // left/top, not transform: GSAP owns this element's transform (the scatter on scroll)
      el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`;
      const shown = state.reveal * total >= len[i] - 40;
      el.classList.toggle('s-flo-wait', !shown);
      el.querySelector('[data-bubble]')?.classList.toggle('l', x + w / 2 > W * (opts.phone ? 0.5 : 0.62));
    }
  }

  let last = performance.now();
  function tick(now: number) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    px.k += (px.tk - px.k) * Math.min(1, dt * 6);
    const sc = window.scrollY, ds = sc - lastScroll; lastScroll = sc;
    boost += (Math.min(900, Math.abs(ds) * 40) - boost) * Math.min(1, dt * 3);
    if (drag) { /* the hand moves it */ }
    else {
      const target = 26 + (px.tk > 0 ? 70 : 0) + boost;
      speed += (target - speed) * Math.min(1, dt * 2.5);
      flow += speed * dt;
    }
    if (Math.abs(speed) > 320 && now - lastHop > 900) { lastHop = now; hop(); }
    shape(t); draw(); placeCast(t);
    raf = requestAnimationFrame(tick);
  }
  function hop() {
    cast.forEach((el, i) => {
      const p = el.querySelector('[data-flo-par]');
      if (p) gsap.fromTo(p, { yPercent: 0 }, { yPercent: -16, duration: 0.2, delay: i * 0.05, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
    });
  }
  const start = () => { if (running || !visible || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); };
  const halt = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };

  // pointer: push, speed up, drag to scrub (computers only; phones scroll the page with that finger)
  const local = (e: PointerEvent) => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
  const nearest = (x: number, y: number) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i += 3) { const d = (X[i] - x) ** 2 + (Y[i] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    px.x = p.x; px.y = p.y; px.tk = p.inside && wrap.style.visibility !== 'hidden' ? 1 : 0;
    if (drag) {
      const i = drag.i, tx = ny[i], ty = -nx[i];
      const along = -((p.x - drag.x) * tx + (p.y - drag.y) * ty);
      const now = performance.now();
      flow += along; drag.v = along / Math.max(0.008, (now - drag.t) / 1000); drag.t = now; drag.x = p.x; drag.y = p.y;
      speed = drag.v;
    } else if (!opts.phone && N) {
      canvas.style.cursor = nearest(p.x, p.y).d < half + 14 ? 'grab' : '';
    }
  };
  const onDown = (e: PointerEvent) => {
    if (opts.phone || !N) return;
    const p = local(e), n = nearest(p.x, p.y);
    if (n.d > half + 14) return;
    drag = { i: n.i, x: p.x, y: p.y, t: performance.now(), v: 0 };
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; hop();
  };
  const onUp = () => { if (!drag) return; speed = Math.max(-1400, Math.min(1400, drag.v)); drag = null; canvas.style.cursor = 'grab'; };

  build(); shape(0); draw(); placeCast(0);
  if (!opts.reduce) {
    window.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); else halt(); });
    io.observe(wrap);
    const onVis = () => { if (document.hidden) halt(); else start(); };
    document.addEventListener('visibilitychange', onVis);
    const onResize = () => { build(); };
    window.addEventListener('resize', onResize);
    start();
    return {
      state,
      stop: () => {
        halt(); io.disconnect();
        window.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp); document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('resize', onResize);
      },
    };
  }
  return { state, stop: () => {} };
}
