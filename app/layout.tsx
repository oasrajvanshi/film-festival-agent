import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Festival Agent',
  description: 'Management dashboard for the Film Festival Agent (Group Blue prototype, made-up data).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
