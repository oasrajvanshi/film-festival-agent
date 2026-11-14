'use client';
// Welcome: who are you here as? Each role has its own onboarding.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RoleIcon } from '../hl/icons';
import type { Role } from '../hl/lib';

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'attendee', label: 'Attendee', hint: 'Your agenda, kept up to date' },
  { id: 'team', label: 'Festival team', hint: 'The live plan and decisions' },
  { id: 'staff', label: 'Staff', hint: 'Your shift and live brief' },
];

export default function Welcome() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('attendee');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  return (
    <>
      <div className="photo" style={{ backgroundImage: 'url(/hl/projector.jpg)' }} />
      <main className="phone welcome">
        <div className="wordmark">Harbor<br />Lights</div>
        <p className="tag">Film Festival · April 15 to 17, 2027</p>
        <section className="roles" aria-labelledby="who">
          <h2 id="who">Who are you here as?</h2>
          {ROLES.map(r => {
            const Icon = RoleIcon[r.id];
            return (
              <button key={r.id} type="button" className="role" aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
                <Icon />
                <span>{r.label}<small>{r.hint}</small></span>
              </button>
            );
          })}
          {role === 'team' && (
            <div className="device">
              <span>Show the festival team app on</span>
              <div className="seg" role="group" aria-label="Device">
                <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Desktop</button>
                <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>Phone</button>
              </div>
            </div>
          )}
          <button type="button" className="btn primary block" style={{ marginTop: 8 }} onClick={() => router.push(role === 'team' && device === 'phone' ? '/start/team?device=phone' : `/start/${role}`)}>Continue</button>
        </section>
      </main>
    </>
  );
}
