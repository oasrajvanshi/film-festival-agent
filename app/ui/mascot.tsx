'use client';
// Usher's mascot: one character (a soft pebble with camera-lens eyes and a small smile) in a few
// poses, for moments worth a beat. Each pose moves a little and carries the app's two colors as
// light: amber for Usher (the agent), blue for a person. Drawn in line art; in dark mode a thin
// cream outline keeps its arms and legs visible. Motion stops for people who ask for less motion.

export type Pose = 'options' | 'working' | 'done' | 'relax' | 'headsup' | 'ask';

/** Each picture's size (px at 2x) so the light accents sit on the drawing. */
const SIZE: Record<Pose, [number, number]> = {
  options: [419, 320], working: [269, 320], done: [292, 320], relax: [275, 320], headsup: [329, 320], ask: [296, 320],
};

function Fx({ pose }: { pose: Pose }) {
  switch (pose) {
    // Two signposts light up in turn: Usher's suggestion (amber), then the other way (blue).
    case 'options':
      return <>
        <circle className="ms-sign ms-agent" cx="56" cy="178" r="10" />
        <circle className="ms-sign ms-human ms-late" cx="365" cy="178" r="10" />
      </>;
    // Busy at the clipboard: small amber sparks pop off the page.
    case 'working':
      return <>{[0, 1, 2].map(i => <circle key={i} className="ms-pop" cx={236 + i * 9} cy={128 - i * 12} r="5" style={{ animationDelay: `${i * 0.35}s` }} />)}</>;
    // All set: sparks burst out around it as it jumps.
    case 'done':
      return <>{[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
        <line key={a} className={`ms-spark${i % 2 ? ' ms-human-s' : ''}`} x1="146" y1="20" x2="146" y2="2" style={{ ['--a' as string]: `${a}deg`, animationDelay: `${(i % 4) * 0.08}s` }} />
      ))}</>;
    // Nothing waiting: a warm glow breathes behind it.
    case 'relax':
      return <circle className="ms-glow" cx="140" cy="175" r="120" />;
    // Heads-up: signal rings go out of the megaphone.
    case 'headsup':
      return <>{[0, 0.6, 1.2].map(d => <circle key={d} className="ms-ring" cx="268" cy="108" r="14" style={{ animationDelay: `${d}s` }} />)}</>;
    // Answering: typing dots in its speech bubble.
    case 'ask':
      return <>{[214, 236, 258].map((x, i) => <circle key={x} className="ms-type" cx={x} cy="50" r="7" style={{ animationDelay: `${i * 0.16}s` }} />)}</>;
  }
}

export function Mascot({ pose, className, label }: { pose: Pose; className?: string; label?: string }) {
  const [w, h] = SIZE[pose];
  return (
    <span className={`mascot ms-${pose}${className ? ` ${className}` : ''}`} style={{ aspectRatio: `${w} / ${h}` }}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pose === 'relax' && <svg className="ms-fx ms-back" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><Fx pose={pose} /></svg>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ms-img" src={`/mascot/${pose}.png`} alt="" draggable={false} />
      {pose !== 'relax' && <svg className="ms-fx" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><Fx pose={pose} /></svg>}
    </span>
  );
}
