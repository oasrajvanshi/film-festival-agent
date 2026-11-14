// Small time helpers. All festival times are local ISO strings without zone.

export function toMinutes(iso: string): number {
  // Minutes since epoch-ish; only differences matter.
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return dayIndex * 1440 + hh * 60 + mm;
}

export function fromMinutes(total: number): string {
  const dayIndex = Math.floor(total / 1440);
  const rest = total - dayIndex * 1440;
  const d = new Date(dayIndex * 86_400_000);
  const date = d.toISOString().slice(0, 10);
  const hh = String(Math.floor(rest / 60)).padStart(2, '0');
  const mm = String(rest % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}`;
}

export function addMinutes(iso: string, mins: number): string {
  return fromMinutes(toMinutes(iso) + mins);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

export function clock(iso: string): string {
  const [hh, mm] = iso.split('T')[1].split(':').map(Number);
  const suffix = hh >= 12 ? 'pm' : 'am';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}
