import './hl.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Usher',
  description: 'Usher your festival with ease. Agenda for attendees, shifts for staff, and the live plan for the festival team (Harbor Lights Film Festival demo).',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#120B09' };

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap';

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
        {/* The design editor loads only on request (?edit=1), so the live site stays clean. */}
        <script dangerouslySetInnerHTML={{ __html: "if(/[?&]edit=1/.test(location.search)){var s=document.createElement('script');s.src='/live-editor.js';document.body.appendChild(s)}" }} />
      </body>
    </html>
  );
}
