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
  themeColor: '#120b09',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Must run before the app: gives each presentation frame its own storage space. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/space.js" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Montserrat:wght@600;700;800&family=DM+Mono:wght@400;500&family=Limelight&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
