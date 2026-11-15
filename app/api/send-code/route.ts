// Email a person their Usher access code.
// TEST MODE: while USHER_TEST_EMAIL is set, every code goes to that one inbox
// (the team's own), never to the address typed in. Without RESEND_API_KEY and
// USHER_TEST_EMAIL nothing is sent and the app falls back to demo mode.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

export async function GET() {
  return Response.json({ configured: !!(process.env.RESEND_API_KEY && process.env.USHER_TEST_EMAIL), testMode: true });
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  const testTo = process.env.USHER_TEST_EMAIL;
  if (!key || !testTo) return Response.json({ sent: false, reason: 'not_configured' }, { status: 200 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ sent: false, reason: 'bad_request' }, { status: 400 }); }
  const name = clip(b.name, 80), email = clip(b.email, 120), code = clip(b.code, 12), festival = clip(b.festival, 120), profile = clip(b.profile, 20);
  if (!/^[A-Z]{3}-[A-Z0-9]{4}$/.test(code)) return Response.json({ sent: false, reason: 'bad_request' }, { status: 400 });

  const subject = `Your ${festival || 'festival'} access code: ${code}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#151110">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a8141f;margin:0">Usher · test mode</p>
    <h1 style="font-size:22px;margin:8px 0">Hi ${esc(name)},</h1>
    <p>Here is your <b>${esc(profile)}</b> access code for <b>${esc(festival)}</b>:</p>
    <p style="font-size:30px;font-weight:800;letter-spacing:.08em;background:#efe7d8;padding:14px 18px;border-radius:10px;display:inline-block">${esc(code)}</p>
    <p>Open Usher, pick <b>${esc(profile)}</b> and enter this code. It only opens your own profile.</p>
    <p style="font-size:12px;color:#71665b">Test mode: this was meant for ${esc(email)} and was sent to the team inbox instead.</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'Usher <onboarding@resend.dev>', to: [testTo], subject, html }),
  });
  if (!r.ok) return Response.json({ sent: false, reason: 'provider_error', status: r.status }, { status: 502 });
  return Response.json({ sent: true, testMode: true });
}
