// The first prototype's dashboard, kept for reference at /legacy. Its styles
// load only here, so they never reach the new apps.
import '../globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Festival Agent (first prototype)' };

export default function LegacyLayout({ children }: { children: ReactNode }) {
  return <div className="legacy">{children}</div>;
}
