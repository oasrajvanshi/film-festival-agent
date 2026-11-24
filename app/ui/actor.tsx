'use client';
// Who did it, at a glance, on every screen: the agent (Usher: amber, sparkle) or a person
// (the festival team: blue, person). The same chip and colors everywhere.

import { Icon } from './icons';

export type ActorKind = 'agent' | 'human';

export function Actor({ kind, label, title }: { kind: ActorKind; label?: string; title?: string }) {
  return (
    <span className={`actor ${kind}`} title={title ?? (kind === 'agent' ? 'Done by Usher, the agent' : 'Done by a person')}>
      <Icon name={kind === 'agent' ? 'sparkle' : 'person'} size={11} />
      {label ?? (kind === 'agent' ? 'Usher' : 'You')}
    </span>
  );
}

/** The two colors explained once, where people first meet them. */
export function ActorLegend() {
  return (
    <span className="actor-legend" aria-label="Color key">
      <Actor kind="agent" label="Usher (agent)" />
      <Actor kind="human" label="People" />
    </span>
  );
}

/**
 * A small hand-drawn figure for a moment worth a smile (a recommendation, all done, nothing to do).
 * Line art on a transparent background, tinted to the theme; hidden if the picture is missing.
 */
export function Doodle({ name, className, alt = '' }: { name: string; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`doodle${className ? ` ${className}` : ''}`} src={`/doodles/${name}.png`} alt={alt} aria-hidden={alt ? undefined : true}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
  );
}
