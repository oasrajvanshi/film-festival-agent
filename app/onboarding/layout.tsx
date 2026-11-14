// The festival setup flow from the first prototype. Its styles load only here.
import '../globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Festival Agent: set up a festival' };

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <div className="legacy">{children}</div>;
}
