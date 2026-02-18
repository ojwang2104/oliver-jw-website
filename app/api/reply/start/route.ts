import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';

const RECIPIENT_KEY = 'earnings:recipient';
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'OJW Earnings Summarizer <mail@oliverjw.me>';
const REPLY_INBOX_EMAIL = process.env.REPLY_INBOX_EMAIL ?? 'reply@oliverjw.me';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://www.oliverjw.me';

const redis = Redis.fromEnv();

function normalizeEmail(input: string | null) {
  if (!input) return null;
  const trimmed = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  if (!RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });
  return res.ok;
}

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const fromBody = normalizeEmail(typeof body?.recipientEmail === 'string' ? body.recipientEmail : null);
  const fromStore = normalizeEmail(await redis.get<string>(RECIPIENT_KEY));
  const recipient = fromBody ?? fromStore;

  if (!recipient) {
    return Response.json({ error: 'No recipient configured.' }, { status: 400 });
  }

  const ok = await sendEmail({
    to: recipient,
    subject: 'Get earnings summaries with one quick form',
    replyTo: REPLY_INBOX_EMAIL,
    html: (() => {
      const requestUrl = `${APP_BASE_URL}/earnings/request?email=${encodeURIComponent(recipient)}`;
      return [
        '<p><strong>Request earnings summaries</strong></p>',
        '<p>Use the form to enter any basket of tickers. It is faster and cleaner than replying with raw text.</p>',
        `<p><a href="${requestUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;">Open Ticker Form</a></p>`,
        '<p>Example basket: <code>AAPL, MSFT, NVDA</code></p>',
        '<p>Fallback: you can still reply to this email with comma-separated tickers.</p>',
      ].join('');
    })(),
  });

  if (!ok) {
    return Response.json({ error: 'Failed to send starter email.' }, { status: 500 });
  }

  return Response.json({ sent: true, to: recipient, reply_to: REPLY_INBOX_EMAIL });
}
