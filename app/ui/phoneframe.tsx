'use client';
// Everyone except the organizer uses Usher on a phone. On a computer their
// app shows in a phone frame: the same page loaded at phone width inside an
// iframe, so the real mobile layout applies. The organizer can choose.

import { useEffect } from 'react';
import { Icon } from './icons';
import '../demo.css';

const DEVICE_KEY = 'usher-device';
export type Device = 'desktop' | 'phone';
export const readDevice = (): Device => { try { return localStorage.getItem(DEVICE_KEY) === 'phone' ? 'phone' : 'desktop'; } catch { return 'desktop'; } };
export const writeDevice = (d: Device) => { try { localStorage.setItem(DEVICE_KEY, d); } catch { /* private mode */ } };

/** Is this page the one inside a phone frame? */
export const inFrame = () => typeof window !== 'undefined' && (new URLSearchParams(location.search).get('inframe') === '1' || window.parent !== window);
/** Wide enough that a phone-only view should sit in a frame. */
export const isWide = () => typeof window !== 'undefined' && window.innerWidth > 760;

/** Tell the page around the frame something (sign-out, back to organizer, device change). */
export function toParent(msg: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.parent !== window) window.parent.postMessage({ usher: msg }, location.origin);
}

export function PhoneFrame({ src, title, onMessage, organizer, onDevice }: {
  src: string; title: string;
  onMessage?: (msg: Record<string, unknown>) => void;
  /** The organizer sees a Desktop / Phone switch above the phone. */
  organizer?: boolean;
  onDevice?: (d: Device) => void;
}) {
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.usher) onMessage?.(e.data.usher); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [onMessage]);
  return (
    <div className="pf">
      {organizer && (
        <div className="pf-bar">
          <span className="wordmark">Usher</span>
          <div className="pf-seg" role="tablist" aria-label="Device">
            <button onClick={() => onDevice?.('desktop')}><Icon name="home" size={14} /> Desktop</button>
            <button className="on"><Icon name="ticket" size={14} /> Phone</button>
          </div>
        </div>
      )}
      <div className="demo-stage"><div className="demo-device"><iframe src={src} title={title} /></div></div>
    </div>
  );
}
