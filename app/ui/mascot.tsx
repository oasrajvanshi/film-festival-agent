'use client';
// Usher's mascot: a soft vinyl-toy creature with camera-lens eyes and an amber sparkle on its chest
// (the agent's mark), rendered in 3D in six poses. Motion is layered on top in CSS: the figure
// sways, jumps or breathes; the chest sparkle glows like a heartbeat; a glossy sheen sweeps across
// it; a contact shadow grounds it; and a few poses have one small amber accent (Usher's color).
// Props are kept to one per pose. Motion stops for people who ask for less motion.

import type { CSSProperties } from 'react';

export type Pose = 'options' | 'working' | 'done' | 'relax' | 'headsup' | 'ask';

type Spot = [number, number];
/** Measured on each render (percent of its box): picture size, chest sparkle, where the feet are. */
const ART: Record<Pose, { w: number; h: number; star: Spot; feet: Spot; feetW: number }> = {
  options: { w: 272, h: 300, star: [41, 46.5], feet: [46, 97], feetW: 80 },
  working: { w: 192, h: 300, star: [41, 41.5], feet: [44.5, 97], feetW: 56 },
  done: { w: 273, h: 300, star: [46.5, 45], feet: [50, 99.5], feetW: 36 },
  relax: { w: 283, h: 300, star: [54, 39.5], feet: [46, 97], feetW: 78 },
  headsup: { w: 267, h: 300, star: [55, 44], feet: [40.5, 97], feetW: 50 },
  ask: { w: 296, h: 300, star: [49.5, 42], feet: [44, 97], feetW: 44 },
};

const at = ([x, y]: Spot, extra?: CSSProperties): CSSProperties => ({ left: `${x}%`, top: `${y}%`, ...extra });

/** Light accents per pose, placed on the render. */
function Accents({ pose }: { pose: Pose }) {
  switch (pose) {
    case 'options': // the one signpost glows: Usher's suggested way
      return <i className="ms-lamp ms-amber" style={at([80, 57])} />;
    case 'working': // little sparkles off the checklist as it ticks
      return <>{[[78, 34], [86, 46], [70, 28]].map(([x, y], i) => <i key={i} className="ms-pop" style={at([x, y], { animationDelay: `${i * 0.45}s` })} />)}</>;
    case 'headsup': // signal arcs go out of the megaphone
      return <>{[0, 1, 2].map(i => <i key={i} className="ms-arc" style={at([99, 24], { animationDelay: `${i * 0.42}s` })} />)}</>;
    case 'ask': // typing dots in the speech bubble
      return <>{[77, 83.5, 90].map((x, i) => <i key={x} className="ms-type" style={at([x, 13.5], { animationDelay: `${i * 0.16}s` })} />)}</>;
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
