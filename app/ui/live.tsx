'use client';
// What makes the phones feel live during a demo: a push banner the moment an
// update reaches this person (an organizer just approved a plan), and the
// light / dark theme shared by every Usher screen in this browser.

import { useEffect, useRef, useState } from 'react';
import type { AgentStore } from './useAgent';
import { Icon } from './icons';

type Msg = AgentStore['agent']['outbox'][number];

/**
 * Two kinds of update reach a person: news that concerns them (a guest can't make it,
 * weather on the way), and changes the agent made to their plan (a new time, a cancellation).
 * Each has its own icon everywhere it shows.
 */
export const updateKind = (m: Pick<Msg, 'subject'>): 'change' | 'news' =>
  /now starts|cancelled|moved to|Schedule change| \+ \d+ more$/i.test(m.subject) ? 'change' : 'news';
export const UPDATE_ICON = { change: 'calendar', news: 'bell', risk: 'alert' } as const;
export const UPDATE_LABEL = { change: 'Plan changed', news: 'For you', risk: 'Heads-up' } as const;

/** Light or dark, remembered on this device and the same in every open Usher screen. Light is the default. */
const THEME_KEY = 'usher-theme-v2';
export function useTheme(): ['dark' | 'light', (t: 'dark' | 'light') => void] {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  useEffect(() => {
    const read = () => { try { setTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'); } catch { /* private mode */ } };
    read();
    const on = (e: StorageEvent) => { if (e.key === THEME_KEY) read(); };
    const local = () => read();
    window.addEventListener('storage', on);
    window.addEventListener('usher-theme', local);
    return () => { window.removeEventListener('storage', on); window.removeEventListener('usher-theme', local); };
  }, []);
  const set = (t: 'dark' | 'light') => {
    setTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
    window.dispatchEvent(new Event('usher-theme'));
  };
  return [theme, set];
}

/**
 * New messages for this person since the app opened, newest last. The first
 * render sets the baseline, so only updates that arrive while watching pop up.
 */
export function useArrivals(inbox: Msg[]) {
  const base = useRef<number | null>(null);
  const [fresh, setFresh] = useState<Msg[]>([]);
  useEffect(() => {
    if (base.current === null) { base.current = inbox.length; return; }
    if (inbox.length > base.current) {
      const added = inbox.slice(base.current);
      base.current = inbox.length;
      setFresh(f => [...f, ...added]);
      // Phones buzz; browsers only allow it after the person has tapped the page.
      try { if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(60); } catch { /* not supported */ }
    } else if (inbox.length < base.current) base.current = inbox.length; // a demo reset
  }, [inbox.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return [fresh, () => setFresh([])] as const;
}

/** The phone's push banner: slides down from the top, stays a few seconds, tap to open. */
export function PushBanner({ msgs, onOpen, onDone, kind }: {
  msgs: Pick<Msg, 'subject' | 'body' | 'actionId'>[]; onOpen: () => void; onDone: () => void;
  /** 'risk': a problem the festival team is still working on (no change to the plan yet). */
  kind?: 'risk';
}) {
  const last = msgs[msgs.length - 1];
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!last) return null;
  const k = kind ?? updateKind(last);
  return (
    <button key={`${last.actionId}-${msgs.length}`} className="push" onClick={() => { onOpen(); onDone(); }} aria-live="polite">
      <span className={`push-ic k-${k}`}><Icon name={UPDATE_ICON[k]} size={15} /></span>
      <span className="push-tx">
        <span className="push-top"><b>Usher · {UPDATE_LABEL[k]}</b><em>now{msgs.length > 1 ? ` · ${msgs.length} ${kind ? 'alerts' : 'updates'}` : ''}</em></span>
        <b className="push-s">{last.subject}</b>
        <span className="push-b">{last.body}</span>
      </span>
    </button>
  );
}
