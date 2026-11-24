'use client';
// Usher's mascot: a soft vinyl-toy creature with camera-lens eyes and an amber sparkle on its chest
// (the agent's mark), rendered in 3D in six poses. Motion is layered on top in CSS: the figure
// sways, jumps or breathes; the chest sparkle glows like a heartbeat; a glossy sheen sweeps across
// it; a contact shadow grounds it; and each pose has its own light accents, amber for Usher and
// blue for a person (the app's color key). Motion stops for people who ask for less motion.

import type { CSSProperties } from 'react';

export type Pose = 'options' | 'working' | 'done' | 'relax' | 'headsup' | 'ask';

type Spot = [number, number];
/** Measured on each render (percent of its box): picture size, chest sparkle, where the feet are. */
const ART: Record<Pose, { w: number; h: number; star: Spot; feet: Spot; feetW: number }> = {
  options: { w: 341, h: 300, star: [56, 51], feet: [50, 96], feetW: 46 },
  working: { w: 183, h: 300, star: [46, 45], feet: [45, 96.5], feetW: 52 },
  done: { w: 249, h: 300, star: [46, 50], feet: [52, 99], feetW: 34 },
  relax: { w: 268, h: 300, star: [54, 42], feet: [50, 95], feetW: 70 },
  headsup: { w: 286, h: 300, star: [48, 48], feet: [36, 96], feetW: 42 },
  ask: { w: 289, h: 300, star: [49, 43], feet: [44, 95.5], feetW: 38 },
};

const at = ([x, y]: Spot, extra?: CSSProperties): CSSProperties => ({ left: `${x}%`, top: `${y}%`, ...extra });

/** Light accents per pose, placed on the render. */
function Accents({ pose }: { pose: Pose }) {
  switch (pose) {
    case 'options': // the signposts light up in turn: Usher's suggestion (amber), then the other way (blue)
      return <><i className="ms-lamp ms-amber" style={at([15.5, 55])} /><i className="ms-lamp ms-blue ms-late" style={at([84.5, 55])} /></>;
    case 'working': // little sparkles off the checklist as it ticks
      return <>{[[80, 30], [90, 42], [70, 22]].map(([x, y], i) => <i key={i} className="ms-pop" style={at([x, y], { animationDelay: `${i * 0.45}s` })} />)}</>;
    case 'done': // sparks burst out around the jump
      return <>{[[12, 30], [86, 24], [8, 60], [92, 56], [30, 6], [70, 4]].map(([x, y], i) => (
        <i key={i} className={`ms-spark${i % 2 ? ' ms-blue' : ''}`} style={at([x, y], { animationDelay: `${(i % 3) * 0.12}s` })} />
      ))}</>;
    case 'headsup': // signal arcs go out of the megaphone
      return <>{[0, 1, 2].map(i => <i key={i} className="ms-arc" style={at([88, 27], { animationDelay: `${i * 0.42}s` })} />)}</>;
    case 'ask': // typing dots in the speech bubble
      return <>{[75.5, 82, 88.5].map((x, i) => <i key={x} className="ms-type" style={at([x, 16.5], { animationDelay: `${i * 0.16}s` })} />)}</>;
    default:
      return null;
  }
}

export function Mascot({ pose, className, label }: { pose: Pose; className?: string; label?: string }) {
  const a = ART[pose];
  const src = `/mascot/${pose}.webp`;
  return (
    <span className={`mascot ms-${pose}${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: `${a.w} / ${a.h}`, ['--src' as string]: `url(${src})` } as CSSProperties}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pose === 'relax' && <i className="ms-warm" />}
      <i className="ms-ground" style={at(a.feet, { width: `${a.feetW}%` })} />
      <span className="ms-fig">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} width={a.w} height={a.h} />
        <i className="ms-sheen" />
        <i className="ms-star" style={at(a.star)} />
      </span>
      <Accents pose={pose} />
    </span>
  );
}
