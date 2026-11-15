import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { deriveVendors, lookupForCode } from '../src/access/profiles';

describe('emailing access codes', () => {
  const f = buildFestival();
  const att = f.people.find(p => p.role === 'attendee')!;

  it('finds a person when name and email both match the festival list', () => {
    const r = lookupForCode(f, 'attendee', `  ${att.name.toUpperCase()} `, att.email.toUpperCase());
    expect(r.ok && r.who.id).toBe(att.id);
  });
  it('refuses a matching email with the wrong name', () => {
    expect(lookupForCode(f, 'attendee', 'Someone Else', att.email)).toEqual({ ok: false, reason: 'name_mismatch' });
  });
  it('refuses an email that is not on the list', () => {
    expect(lookupForCode(f, 'attendee', att.name, 'stranger@example.test')).toEqual({ ok: false, reason: 'not_found' });
  });
  it('refuses the right person under the wrong profile', () => {
    expect(lookupForCode(f, 'vendor', att.name, att.email).ok).toBe(false);
  });
  it('accepts a vendor by company or contact name', () => {
    const v = deriveVendors(f)[0];
    expect(lookupForCode(f, 'vendor', v.name, v.email).ok).toBe(true);
    expect(lookupForCode(f, 'vendor', v.contact, v.email).ok).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(lookupForCode(f, 'staff', 'A', 'not-an-email')).toEqual({ ok: false, reason: 'bad_email' });
  });
});
