import { POST as inboundPost } from '../inbound/route';

export const runtime = 'nodejs';

const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET;

function normalizeEmail(input: string | null) {
  if (!input) return null;
  const trimmed = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const recipientEmail = normalizeEmail(
    typeof body?.recipientEmail === 'string' ? body.recipientEmail : null,
  );
  const tickers = String(body?.tickers ?? '').trim();

  if (!recipientEmail) {
    return Response.json({ error: 'Valid email is required.' }, { status: 400 });
  }
  if (!tickers) {
    return Response.json({ error: 'Ticker basket is required.' }, { status: 400 });
  }

  const forwardedUrl = INBOUND_SECRET
    ? `https://internal.local/api/reply/inbound?secret=${encodeURIComponent(INBOUND_SECRET)}`
    : 'https://internal.local/api/reply/inbound';
  const forwarded = new Request(forwardedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: recipientEmail,
      subject: 'Web form request',
      text: tickers,
    }),
  });

  const response = await inboundPost(forwarded);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json(payload ?? { error: 'Unable to request summaries.' }, { status: response.status });
  }

  return Response.json({
    ok: true,
    ...payload,
  });
}
