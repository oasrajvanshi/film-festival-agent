import './hl.css';
import Script from 'next/script';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Harbor Lights',
  description: 'Harbor Lights Film Festival: agenda for attendees, shifts for staff, and the live plan for the festival team.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#120B09' };

const FONTS = 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Condensed:wght@400..700&family=Brygada+1918:ital,wght@0,400..700;1,400..700&family=Familjen+Grotesk:wght@400..700&family=Courier+Prime:wght@400;700&family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        {children}
        <Script src="/live-editor.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
