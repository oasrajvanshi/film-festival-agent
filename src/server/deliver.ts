// Sending, all in TEST MODE: every email goes to USHER_TEST_EMAIL, every text
// to USHER_TEST_PHONE, and push only to organizer devices, never to the
// made-up people in the festival data. A provider that isn't configured is
// skipped; the in-app Updates tab always works.

import webpush from 'web-push';
import type { Kv } from './kv';
import { PUSH_KEY } from './festivals';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const channels = () => ({
  email: !!(process.env.RESEND_API_KEY && process.env.USHER_TEST_EMAIL),
  sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.USHER_TEST_PHONE),
  push: true,
});

export async function sendEmail(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, to = process.env.USHER_TEST_EMAIL;
  if (!key || !to) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'Usher <onboarding@resend.dev>', to: [to], subject, html }),
  });
  return r.ok;
}

export async function sendSms(body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM, to = process.env.USHER_TEST_PHONE;
  if (!sid || !tok || !from || !to) return false;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 600) }),
  });
  return r.ok;
}

// ------------------------------------------------------------------ web push
export async function vapid(kv: Kv): Promise<{ publicKey: string; privateKey: string }> {
  const have = await kv.get<{ publicKey: string; privateKey: string }>('usher:vapid');
  if (have) return have;
  const keys = webpush.generateVAPIDKeys();
  await kv.set('usher:vapid', keys);
  return keys;
}

export async function sendPush(kv: Kv, fid: string, payload: { title: string; body: string; url: string }): Promise<number> {
  const subs = await kv.list<webpush.PushSubscription>(PUSH_KEY(fid), 50);
  if (!subs.length) return 0;
  const keys = await vapid(kv);
  webpush.setVapidDetails('mailto:usher@example.test', keys.publicKey, keys.privateKey);
  let ok = 0;
  await Promise.all(subs.map(s => webpush.sendNotification(s, JSON.stringify(payload), { TTL: 3600 }).then(() => { ok++; }).catch(() => {})));
  return ok;
}

// ------------------------------------------------------------------ digests
export interface OutMsg { personName: string; personEmail: string; channel: string; subject: string; body: string }

/** One test-mode email listing everything that just went out. */
export function digestHtml(festival: string, title: string, msgs: OutMsg[]): string {
  const rows = msgs.slice(0, 25).map(m => `<tr><td style="padding:8px 0;border-top:1px solid #e3d9c6;vertical-align:top">
    <b>${esc(m.personName)}</b><br><span style="color:#71665b;font-size:12px">${esc(m.personEmail)} · ${esc(m.channel.replace('_', ' '))}</span></td>
    <td style="padding:8px 0 8px 14px;border-top:1px solid #e3d9c6"><b>${esc(m.subject)}</b><br><span style="white-space:pre-wrap">${esc(m.body)}</span></td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#151110">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a8141f;margin:0">Usher · test mode · ${esc(festival)}</p>
    <h1 style="font-size:20px;margin:8px 0">${esc(title)}</h1>
    <p>${msgs.length} message${msgs.length === 1 ? '' : 's'} went out. In test mode they come to this inbox instead of each person.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    ${msgs.length > 25 ? `<p style="color:#71665b">and ${msgs.length - 25} more, all in the Usher log.</p>` : ''}</div>`;
}

export function codeHtml(o: { name: string; email: string; code: string; festival: string; profile: string; link: string }): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#151110">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a8141f;margin:0">Usher · test mode</p>
    <h1 style="font-size:22px;margin:8px 0">Hi ${esc(o.name)},</h1>
    <p>Here is your <b>${esc(o.profile)}</b> access code for <b>${esc(o.festival)}</b>:</p>
    <p style="font-size:30px;font-weight:800;letter-spacing:.08em;background:#efe7d8;padding:14px 18px;border-radius:10px;display:inline-block">${esc(o.code)}</p>
    <p>Open <a href="${esc(o.link)}">${esc(o.link)}</a>, pick <b>${esc(o.profile)}</b> and enter this code. It only opens your own profile.</p>
    <p style="font-size:12px;color:#71665b">Test mode: this was meant for ${esc(o.email)} and was sent to the team inbox instead.</p></div>`;
}
