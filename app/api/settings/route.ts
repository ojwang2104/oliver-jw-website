import { Redis } from '@upstash/redis';
import { normalizeTickers } from '../../../lib/earnings';

export const runtime = 'nodejs';

const TICKERS_KEY = 'earnings:tickers';
const RECIPIENT_KEY = 'earnings:recipient';

const redis = Redis.fromEnv();

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

  if (recipientEmail.length === 0) {
    return Response.json({ error: 'Recipient email is required.' }, { status: 400 });
  }

  const normalized = normalizeTickers(tickersRaw).join(', ');
  if (!normalized) {
    return Response.json({ error: 'Please add at least one ticker.' }, { status: 400 });
  }

  await Promise.all([
    redis.set(TICKERS_KEY, normalized),
    redis.set(RECIPIENT_KEY, recipientEmail),
  ]);

  return Response.json({
    tickers: normalized,
    recipientEmail,
  });
}
