import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Usher',
  description: 'Usher your festival with ease. The festival agent for organizers, staff, guests, attendees and vendors (Group Blue prototype, made-up data).',
  appleWebApp: { capable: true, title: 'Usher', statusBarStyle: 'black-translucent' as const },
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
