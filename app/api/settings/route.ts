import { Redis } from '@upstash/redis';
import { normalizeTickers } from '../../../lib/earnings';

export const runtime = 'nodejs';

const TICKERS_KEY = 'earnings:tickers';
const RECIPIENT_KEY = 'earnings:recipient';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'OJW Earnings Summarizer <mail@oliverjw.me>';

const redis = Redis.fromEnv();

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

async function sendWelcomeEmail(recipientEmail: string, tickers: string[]) {
  if (!RESEND_API_KEY) return false;
  const tickerHtml = tickers.map((ticker) => `<li><code>${ticker}</code></li>`).join('');
  const html = [
    '<p><strong>Welcome to your Earnings Tracker</strong></p>',
    '<p>Your subscription is active and automated updates are now enabled.</p>',
    '<p><strong>Tickers added:</strong></p>',
    `<ul>${tickerHtml}</ul>`,
    '<p>You can return anytime to update your basket.</p>',
  ].join('');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipientEmail,
      subject: 'Welcome to your Earnings Tracker',
      html,
    }),
  });
  return res.ok;
}

export async function GET() {
  const [tickers, recipientEmail] = await Promise.all([
    redis.get<string>(TICKERS_KEY),
    redis.get<string>(RECIPIENT_KEY),
  ]);

  return Response.json({
    tickers: tickers ?? '',
    recipientEmail: recipientEmail ?? '',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tickersRaw = String(body?.tickers ?? '').trim();
  const recipientEmail = String(body?.recipientEmail ?? '').trim();

  if (!isValidEmail(recipientEmail)) {
    return Response.json({ error: 'A valid recipient email is required.' }, { status: 400 });
  }

  const normalizedTickers = normalizeTickers(tickersRaw).slice(0, 20);
  if (normalizedTickers.length === 0) {
    return Response.json({ error: 'Please add at least one ticker.' }, { status: 400 });
  }
  const normalized = normalizedTickers.join(', ');

  const [previousTickers, previousRecipient] = await Promise.all([
    redis.get<string>(TICKERS_KEY),
    redis.get<string>(RECIPIENT_KEY),
  ]);

  await Promise.all([
    redis.set(TICKERS_KEY, normalized),
    redis.set(RECIPIENT_KEY, recipientEmail),
  ]);

  const changed = previousTickers !== normalized || previousRecipient !== recipientEmail;
  const welcomeEmailSent = changed
    ? await sendWelcomeEmail(recipientEmail, normalizedTickers)
    : null;

  return Response.json({
    tickers: normalized,
    recipientEmail,
    welcomeEmailSent,
  });
}
