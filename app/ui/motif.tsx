'use client';
// Small abstract motion pieces for moments worth a beat: two ways to choose, all set, nothing
// waiting, a heads-up going out, a question being answered. Shapes only (no people), drawn in the
// app's colors: amber is Usher (the agent), blue is a person, lines in the page's ink. They move
// gently and stop moving for people who ask their system for reduced motion.

export type MotifName = 'options' | 'done' | 'relax' | 'headsup' | 'ask';

const FORK_L = 'M40 74 V48 C40 36 22 34 18 16';
const FORK_R = 'M40 74 V48 C40 36 58 34 62 16';

export function Motif({ name, className }: { name: MotifName; className?: string }) {
  const cls = `motif m-${name}${className ? ` ${className}` : ''}`;
  switch (name) {
    // Two ways: one line splits in two; a pulse runs up and tries each branch. The agent's
    // suggestion (left) glows amber; the other end waits for a person (blue ring).
    case 'options':
      return (
        <svg className={cls} viewBox="0 0 80 80" aria-hidden="true">
          <path className="m-line m-draw" d="M40 74 V48" pathLength={100} />
          <path className="m-line m-draw m-d2" d="M40 48 C40 36 22 34 18 16" pathLength={100} />
          <path className="m-line m-draw m-d2" d="M40 48 C40 36 58 34 62 16" pathLength={100} />
          <circle className="m-agent-fill m-glow" cx="18" cy="14" r="5.5" />
          <circle className="m-human-ring" cx="62" cy="14" r="5.5" />
          <circle className="m-pulse-dot" r="3.2">
            <animateMotion dur="4.4s" repeatCount="indefinite" path={FORK_L} keyPoints="0;1;1" keyTimes="0;0.42;1" calcMode="linear" />
            <animate attributeName="opacity" dur="4.4s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.46;1" />
          </circle>
          <circle className="m-pulse-dot m-human" r="3.2">
            <animateMotion dur="4.4s" repeatCount="indefinite" path={FORK_R} keyPoints="0;0;1;1" keyTimes="0;0.5;0.92;1" calcMode="linear" />
            <animate attributeName="opacity" dur="4.4s" repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;0.5;0.55;0.9;0.96" />
          </circle>
        </svg>
      );
    // All set: a ring draws itself, a check strokes in, sparks burst out once.
    case 'done':
      return (
        <svg className={cls} viewBox="0 0 80 80" aria-hidden="true">
          <circle className="m-ring-draw" cx="40" cy="40" r="24" pathLength={100} />
          <path className="m-check" d="M29 41 L37 49 L53 31" pathLength={100} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
            <line key={a} className={`m-spark${i % 2 ? ' m-spark-b' : ''}`} x1="40" y1="8" x2="40" y2="3" style={{ ['--a' as string]: `${a}deg` }} />
          ))}
        </svg>
      );
    // Nothing waiting: soft rings breathe; one dot drifts around them.
    case 'relax':
      return (
        <svg className={cls} viewBox="0 0 80 80" aria-hidden="true">
          <circle className="m-breathe" cx="40" cy="40" r="11" />
          <circle className="m-breathe m-b2" cx="40" cy="40" r="21" />
          <circle className="m-breathe m-b3" cx="40" cy="40" r="31" />
          <circle className="m-agent-fill" r="3">
            <animateMotion dur="9s" repeatCount="indefinite" path="M40 9 A31 31 0 1 1 39.99 9" />
          </circle>
        </svg>
      );
    // Heads-up: a signal goes out from the centre in rings.
    case 'headsup':
      return (
        <svg className={cls} viewBox="0 0 80 80" aria-hidden="true">
          {[0, 0.8, 1.6].map(d => (
            <circle key={d} className="m-ripple" cx="40" cy="40" r="6">
              <animate attributeName="r" from="6" to="34" dur="2.4s" begin={`${d}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2.4s" begin={`${d}s`} repeatCount="indefinite" />
            </circle>
          ))}
          <circle className="m-agent-fill" cx="40" cy="40" r="6" />
        </svg>
      );
    // Ask: a question (blue) and an answer on its way (amber, typing).
    case 'ask':
      return (
        <svg className={cls} viewBox="0 0 80 80" aria-hidden="true">
          <g className="m-float">
            <rect className="m-human-ring" x="6" y="12" width="42" height="22" rx="11" />
            <path className="m-human-ring" d="M16 34 L13 41 L22 34" />
          </g>
          <g className="m-float m-f2">
            <rect className="m-agent-soft" x="30" y="44" width="44" height="24" rx="12" />
            {[42, 52, 62].map((x, i) => (
              <circle key={x} className="m-agent-fill m-type" cx={x} cy="56" r="2.8" style={{ animationDelay: `${i * 0.16}s` }} />
            ))}
          </g>
        </svg>
      );
  }
}
