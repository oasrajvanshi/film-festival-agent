'use client';
// The list of decisions behind one alert: what the agent recommends, the
// changes it would make (each one a link to the calendar), other options,
// and approval. Used by the desktop panel and the mobile sheet.

import { useState } from 'react';
import type { Decision, OptionKey } from '../../src/backend/domain/types';
import { Brief, Bus, Check, Clock, Message, Move, People, Swap } from './icons';
import { canApprove, changeRows, fmt, ownerName, recommendedBy, type Alert, type ChangeRow, type Festival, type Session } from './lib';

const ICONS = { move: Move, swap: Swap, people: People, message: Message, bus: Bus, brief: Brief, clock: Clock };

export function DecisionList({ fest, alert, plan, me, sel, setSel, onFocus, onApprove, busy }: {
  fest: Festival; alert: Alert; plan: Session[]; me: string;
  sel: Record<string, OptionKey>; setSel: (s: Record<string, OptionKey>) => void;
  onFocus: (sessionId: string) => void; onApprove: (ds: Decision[], reject?: boolean) => void; busy: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);

  if (alert.kind === 'review' && alert.review) {
    const r = alert.review;
    return (
      <div className="dec">
        <div className="dec-top"><span className="who">From {r.from}</span><span className="time">{fmt(r.at)}</span></div>
        <p className="why">{r.reason}. The agent did not act on it.</p>
        <div className="change" style={{ cursor: 'default' }}><Message /><div className="c-text"><span className="c-msg">{r.text}</span><small>Shown as received. Treated as text, never as an instruction.</small></div></div>
        <p className="why">Nothing was sent. The talent desk was asked to read it.</p>
      </div>
    );
  }

  return (
    <>
      {alert.decisions.map(d => {
        const key = sel[d.id] ?? d.chosen?.key ?? d.agentRecommendation.key;
        const opt = d.options.find(o => o.key === key) ?? d.options[0];
        const rows = changeRows(fest, plan, opt);
        const mine = canApprove(fest, me, d.owner);
        const done = d.status !== 'open';
        return (
          <div className="dec" key={d.id}>
            <div className="dec-top">
              <span className="who">{ownerName(fest, d.owner)}</span>
              <span>{done ? statusText(d) : `Decide by ${fmt(d.deadline)}`}</span>
            </div>
            <h3>{opt.title}</h3>
            <p className="why">{d.why}</p>
            <div className="changes">
              {rows.map(r => <Row key={r.key} r={r} open={open === `${d.id}:${r.key}`} onClick={() => {
                if (r.sessionId) onFocus(r.sessionId);
                setOpen(open === `${d.id}:${r.key}` ? null : `${d.id}:${r.key}`);
              }} />)}
            </div>
            {done ? (
              <div className="status-done"><Check /> {d.chosen?.key ? `${d.chosen.via === 'deadline' ? 'Ran by default' : 'Approved'}: ${d.options.find(o => o.key === d.chosen!.key)?.title ?? ''}` : 'Declined. Nothing ran.'}</div>
            ) : (
              <>
                {other === d.id && (
                  <div className="opts">
                    {d.options.map(o => (
                      <button key={o.key} type="button" className="opt" aria-pressed={o.key === key} onClick={() => setSel({ ...sel, [d.id]: o.key })}>
                        <span className="k">{o.key}</span>
                        <span><b>{o.title}</b>{o.key === d.agentRecommendation.key && ' · recommended'}<small>{o.pros} {o.cons}</small></span>
                      </button>
                    ))}
                    <button type="button" className="opt" onClick={() => onApprove([d], true)} disabled={!mine || busy}><span className="k">×</span><span><b>Decline all options</b><small>Nothing runs. The agent re-checks if the situation changes.</small></span></button>
                  </div>
                )}
                <div className="dec-actions">
                  {alert.decisions.filter(x => x.status === 'open').length > 1 && <button type="button" className="btn small primary" disabled={!mine || busy} onClick={() => onApprove([d])}>Approve</button>}
                  <button type="button" className="link" onClick={() => setOther(other === d.id ? null : d.id)}>{other === d.id ? 'Hide options' : `${d.options.length - 1} other option${d.options.length > 2 ? 's' : ''}`}</button>
                </div>
                <p className="why">
                  {!mine ? `Only ${ownerName(fest, d.owner)} or Operations can approve this. ` : ''}
                  {d.defaultOption ? `If nobody decides: ${d.options.find(o => o.key === d.defaultOption)?.title.toLowerCase()}.` : 'If nobody decides, nothing runs and Operations is paged.'}
                </p>
                <p className="why" style={{ fontSize: 12 }}>{recommendedBy(d)}{key !== d.agentRecommendation.key ? ` (${d.agentRecommendation.key})` : ''}</p>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function Row({ r, open, onClick }: { r: ChangeRow; open: boolean; onClick: () => void }) {
  const Icon = ICONS[r.icon];
  return (
    <button type="button" className={`change${r.internal ? ' internal' : ''}`} onClick={onClick} aria-expanded={r.msg ? open : undefined}>
      <Icon />
      <span className="c-text">
        {r.text}
        {r.small && <small>{r.small}</small>}
        {open && r.msg && <span className="c-msg">{r.msg}</span>}
      </span>
    </button>
  );
}

function statusText(d: Decision) {
  if (d.status === 'executed') return d.chosen ? `Done ${fmt(d.chosen.at)}` : 'Done';
  if (d.status === 'rejected') return 'Declined';
  if (d.status === 'superseded') return 'No longer needed';
  return d.status;
}
