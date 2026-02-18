export const runtime = 'nodejs';

import { getLatestPressRelease, normalizeTickers } from '../../../lib/earnings';

type EarningsResult = {
  ticker: string;
  companyName: string | null;
  quarterLabel: string | null;
  pressReleaseFilingDate: string | null;
  pressReleaseUrl: string | null;
  pressReleaseIsPrevious: boolean;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const rawTickers = String(body?.tickers ?? '');
  const tickers = normalizeTickers(rawTickers).slice(0, 10);

  if (tickers.length === 0) {
    return Response.json({ error: 'Provide at least one ticker.' }, { status: 400 });
  }

  const results: EarningsResult[] = [];

  for (const ticker of tickers) {
    const result = await getLatestPressRelease(ticker);
    results.push({
      ticker: result.ticker,
      companyName: result.companyName,
      quarterLabel: result.quarterLabel,
      pressReleaseFilingDate: result.pressReleaseFilingDate,
      pressReleaseIsPrevious: result.pressReleaseIsPrevious,
      pressReleaseUrl: result.pressReleaseUrl,
    });
  }

  return Response.json({ results });
}
