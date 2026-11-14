import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Festival Agent',
  description: 'Management dashboard for the Film Festival Agent (Group Blue prototype, made-up data).',
  appleWebApp: { capable: true, title: 'Festival', statusBarStyle: 'black-translucent' as const },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ee' },
    { media: '(prefers-color-scheme: dark)', color: '#111015' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
