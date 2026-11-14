// Thin line icons, one stroke weight, drawn for this app.
import type { SVGProps } from 'react';

const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

type P = SVGProps<SVGSVGElement>;
export const Ticket = (p: P) => <svg {...base} {...p}><path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z" /><path d="M14 6v2M14 11v2M14 16v2" /></svg>;
export const Clapper = (p: P) => <svg {...base} {...p}><path d="M3.5 10h17v9.5h-17z" /><path d="m3.5 10-.6-3.2 15.8-3 .6 3.2" /><path d="m7.6 6.1 2.3 3.4M12.4 5.2l2.3 3.4" /></svg>;
export const Badge = (p: P) => <svg {...base} {...p}><path d="M9 3h6l-1.2 5h-3.6z" /><rect x="6" y="8" width="12" height="13" rx="2" /><circle cx="12" cy="13" r="2" /><path d="M9.5 18h5" /></svg>;
export const Snow = (p: P) => <svg {...base} {...p}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" /></svg>;
export const Clock = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const Bus = (p: P) => <svg {...base} {...p}><rect x="4.5" y="4" width="15" height="13" rx="2.5" /><path d="M4.5 11h15M8 17v2.5M16 17v2.5" /><circle cx="8.5" cy="14" r=".6" fill="currentColor" /><circle cx="15.5" cy="14" r=".6" fill="currentColor" /></svg>;
export const Message = (p: P) => <svg {...base} {...p}><path d="M4 5.5h16v10H9l-5 4z" /></svg>;
export const People = (p: P) => <svg {...base} {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.6.7 2.6 2.2 3 4.6" /></svg>;
export const Swap = (p: P) => <svg {...base} {...p}><path d="M5 8h13l-3-3M19 16H6l3 3" /></svg>;
export const Move = (p: P) => <svg {...base} {...p}><path d="M12 4v16M8 16l4 4 4-4" /><path d="M6 4h12" /></svg>;
export const Check = (p: P) => <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const Back = (p: P) => <svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>;
export const Close = (p: P) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Arrow = (p: P) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const Brief = (p: P) => <svg {...base} {...p}><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5" /></svg>;
export const Bell = (p: P) => <svg {...base} {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
export const Spark = (p: P) => <svg {...base} {...p}><path d="M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z" /></svg>;
export const Calendar = (p: P) => <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
export const Pin = (p: P) => <svg {...base} {...p}><path d="M12 21s6.5-6.1 6.5-11.2a6.5 6.5 0 0 0-13 0C5.5 14.9 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.3" /></svg>;
export const Door = (p: P) => <svg {...base} {...p}><path d="M6 20.5V4h10v16.5M3.5 20.5h17" /><path d="M16 4l3 1.5v15" /><circle cx="13.3" cy="12.5" r=".6" fill="currentColor" /></svg>;
export const User = (p: P) => <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>;

export const RoleIcon = { attendee: Ticket, team: Clapper, staff: Badge };
