'use client';
// Usher's mascot, drawn in code: a soft pebble with two camera-lens eyes (the agent keeping an
// eye on the festival) and a small smile. Vector throughout, so it is crisp at any size and every
// part can move: the eyes blink and look around, arms wave and write, props light up. Amber light
// is Usher (the agent), blue light is a person, the same key as the rest of the app. Limbs are
// drawn as cream tubes with an ink outline, so they read on the dark page and the light one alike.
// Motion stops for people who ask their system for less motion.

import { useId, type ReactNode } from 'react';

export type Pose = 'options' | 'working' | 'done' | 'relax' | 'headsup' | 'ask';

// ------------------------------------------------------------------ parts
/** An arm or leg: a cream tube with an ink outline. */
const Limb = ({ d, className }: { d: string; className?: string }) => (
  <g className={className}><path className="ms-limb-o" d={d} /><path className="ms-limb" d={d} /></g>
);
const Hand = ({ cx, cy }: { cx: number; cy: number }) => <circle className="ms-part" cx={cx} cy={cy} r="4.6" />;

/** A camera-lens eye: white ring, dark iris with a lens ring, two highlights. */
function Eye({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle className="ms-eye-white" r={r} />
      <g className="ms-pupil">
        <circle className="ms-iris" r={r * 0.66} />
        <circle className="ms-lens" r={r * 0.43} />
        <circle className="ms-shine" cx={r * 0.24} cy={-r * 0.26} r={r * 0.21} />
        <circle className="ms-shine ms-shine-s" cx={-r * 0.22} cy={r * 0.24} r={r * 0.09} />
      </g>
    </g>
  );
}

type Face = { eyes?: 'open' | 'closed'; mouth?: 'smile' | 'open' | 'o' };

/** The body in its own 120 x 140 box: feet at y 130, shadow at y 137. Children draw in front. */
function Body({ id, face = {}, arms, legs = true, children }: { id: string; face?: Face; arms?: ReactNode; legs?: boolean; children?: ReactNode }) {
  const { eyes = 'open', mouth = 'smile' } = face;
  return (
    <>
      {legs && <>
        <Limb d="M50 112 L48 126" />
        <Limb d="M71 112 L73 126" />
        <ellipse className="ms-part" cx="45.5" cy="128.5" rx="7" ry="4.2" />
        <ellipse className="ms-part" cx="75.5" cy="128.5" rx="7" ry="4.2" />
      </>}
      <path className="ms-body" style={{ fill: `url(#${id}-b)` }}
        d="M61 13 C87 13 101 35 101 64 C101 98 88 119 60 119 C33 119 21 99 21 67 C21 36 35 13 61 13 Z" />
      <path className="ms-sheen" d="M33 52 C33 38 40 27 51 21" />
      <ellipse className="ms-cheek" cx="38" cy="73" rx="5" ry="2.8" />
      <ellipse className="ms-cheek" cx="85" cy="70" rx="5" ry="2.8" />
      {eyes === 'open'
        ? <g className="ms-eyes"><Eye cx={47} cy={57} r={11.5} /><Eye cx={74} cy={54} r={12.5} /></g>
        : <g className="ms-eyes-closed">
            <path className="ms-stroke" d="M38 59 Q47 65 56 59" /><path className="ms-stroke" d="M65 56 Q74 62 83 56" />
          </g>}
      {mouth === 'smile' && <path className="ms-stroke" d="M54 76 Q61 82.5 68 75.5" />}
      {mouth === 'open' && <path className="ms-mouth" d="M52.5 74 Q61 87 69.5 73.5 Q61 77.5 52.5 74 Z" />}
      {mouth === 'o' && <ellipse className="ms-mouth" cx="61" cy="78" rx="4" ry="4.8" />}
      {arms}
      {children}
    </>
  );
}

/** The soft fill that gives the body volume (light from the top left). */
const BodyFill = ({ id }: { id: string }) => (
  <defs>
    <radialGradient id={`${id}-b`} cx="0.36" cy="0.28" r="0.85">
      <stop offset="0" stopColor="var(--ms-fill-hi)" />
      <stop offset="0.6" stopColor="var(--ms-fill)" />
      <stop offset="1" stopColor="var(--ms-fill-lo)" />
    </radialGradient>
  </defs>
);

const Shadow = ({ cx = 60, cy = 137, rx = 27, className }: { cx?: number; cy?: number; rx?: number; className?: string }) =>
  <ellipse className={`ms-shadow${className ? ` ${className}` : ''}`} cx={cx} cy={cy} rx={rx} ry="3.6" />;

// ------------------------------------------------------------------ poses
function PoseArt({ pose, id }: { pose: Pose; id: string }) {
  switch (pose) {
    // Two ways: it looks at one signpost (lit amber, Usher's suggestion), then the other (blue).
    case 'options':
      return (
        <svg viewBox="0 0 224 150">
          <BodyFill id={id} />
          <Shadow cx={112} cy={143} rx={30} />
          <g className="ms-post">
            <Limb d="M24 60 L24 134" /><ellipse className="ms-part" cx="24" cy="137" rx="10" ry="3.6" />
            <rect className="ms-glow-amber ms-look-l" x="5" y="47" width="40" height="22" rx="7" />
            <path className="ms-part" d="M11 50 H41 V66 H11 L3 58 Z" />
          </g>
          <g className="ms-post">
            <Limb d="M200 60 L200 134" /><ellipse className="ms-part" cx="200" cy="137" rx="10" ry="3.6" />
            <rect className="ms-glow-blue ms-look-r" x="179" y="47" width="40" height="22" rx="7" />
            <path className="ms-part" d="M183 50 H213 L221 58 L213 66 H183 Z" />
          </g>
          <g transform="translate(52 6)">
            <g className="ms-bob ms-look">
              <Body id={id} arms={<>
                <Limb d="M24 78 Q14 90 14 102" /><Hand cx={14} cy={104} />
                <Limb d="M98 76 Q96 92 74 90" /><Hand cx={71} cy={89} />
              </>} />
            </g>
          </g>
        </svg>
      );
    // Working: eyes on the clipboard, the pencil moving, boxes ticking one by one in amber.
    case 'working':
      return (
        <svg viewBox="0 0 172 150">
          <BodyFill id={id} />
          <Shadow cx={74} cy={143} />
          <g transform="translate(14 6)">
            <g className="ms-bob ms-look-down">
              <Body id={id} />
              <g className="ms-board">
                <rect className="ms-part" x="84" y="58" width="48" height="60" rx="6" />
                <rect className="ms-part" x="99" y="53" width="18" height="10" rx="3" />
                {[72, 87, 102].map((y, i) => (
                  <g key={y}>
                    <rect className="ms-box" x="92" y={y - 5} width="10" height="10" rx="2.5" />
                    <path className="ms-tick" d={`M94 ${y} L96.8 ${y + 2.8} L100.6 ${y - 2.6}`} pathLength={10} style={{ animationDelay: `${i * 0.7}s` }} />
                    <path className="ms-rule" d={`M107 ${y} H124`} />
                  </g>
                ))}
              </g>
              <Limb d="M99 74 Q108 82 128 84" /><Hand cx={130} cy={85} />
              <g className="ms-write">
                <Limb d="M24 78 Q34 100 78 98" /><Hand cx={81} cy={97} />
                <g transform="translate(82 96) rotate(-38)">
                  <rect className="ms-pencil" x="-2.6" y="-20" width="5.2" height="18" rx="1.4" />
                  <path className="ms-part" d="M-2.6 -2 L0 3.5 L2.6 -2 Z" />
                </g>
              </g>
            </g>
          </g>
        </svg>
      );
    // All set: a jump with squash and stretch, arms up, confetti in the app's colors.
    case 'done':
      return (
        <svg viewBox="0 0 170 160">
          <BodyFill id={id} />
          <Shadow cx={85} cy={152} className="ms-shadow-jump" />
          {[[18, 30, 'a'], [40, 8, 'h'], [64, 20, 'c'], [104, 6, 'a'], [128, 24, 'h'], [150, 10, 'c'], [30, 60, 'h'], [142, 54, 'a']].map(([x, y, c], i) => (
            <rect key={i} className={`ms-confetti ms-c-${c}`} x={Number(x)} y={Number(y)} width="5" height="9" rx="1.6" style={{ animationDelay: `${(i % 4) * 0.22}s` }} />
          ))}
          <g transform="translate(25 15)">
            <g className="ms-jump">
              <Body id={id} face={{ mouth: 'open' }} arms={<>
                <Limb d="M26 66 Q14 50 8 34" /><Hand cx={7} cy={31} />
                <Limb d="M96 63 Q108 48 113 31" /><Hand cx={114} cy={28} />
              </>} />
            </g>
          </g>
        </svg>
      );
    // Nothing waiting: settled in an armchair with a warm cup, eyes closed, steam rising.
    case 'relax':
      return (
        <svg viewBox="0 0 172 154">
          <BodyFill id={id} />
          <Shadow cx={86} cy={149} rx={58} />
          <path className="ms-part" d="M30 130 V74 C30 56 44 48 62 48 H110 C128 48 142 56 142 74 V130 Z" />
          <g transform="translate(26 -4)">
            <g className="ms-breathe">
              <Body id={id} legs={false} face={{ eyes: 'closed' }} arms={<>
                <Limb d="M26 80 Q36 96 52 94" /><Limb d="M96 78 Q86 94 70 94" />
              </>}>
                <g className="ms-cup">
                  <path className="ms-part" d="M50 86 H72 V96 C72 102 67 106 61 106 C55 106 50 102 50 96 Z" />
                  <path className="ms-stroke" d="M72 89 C79 89 79 98 72 98" />
                  <Hand cx={50} cy={95} /><Hand cx={72} cy={95} />
                  {[54, 61, 68].map((x, i) => <path key={x} className="ms-steam" d={`M${x} 80 C${x - 3} 75 ${x + 3} 71 ${x} 66`} style={{ animationDelay: `${i * 0.5}s` }} />)}
                </g>
              </Body>
            </g>
          </g>
          <rect className="ms-part" x="14" y="94" width="28" height="42" rx="13" />
          <rect className="ms-part" x="130" y="94" width="28" height="42" rx="13" />
          <rect className="ms-part" x="32" y="113" width="108" height="22" rx="9" />
          <Limb d="M38 135 L34 146" /><Limb d="M134 135 L138 146" />
        </svg>
      );
    // Heads-up: calling out through a megaphone; signal waves go out in amber.
    case 'headsup':
      return (
        <svg viewBox="0 0 190 150">
          <BodyFill id={id} />
          <Shadow cx={70} cy={143} />
          {[0, 1, 2].map(i => <path key={i} className="ms-wave-out" d="M156 42 Q166 58 156 74" style={{ animationDelay: `${i * 0.45}s` }} />)}
          <g transform="translate(10 6)">
            <g className="ms-call">
              <Body id={id} face={{ mouth: 'o' }} arms={<>
                <Limb d="M24 78 Q16 92 20 104" /><Hand cx={21} cy={106} />
                <Limb d="M98 72 Q106 70 112 66" />
              </>}>
                <g transform="translate(108 64) rotate(-14)">
                  <path className="ms-part" d="M0 -5 L30 -16 Q34 0 30 16 L0 5 Z" />
                  <ellipse className="ms-part" cx="31" cy="0" rx="4.5" ry="16" />
                  <rect className="ms-part" x="-6" y="-4.5" width="8" height="9" rx="2.5" />
                  <Hand cx={4} cy={6} />
                </g>
              </Body>
            </g>
          </g>
        </svg>
      );
    // Answering: a wave hello and a speech bubble with Usher's amber typing dots.
    case 'ask':
      return (
        <svg viewBox="0 0 184 160">
          <BodyFill id={id} />
          <Shadow cx={72} cy={154} />
          <g className="ms-bubble">
            <path className="ms-part" d="M126 6 H164 C174 6 180 12 180 22 C180 32 174 38 164 38 H132 L122 47 L124 37 C116 35 112 30 112 22 C112 12 118 6 126 6 Z" />
            {[132, 146, 160].map((x, i) => <circle key={x} className="ms-type" cx={x} cy="22" r="3.6" style={{ animationDelay: `${i * 0.16}s` }} />)}
          </g>
          <g transform="translate(12 18)">
            <g className="ms-bob">
              <Body id={id} arms={<>
                <Limb d="M96 78 Q104 92 102 104" /><Hand cx={102} cy={106} />
                <g className="ms-wave-arm"><Limb d="M24 72 Q12 58 8 42" /><Hand cx={7} cy={39} />
                  <path className="ms-air" d="M-4 30 Q-8 37 -5 44" /><path className="ms-air" d="M-10 26 Q-15 37 -11 48" /></g>
              </>} />
            </g>
          </g>
        </svg>
      );
  }
}

export function Mascot({ pose, className, label }: { pose: Pose; className?: string; label?: string }) {
  const id = `ms${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <span className={`mascot ms-${pose}${className ? ` ${className}` : ''}`} role={label ? 'img' : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      <PoseArt pose={pose} id={id} />
    </span>
  );
}
