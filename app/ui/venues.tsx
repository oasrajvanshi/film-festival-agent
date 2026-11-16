'use client';
// Who's here, as the venues themselves: each venue drawn as a small
// building of stacked floors (after the first prototype's floor drawing).
// Floors light up from the ground as the people expected there are scanned
// in, so a glance says which venue is filling and which is still empty.
// A late guest shows as a red avatar on the building they are due at.

import type { Festival, Venue } from '../../src/core/types';
import type { RosterRow } from '../../src/agent/presence';

export interface VenueCount { venue: Venue; expected: number; here: number; late: RosterRow[]; now?: string }

export function venueCounts(f: Festival, rows: RosterRow[], late: (r: RosterRow) => boolean, nowTitle: (v: Venue) => string | undefined): VenueCount[] {
  return f.venues.map(v => ({
    venue: v,
    expected: rows.filter(r => r.firstVenueId === v.id && !r.walkIn).length,
    // Same basis as "expected": the people due at this venue first, and which of them are here.
    here: rows.filter(r => r.firstVenueId === v.id && !r.walkIn && r.arrival).length,
    late: rows.filter(r => r.firstVenueId === v.id && late(r)),
    now: nowTitle(v),
  }));
}

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function VenueBuildings({ counts, picked, onPick }: { counts: VenueCount[]; picked: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="vb-row">
      {counts.map(c => {
        const floors = Math.max(1, Math.min(3, Math.round(c.venue.capacity / 140)));
        const share = c.expected ? Math.min(1, c.here / c.expected) : 0;
        const lit = share * floors; // floors lit from the ground, the top one partly
        const on = picked === c.venue.id;
        return (
          <button key={c.venue.id} className={`vb${on ? ' on' : ''}${picked && !on ? ' dim' : ''}`} onClick={() => onPick(on ? null : c.venue.id)} aria-pressed={on}>
            <div className="vb-building" style={{ ['--floors' as string]: floors }}>
              {Array.from({ length: floors }, (_, i) => {
                const level = Math.max(0, Math.min(1, lit - i));
                return <i key={i} className="vb-slab" style={{ ['--i' as string]: i, ['--lvl' as string]: level }} />;
              })}
              {c.late.length > 0 && (
                <span className="vb-late" title={c.late.map(r => r.name).join(', ')}>
                  {c.late.slice(0, 2).map(r => <b key={r.id}>{initials(r.name)}</b>)}
                </span>
              )}
            </div>
            <span className="vb-name">{c.venue.name}</span>
            <span className="vb-num"><b>{c.here}</b> of {c.expected} here</span>
            {c.now && <span className="vb-now">{c.now}</span>}
          </button>
        );
      })}
    </div>
  );
}
