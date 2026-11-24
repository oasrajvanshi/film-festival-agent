// The cover's film: a strip of 35 mm film coiling down the right of the screen, as real 3D geometry.
//
// Shape. The strip winds around one tilted axis, the way a film does when it springs off its reel, and
// its width always lies along that axis. A strip like that only ever bends the way film can bend, so it
// turns over smoothly at each side and never pinches or smears. Both ends spiral out of the frame.
//
// Look. Two triangles per step, shaded on the graphics card: pictures in rounded windows, punched
// sprocket holes you can see through, a glossy front and a duller back, lit warm from the left (the
// cinema screen) with a cool rim from above; what is further away falls back into the dark.
//
// Depth. The half of the coil nearer than the cast is drawn on a canvas above the cast and the rest on
// a canvas below it, so the film passes behind the mascots and then in front of them.
//
// Touch. Point at the film and a ripple runs along it (a small wave simulation) while the picture under
// the pointer lights up; drag it to scrub; scrolling runs it faster; moving the pointer turns the coil.

import { gsap } from 'gsap';

export interface ReelState { /** 0 rolled up, 1 unrolled */ reveal: number; /** 0 in place, 1 gone (scrolling on) */ out: number }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;
const N = 560;                                   // steps along the strip
const PSI0 = -100, PSI1 = 360 + 106;             // one loop, in degrees: the front of it at 0 and again at 360
const PHI = 24 * RAD;                            // how far the coil leans towards you
const CAM = 1500;                                // distance of the eye, in px

const VERT = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aW; layout(location=3) in vec2 aSV;
uniform vec2 uRes, uCtr; uniform float uCam, uShadow;
out vec3 vP, vN, vW; out vec2 vSV;
void main() {
  vec3 p = aP + vec3(0., uShadow * 22., 0.);
  float w = (uCam - p.z) / uCam;
  vP = aP; vN = aN; vW = aW; vSV = aSV;
  gl_Position = vec4(2. * (uCtr.x * w + p.x) / uRes.x - w, w - 2. * (uCtr.y * w + p.y) / uRes.y, -p.z / 4000. * w, w);
}`;

const FRAG = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vP, vN, vW; in vec2 vSV; out vec4 o;
uniform sampler2DArray uPics;
uniform float uCam, uShadow, uHalf, uPitch, uLen, uAcross, uFlow, uEnd, uTotal, uCount, uHover, uHoverK, uAlpha, uK;
uniform vec3 uKey;
float box(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
float cover(float d) { float w = max(length(vec2(dFdx(d), dFdy(d))), 1e-4) * .85; return smoothstep(w, -w, d); }
void main() {
  float s = vSV.x, v = vSV.y;
  if (s > uEnd) discard;
  if (uShadow > .5) {
    float face = abs(dot(normalize(vN), normalize(vec3(0., 0., uCam) - vP)));
    float a = (1. - smoothstep(.2, 1., abs(v))) * .42 * smoothstep(.12, .6, face) * uAlpha;
    o = vec4(0., 0., 0., a); return;
  }
  float al = s - uFlow, k = floor(al / uPitch), fu = al - (k + .5) * uPitch, y = v * uHalf;
  // punched holes
  float hp = uPitch / 6., hu = mod(al, hp) - hp * .5, edge = (uHalf - uAcross * .5) * .5;
  float hole = cover(box(vec2(hu, abs(y) - (uHalf - edge)), vec2(hp * .27, edge * .36), 1.6 * uK));
  float a = (1. - hole) * uAlpha;
  if (a < .01) discard;
  vec3 V = normalize(vec3(0., 0., uCam) - vP), G = normalize(vN);
  bool front = dot(G, V) > 0.;
  vec3 n = normalize(G + normalize(vW) * v * .34); if (!front) n = normalize(-G + normalize(vW) * v * .34);
  vec3 L1 = normalize(uKey - vP), L2 = normalize(vec3(500., -900., 520.) - vP);
  float d1 = max(dot(n, L1) * .72 + .28, 0.), d2 = max(dot(n, L2), 0.);
  vec3 H1 = normalize(L1 + V), H2 = normalize(L2 + V);
  float sp1 = pow(max(dot(n, H1), 0.), 46.) + .22 * pow(max(dot(n, H1), 0.), 9.);
  float sp2 = pow(max(dot(n, H2), 0.), 60.);
  float fr = pow(1. - max(dot(n, V), 0.), 3.);
  vec3 warm = vec3(1., .88, .62), cool = vec3(.46, .68, .68);
  float gloss = front ? 1. : .45;
  vec3 base = front ? vec3(.052, .036, .03) : vec3(.105, .07, .05);
  vec3 col = base * (.55 + 1.1 * d1 * warm + .5 * d2 * cool);
  // the picture
  float win = cover(box(vec2(fu, y), vec2(uLen, uAcross) * .5, 4. * uK));
  if (win > 0.) {
    vec2 uv = vec2(.5 - fu / uLen, .5 - y / uAcross);
    vec3 pic = texture(uPics, vec3(uv, mod(mod(k, uCount) + uCount, uCount))).rgb;
    float lum = dot(pic, vec3(.3, .59, .11));
    vec3 quiet = mix(vec3(.05, .035, .03), vec3(.98, .84, .62), smoothstep(0., .82, lum));
    quiet = mix(quiet, pic, .12);                                       // one amber print: every picture the same two tones
    float at = s / uTotal, show = smoothstep(.06, .3, at) * (1. - smoothstep(.52, .8, at));
    float hov = uHoverK * (1. - smoothstep(.35, .65, abs(k - uHover)));
    vec3 lit = quiet * (.2 + .78 * d1 * mix(vec3(1.), warm, .5)) * mix(.34, 1.12, show);
    if (!front) lit = mix(lit * .62, base * 1.6, .3);
    lit = mix(lit, pic * 1.22 + .04, hov);
    col = mix(col, lit, win);
  }
  col += gloss * (sp1 * .5 * warm + sp2 * .28 * cool) + fr * (front ? .13 : .2) * mix(warm, cool, .35);
  // the thickness of the film catches the light along both edges
  float e = smoothstep(uHalf - 1.7 * uK, uHalf - .3 * uK, abs(y));
  col += e * (.1 + .5 * d1) * warm * .5;
  float far = smoothstep(60., -330., vP.z / uK);
  col = mix(col, vec3(.028, .036, .036), far * .62);
  o = vec4(col * a, a);
}`;

interface Draw { render: (verts: Float32Array, shadow: Float32Array, order: Uint16Array, count: number, u: Record<string, number>, ctr: [number, number], key: [number, number, number]) => void; size: (w: number, h: number, dpr: number) => void; picture: (i: number, src: TexImageSource) => void; free: () => void }

/** One canvas and everything the graphics card needs to draw the strip on it. */
function painter(canvas: HTMLCanvasElement, count: number): Draw | null {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) console.error('reel', gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const U = (n: string) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(prog, n)));
  const strip = () => {
    const vao = gl.createVertexArray()!, vb = gl.createBuffer()!;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 2, 36]].forEach(([l, n, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 44, off); });
    return { vao, vb };
  };
  const film = strip(), shade = strip();
  const ib = gl.createBuffer()!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 8, gl.RGBA8, 300, 200, count);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D_ARRAY, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return {
    size: (w, h, dpr) => { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); gl.viewport(0, 0, canvas.width, canvas.height); },
    picture: (i, src) => { gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, 300, 200, 1, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); },
    render: (verts, shadow, order, n, u, ctr, key) => {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!n) return;
      gl.useProgram(prog); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.uniform2f(U('uRes'), u.W, u.H); gl.uniform2f(U('uCtr'), ctr[0], ctr[1]); gl.uniform3f(U('uKey'), key[0], key[1], key[2]);
      for (const k of ['uCam', 'uHalf', 'uPitch', 'uLen', 'uAcross', 'uFlow', 'uEnd', 'uTotal', 'uCount', 'uHover', 'uHoverK', 'uAlpha', 'uK']) gl.uniform1f(U(k), u[k]);
      for (const [pass, buf, data] of [[1, shade, shadow], [0, film, verts]] as const) {
        gl.uniform1f(U('uShadow'), pass);
        gl.bindVertexArray(buf.vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf.vb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, order.subarray(0, n), gl.DYNAMIC_DRAW);
        gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
      }
    },
    free: () => { gl.deleteProgram(prog); gl.deleteTexture(tex); gl.deleteBuffer(ib); for (const b of [film, shade]) { gl.deleteBuffer(b.vb); gl.deleteVertexArray(b.vao); } },
  };
}

export function filmReel(wrap: HTMLElement, frames: string[], opts: { phone: boolean; reduce: boolean; onFrame?: (i: number | null) => void }) {
  const state: ReelState = { reveal: opts.reduce ? 1 : 0, out: 0 };
  const backC = wrap.querySelector<HTMLCanvasElement>('[data-reel-back]')!, frontC = wrap.querySelector<HTMLCanvasElement>('[data-reel-front]')!;
  const back = painter(backC, frames.length), front = painter(frontC, frames.length);
  const cast = [...wrap.querySelectorAll<HTMLElement>('[data-flo]')];
  const says = [...wrap.querySelectorAll<HTMLElement>('[data-bubble]')];              // what each one says, above the film

  // the pictures, cropped 3:2
  frames.forEach((src, i) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 200;
      const w = im.naturalWidth, h = im.naturalHeight, cw = Math.min(w, h * 1.5), ch = cw / 1.5;
      c.getContext('2d')!.drawImage(im, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 300, 200);
      back?.picture(i, c); front?.picture(i, c);
    };
    im.src = src;
  });

  let W = 0, H = 0, K = 1, CX = 0, CY = 0, half = 46, pitch = 104, total = 1;
  const B = new Float32Array(N * 3), L = new Float32Array(N), Q = new Float32Array(N);   // resting coil, length so far, its angle
  const P = new Float32Array(N * 3), T = new Float32Array(N * 3), WV = new Float32Array(N * 3), NV = new Float32Array(N * 3);
  const SX = new Float32Array(N), SY = new Float32Array(N), SC = new Float32Array(N);    // on screen, and how near (scale)
  const verts = new Float32Array(N * 2 * 11), shadow = new Float32Array(N * 2 * 11);
  const orderB = new Uint16Array((N - 1) * 6), orderF = new Uint16Array((N - 1) * 6);
  const idx = Array.from({ length: N - 1 }, (_, i) => i);
  const dis = new Float32Array(N), vel = new Float32Array(N);                            // the ripple

  const px = { x: -9999, y: -9999, k: 0, tk: 0, mx: 0, my: 0, ex: 0, ey: 0, lx: 0, ly: 0 };
  let flow = 0, speed = 30, boost = 0, hover = -999, hoverK = 0, hoverT = 0, told: number | null = null;
  let drag: null | { i: number; x: number; y: number; t: number; v: number } = null;
  let lastScroll = window.scrollY, raf = 0, running = false, visible = true, lastHop = 0;

  function build() {
    const r = wrap.getBoundingClientRect();
    W = r.width || 1; H = r.height || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.phone ? 2 : W > 1700 ? 1.5 : 2);
    back?.size(W, H, dpr); front?.size(W, H, dpr);
    if (opts.phone) { K = Math.min(W / 390 * 0.6, H / 470 * 0.66); CX = W * 0.54; CY = H * 0.5; }
    else if (W < H) { K = Math.min(H / 1500, W / 900); CX = W * 0.6; CY = H * 0.68; }             // tablets held upright
    else { K = Math.min(H / 900, W / 1440) * 1.02; CX = W * 0.755; CY = H * 0.47; }
    wrap.style.setProperty('--k', String(opts.phone ? 1 : K));
    half = 48 * K; pitch = 124 * K;
    let x0 = 0, y0 = 0, z0 = 0;
    for (let i = 0; i < N; i++) {
      const psi = PSI0 + (PSI1 - PSI0) * (i / (N - 1));
      const head = Math.max(0, -psi) / 60, tail = Math.max(0, psi - 335) / 60;
      let R = 236 + 34 * smooth(-40, 400, psi);
      R += R * (head * head * 0.95 + tail * tail * 1.15);
      const a = psi * RAD;
      const x = -R * Math.sin(a) * K, z = R * Math.cos(a) * (1 - 0.35 * smooth(0, 1.2, tail)) * K;
      const drop = Math.pow(Math.max(0, psi) / 360, 1.55);                     // slow at the top, so the far side shows above the near side
      const y = (-262 + 392 * drop - head * head * 104 - tail * tail * 30) * K;
      // lean towards the viewer
      const yy = y * Math.cos(PHI) + z * Math.sin(PHI), zz = z * Math.cos(PHI) - y * Math.sin(PHI);
      B[i * 3] = x; B[i * 3 + 1] = yy; B[i * 3 + 2] = zz; Q[i] = psi;
      if (i) L[i] = L[i - 1] + Math.hypot(x - x0, yy - y0, zz - z0);
      x0 = x; y0 = yy; z0 = zz;
    }
    total = L[N - 1] || 1;
    for (const el of cast) { el.dataset.h = String(el.offsetHeight || 100); el.dataset.w = String(el.offsetWidth || 100); }
  }

  /** Turn a resting point with the coil: the pointer's lean, the unrolling spin and the way out. */
  let cy = 1, sy = 0, cp = 1, sp = 0, squeeze = 1, stretch = 1, dx = 0, dy = 0;
  function pose(t: number) {
    const open = state.reveal, o = state.out;
    const yaw = px.ex * 0.2 + Math.sin(t * 0.23) * 0.035 + (1 - open) * 1.5 - o * 1.1, pitchA = px.ey * 0.1 + Math.sin(t * 0.31 + 1) * 0.02;
    cy = Math.cos(yaw); sy = Math.sin(yaw); cp = Math.cos(pitchA); sp = Math.sin(pitchA);
    squeeze = 0.62 + 0.38 * open + o * 0.25; stretch = 1 + o * 0.5; dx = o * 260 * K; dy = -o * 120 * K;
  }
  const turn = (x: number, y: number, z: number, out: Float32Array, at: number) => {
    const X = (x * cy + z * sy) * squeeze, Z = (z * cy - x * sy) * squeeze, Y = y * stretch;
    out[at] = X + dx; out[at + 1] = Y * cp - Z * sp + dy; out[at + 2] = Z * cp + Y * sp;
  };

  const ax = new Float32Array(3);
  function shape(t: number) {
    pose(t);
    // the axis the film winds around, leaning with the coil
    turn(0, -Math.cos(PHI), Math.sin(PHI), ax, 0); ax[0] -= dx; ax[1] -= dy;
    const m = Math.hypot(ax[0], ax[1], ax[2]) || 1; ax[0] /= m; ax[1] /= m; ax[2] /= m;
    for (let i = 0; i < N; i++) turn(B[i * 3], B[i * 3 + 1], B[i * 3 + 2], P, i * 3);
    frame();
    // breathe, and the ripple: both move the film along its own normal
    for (let i = 0; i < N; i++) {
      const off = Math.sin(L[i] * 0.0046 / K - t * 0.9) * 6 * K + Math.sin(L[i] * 0.0021 / K + t * 0.55) * 7 * K + dis[i];
      P[i * 3] += NV[i * 3] * off; P[i * 3 + 1] += NV[i * 3 + 1] * off; P[i * 3 + 2] += NV[i * 3 + 2] * off;
    }
    frame();
    for (let i = 0; i < N; i++) {
      const s = CAM / (CAM - P[i * 3 + 2]);
      SC[i] = s; SX[i] = CX + P[i * 3] * s; SY[i] = CY + P[i * 3 + 1] * s;
    }
  }
  /** Tangent, width (the axis, squared up to the tangent) and normal at every step. */
  function frame() {
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(N - 1, i + 1) * 3, j = i * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const tm = Math.hypot(tx, ty, tz) || 1; tx /= tm; ty /= tm; tz /= tm;
      // towards both ends the film rolls a little, so it doesn't leave the frame dead flat
      const roll = 0.4 * smooth(340, 466, Q[i]) - 0.35 * smooth(-30, -95, Q[i]);
      const d = ax[0] * tx + ax[1] * ty + ax[2] * tz;
      let wx = ax[0] - d * tx, wy = ax[1] - d * ty, wz = ax[2] - d * tz; const wm = Math.hypot(wx, wy, wz) || 1; wx /= wm; wy /= wm; wz /= wm;
      let nx = ty * wz - tz * wy, ny = tz * wx - tx * wz, nz = tx * wy - ty * wx;
      if (roll) { const c = Math.cos(roll), s = Math.sin(roll); const ux = wx * c + nx * s, uy = wy * c + ny * s, uz = wz * c + nz * s; nx = nx * c - wx * s; ny = ny * c - wy * s; nz = nz * c - wz * s; wx = ux; wy = uy; wz = uz; }
      T[j] = tx; T[j + 1] = ty; T[j + 2] = tz; WV[j] = wx; WV[j + 1] = wy; WV[j + 2] = wz; NV[j] = nx; NV[j + 1] = ny; NV[j + 2] = nz;
    }
  }

  function draw() {
    if (!back || !front) return;
    const fill = (out: Float32Array, hw: number) => {
      let o = 0;
      for (let i = 0; i < N; i++) for (const v of [-1, 1]) {
        const j = i * 3;
        out[o] = P[j] + WV[j] * hw * v; out[o + 1] = P[j + 1] + WV[j + 1] * hw * v; out[o + 2] = P[j + 2] + WV[j + 2] * hw * v;
        out[o + 3] = NV[j]; out[o + 4] = NV[j + 1]; out[o + 5] = NV[j + 2];
        out[o + 6] = WV[j]; out[o + 7] = WV[j + 1]; out[o + 8] = WV[j + 2];
        out[o + 9] = L[i]; out[o + 10] = v; o += 11;
      }
    };
    fill(verts, half); fill(shadow, half * 1.7);
    // far pieces first; the nearer half goes on the canvas above the cast (with one step of overlap at the seam)
    idx.sort((a, b) => P[a * 3 + 2] - P[b * 3 + 2]);
    let nb = 0, nf = 0;
    const put = (arr: Uint16Array, n: number, i: number) => { const a = i * 2; arr[n] = a; arr[n + 1] = a + 1; arr[n + 2] = a + 2; arr[n + 3] = a + 1; arr[n + 4] = a + 3; arr[n + 5] = a + 2; return n + 6; };
    const lap = 14 * K;
    for (const i of idx) { const z = P[i * 3 + 2]; if (z < lap) nb = put(orderB, nb, i); if (z > -lap) nf = put(orderF, nf, i); }
    const u = { W, H, uCam: CAM, uHalf: half, uPitch: pitch, uLen: pitch - 10 * K, uAcross: half * 2 - 26 * K, uFlow: flow, uEnd: state.reveal * total, uTotal: total, uCount: frames.length, uHover: hover, uHoverK: hoverK, uAlpha: 1, uK: K };
    const key: [number, number, number] = [-620 * K, -90 * K, 520 * K];
    back.render(verts, shadow, orderB, nb, u, [CX, CY], key);
    front.render(verts, shadow, orderF, nf, u, [CX, CY], key);
  }

  // The ripple: each step of film pulls on its neighbours and springs back.
  function wave(dt: number) {
    const sub = 4, h = dt / sub, c2 = 6000, k = 14, damp = 2.2;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < N - 1; i++) vel[i] += ((dis[i - 1] + dis[i + 1] - 2 * dis[i]) * c2 - dis[i] * k - vel[i] * damp) * h;
      for (let i = 1; i < N - 1; i++) dis[i] += vel[i] * h;
    }
  }
  const poke = (i: number, v: number, reach = 16) => {
    for (let j = Math.max(1, i - reach * 2); j < Math.min(N - 1, i + reach * 2); j++) vel[j] += v * Math.exp(-(((j - i) / reach) ** 2));
  };

  // The cast. `data-at`: floating inside the coil (x, y, z in coil units). `data-s`: riding the film, standing
  // on its upper edge at that angle of the coil (0, 360, 720: the front of each turn). Both turn and ripple with the coil.
  const tmp = new Float32Array(3);
  function placeCast(t: number) {
    cast.forEach((el, n) => {
      const h = Number(el.dataset.h), w = Number(el.dataset.w);
      const pos = ((opts.phone || W < H) && el.dataset.atp) || el.dataset.at;
      let x: number, y: number, z: number, need: number;
      if (pos) {
        const [a, b, c] = pos.split(',').map(Number);
        turn(a * K, b * K, c * K, tmp, 0); z = tmp[2];
        const s = CAM / (CAM - z); x = CX + tmp[0] * s - w / 2; y = CY + tmp[1] * s - h / 2; need = 0.5;
      } else {
        const ang = Number(((opts.phone || W < H) && el.dataset.sp) || el.dataset.s) + 2 * Math.sin(t * 0.45 + el.offsetHeight), i = Math.min(N - 1, Math.max(0, Math.round((ang - PSI0) / (PSI1 - PSI0) * (N - 1)))), j = i * 3;
        const s = SC[i], lift = half;
        x = SX[i] + WV[j] * lift * s - w / 2; y = SY[i] + WV[j + 1] * lift * s - h * (1 - Number(el.dataset.sink || 0)); z = P[j + 2]; need = L[i] / total;
      }
      // left/top, not transform: GSAP owns this element's transform (the scatter on scroll)
      el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`; el.style.zIndex = String(500 + Math.round(z));
      el.classList.toggle('s-flo-wait', state.reveal < need);
      const b = says[n];
      if (b) { b.style.left = `${(x + w * 0.5).toFixed(1)}px`; b.style.top = `${(y - 6).toFixed(1)}px`; b.classList.toggle('l', x + w / 2 > W * (opts.phone ? 0.4 : 0.8)); }
    });
  }

  let last = performance.now();
  function tick(now: number) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.034, (now - last) / 1000); last = now;
    const t = now / 1000;
    px.k += (px.tk - px.k) * Math.min(1, dt * 6);
    px.ex += (px.mx - px.ex) * Math.min(1, dt * 3); px.ey += (px.my - px.ey) * Math.min(1, dt * 3);
    hoverK += (hoverT - hoverK) * Math.min(1, dt * 8);
    const sc = window.scrollY, ds = sc - lastScroll; lastScroll = sc;
    boost += (Math.min(1100, Math.abs(ds) * 46) - boost) * Math.min(1, dt * 3);
    if (!drag) { speed += (30 + boost - speed) * Math.min(1, dt * 2.5); flow += speed * dt; }
    if (Math.abs(speed) > 340 && now - lastHop > 900) { lastHop = now; hop(); }
    wave(dt); shape(t);
    // the picture under the pointer, checked every frame because the film keeps moving
    const on = !opts.phone && px.tk && !gone() && state.reveal > 0.95 ? (drag ? drag.i : pick(px.x, px.y)) : -1;
    if (on >= 0) { hover = Math.floor((L[on] - flow) / pitch); hoverT = 1; tell(hover); } else { hoverT = 0; tell(null); }
    draw(); placeCast(t);
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

  // pointer (computers only; phones scroll the page with that finger)
  const local = (e: PointerEvent) => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
  /** The step of film under a point: the nearest one to the eye, if the point is on the film at all. */
  const pick = (x: number, y: number) => {
    let best = -1, bz = -Infinity;
    for (let i = 0; i < N; i += 2) {
      const j = i * 3, s = SC[i], wx = WV[j] * half * s, wy = WV[j + 1] * half * s, m2 = wx * wx + wy * wy || 1;
      const ox = x - SX[i], oy = y - SY[i], v = (ox * wx + oy * wy) / m2;
      if (Math.abs(v) > 1.08) continue;
      const d = Math.hypot(ox - wx * v, oy - wy * v);
      if (d < 9 * K && P[j + 2] > bz) { bz = P[j + 2]; best = i; }
    }
    return best;
  };
  const gone = () => state.out > 0.25;
  const tell = (k: number | null) => { if (k === told) return; told = k; opts.onFrame?.(k === null ? null : ((k % frames.length) + frames.length) % frames.length); };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    px.x = p.x; px.y = p.y; px.mx = e.clientX / innerWidth - 0.5; px.my = e.clientY / innerHeight - 0.5; px.tk = p.inside && !gone() ? 1 : 0;
    const mvx = p.x - px.lx, mvy = p.y - px.ly; px.lx = p.x; px.ly = p.y;
    if (drag) {
      const j = drag.i * 3, s = SC[drag.i], along = ((p.x - drag.x) * T[j] + (p.y - drag.y) * T[j + 1]) / s;
      const now = performance.now();
      flow += along; drag.v = along / Math.max(0.008, (now - drag.t) / 1000); drag.t = now; drag.x = p.x; drag.y = p.y;
      speed = drag.v; poke(drag.i, Math.max(-60, Math.min(60, along * 3)));
      return;
    }
    if (opts.phone || !px.tk) return;
    const i = pick(p.x, p.y);
    backC.style.cursor = i >= 0 ? 'grab' : '';
    if (i >= 0) {
      const v = Math.min(60, Math.hypot(mvx, mvy));
      poke(i, (mvy + mvx * 0.4 >= 0 ? 1 : -1) * v * 2.6 * K);
    }
  };
  const onLeave = () => { px.tk = 0; px.mx = 0; px.my = 0; };
  const onDown = (e: PointerEvent) => {
    if (opts.phone || gone()) return;
    const p = local(e), i = pick(p.x, p.y);
    if (i < 0) return;
    drag = { i, x: p.x, y: p.y, t: performance.now(), v: 0 };
    backC.setPointerCapture(e.pointerId); backC.style.cursor = 'grabbing'; poke(i, 160 * K); hop();
  };
  const onUp = () => { if (!drag) return; speed = Math.max(-1600, Math.min(1600, drag.v)); drag = null; backC.style.cursor = 'grab'; };

  build(); shape(0); draw(); placeCast(0);
  if (opts.reduce) return { state, stop: () => { back?.free(); front?.free(); } };
  window.addEventListener('pointermove', onMove, { passive: true });
  backC.addEventListener('pointerdown', onDown);
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerup', onUp);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); else halt(); });
  io.observe(wrap);
  const onVis = () => { if (document.hidden) halt(); else start(); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => build();
  window.addEventListener('resize', onResize);
  start();
  return {
    state,
    stop: () => {
      halt(); io.disconnect();
      window.removeEventListener('pointermove', onMove); backC.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp); document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize); document.documentElement.removeEventListener('pointerleave', onLeave);
      back?.free(); front?.free();
    },
  };
}
