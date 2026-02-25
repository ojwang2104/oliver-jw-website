import { Redis } from '@upstash/redis';
import { getLatestPressRelease, getRecentEarningsCandidates } from '../../../../lib/earnings';
import { isLikelyEarningsPressRelease } from '../../../../lib/earningsGuards';
import { shouldExcludeAutomatedTicker, type TickerProfile } from '../../../../lib/automatedTickerFilter';

export const runtime = 'nodejs';

const RECIPIENT_KEY = 'earnings:recipient';
const WEEKLY_LOCK_PREFIX = 'earnings:weekly_digest_lock';
const MIN_MARKET_CAP = 50_000_000_000;
const LOOKBACK_DAYS = 7;

const redis = Redis.fromEnv();

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'OJW Earnings Summarizer <mail@oliverjw.me>';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};
const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

function isoWeekKey(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWithinLookbackDays(filingDate: string | null, lookbackDays: number) {
  if (!filingDate) return false;
  const parsed = new Date(`${filingDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = Date.now() - parsed.getTime();
  return ageMs >= 0 && ageMs <= lookbackDays * 24 * 60 * 60 * 1000;
}

function extractMetricFragment(text: string | null, patterns: RegExp[]) {
  if (!text) return 'Not clearly disclosed.';
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const normalized = match[1].replace(/\s+/g, ' ').trim();
    if (normalized.length >= 8) return normalized;
  }
  return 'Not clearly disclosed.';
}

function buildTwoSentenceSummary(text: string | null) {
  const revenue = extractMetricFragment(text, [
    /((?:(?:operating|total|net)\s+)?revenue(?:s)?[^.]{0,180})(?:\.|$)/i,
    /((?:(?:operating|total|net)\s+)?revenue(?:s)?[^;]{0,180});/i,
  ]);
  const eps = extractMetricFragment(text, [
    /((?:gaap\s+|non-gaap\s+)?(?:diluted\s+)?(?:eps|earnings per share)[^.]{0,160})\./i,
  ]);
  const operating = extractMetricFragment(text, [
    /((?:operating income|operating margin|income from operations)[^.]{0,160})\./i,
  ]);
  const freeCashFlow = extractMetricFragment(text, [
    /((?:free cash flow|fcf)[^.]{0,160})\./i,
  ]);

  return [
    `Revenue: ${revenue}. EPS: ${eps}.`,
    `Operating Income/Margin: ${operating}. Free Cash Flow: ${freeCashFlow}.`,
  ].join(' ');
}

async function fetchTickerProfilesFromNasdaq(tickers: string[]) {
  const profiles = new Map<string, TickerProfile>();
  if (tickers.length === 0) return profiles;
  const res = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true', {
    headers: NASDAQ_HEADERS,
  });
  if (!res.ok) return profiles;
  const data = await res.json().catch(() => null);
  const rows = data?.data?.rows;
  if (!Array.isArray(rows)) return profiles;
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  for (const row of rows) {
    const symbol = String(row?.symbol ?? '').toUpperCase();
    if (!wanted.has(symbol)) continue;
    const marketCap = Number.parseFloat(String(row?.marketCap ?? '').replace(/,/g, ''));
    profiles.set(symbol, {
      marketCap: Number.isFinite(marketCap) ? marketCap : null,
      sector: typeof row?.sector === 'string' ? row.sector : null,
      industry: typeof row?.industry === 'string' ? row.industry : null,
    });
  }
  return profiles;
}

async function fetchMarketCapsFromNasdaq(tickers: string[]) {
  const caps = new Map<string, number>();
  const profiles = await fetchTickerProfilesFromNasdaq(tickers);
  for (const [ticker, profile] of profiles.entries()) {
    if (profile.marketCap != null) caps.set(ticker, profile.marketCap);
  }
  return caps;
}

async function fetchPreviousCloseMarketCaps(tickers: string[]) {
  const caps = new Map<string, number>();
  if (tickers.length === 0) return caps;
  const chunkSize = 100;
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`;
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const rows = data?.quoteResponse?.result;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const symbol = String(row?.symbol ?? '').toUpperCase();
      if (!symbol) continue;
      const previousClose = Number(row?.regularMarketPreviousClose ?? NaN);
      const sharesOutstanding = Number(row?.sharesOutstanding ?? NaN);
      const marketCap = Number(row?.marketCap ?? NaN);
      const prevCloseCap =
        Number.isFinite(previousClose) && Number.isFinite(sharesOutstanding)
          ? previousClose * sharesOutstanding
          : Number.NaN;
      const resolved = Number.isFinite(prevCloseCap)
        ? prevCloseCap
        : Number.isFinite(marketCap)
          ? marketCap
          : Number.NaN;
      if (Number.isFinite(resolved)) caps.set(symbol, resolved);
    }
  }
  if (caps.size < tickers.length) {
    const missing = tickers.filter((ticker) => !caps.has(ticker));
    const nasdaqCaps = await fetchMarketCapsFromNasdaq(missing);
    for (const [ticker, cap] of nasdaqCaps.entries()) {
      caps.set(ticker, cap);
    }
  }
  return caps;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
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
    }),
  });
  return res.ok;
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1';
  const force = url.searchParams.get('force') === '1';
  const recipientEmail = await redis.get<string>(RECIPIENT_KEY);
  if (!recipientEmail) {
    return Response.json({ sent: false, skipped: 'Missing recipient email.' });
  }

  const weekKey = isoWeekKey(new Date());
  const digestLockKey = `${WEEKLY_LOCK_PREFIX}:${weekKey}`;
  if (force) {
    await redis.del(digestLockKey);
  }
  if (!force) {
    const reserved = await redis.set(digestLockKey, recipientEmail, {
      nx: true,
      ex: 60 * 60 * 24 * 8,
    });
    if (!reserved) {
      return Response.json({ sent: false, deduped: true, week: weekKey });
    }
  }

  const candidates = await getRecentEarningsCandidates(LOOKBACK_DAYS, {
    requireEarningsItem: false,
  });
  const tickerSet = new Set(candidates.map((item) => item.ticker));
  const tickerProfiles = await fetchTickerProfilesFromNasdaq([...tickerSet]);
  const caps = await fetchPreviousCloseMarketCaps([...tickerSet]);
  const eligibleCandidates = candidates
    .filter((item) => (caps.get(item.ticker) ?? 0) >= MIN_MARKET_CAP)
    .filter((item) => {
      const profile = tickerProfiles.get(item.ticker) ?? null;
      const resolvedMarketCap = caps.get(item.ticker) ?? profile?.marketCap ?? null;
      return !shouldExcludeAutomatedTicker(item.ticker, profile, resolvedMarketCap);
    })
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate) || a.ticker.localeCompare(b.ticker));

  const rows: string[] = [];
  const included: string[] = [];
  for (const item of eligibleCandidates) {
    const result = await getLatestPressRelease(item.ticker, { includeTranscript: false });
    if (!result.pressReleaseUrl) continue;
    if (!isWithinLookbackDays(result.pressReleaseFilingDate, LOOKBACK_DAYS)) continue;
    if (result.accessionNumber && result.accessionNumber !== item.accessionNumber) continue;
    if (
      !isLikelyEarningsPressRelease({
        quarterLabel: result.quarterLabel,
        pressReleaseText: result.pressReleaseText,
      })
    ) {
      continue;
    }

    included.push(item.ticker);
    const summary = buildTwoSentenceSummary(result.pressReleaseText);
    rows.push(
      `<tr>` +
        `<td>${escapeHtml(result.ticker)}</td>` +
        `<td>${escapeHtml(result.companyName ?? result.ticker)}</td>` +
        `<td>${escapeHtml(result.quarterLabel ?? 'Quarter unknown')}</td>` +
        `<td>${escapeHtml(result.pressReleaseFilingDate ?? item.filingDate)}</td>` +
        `<td><a href="${result.pressReleaseUrl}">Press release</a></td>` +
        `<td>$${((caps.get(item.ticker) ?? 0) / 1_000_000_000).toFixed(1)}B</td>` +
        `<td>${escapeHtml(summary)}</td>` +
      `</tr>`,
    );
  }

  const subject = `Weekly Earnings Digest >$50B (${weekKey})`;
  const html =
    rows.length === 0
      ? `<p>No companies above $50B market cap with qualifying earnings releases in the last ${LOOKBACK_DAYS} days.</p>`
      : [
          `<p><strong>Weekly earnings digest</strong></p>`,
          `<p>Coverage: trailing ${LOOKBACK_DAYS} days, U.S. companies above $50B market cap.</p>`,
          `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">`,
          `<thead><tr><th>Ticker</th><th>Company</th><th>Quarter</th><th>Filed</th><th>Press Release</th><th>Market Cap</th><th>Quick Summary</th></tr></thead>`,
          `<tbody>${rows.join('')}</tbody>`,
          `</table>`,
        ].join('');

  const ok = await sendEmail({
    to: recipientEmail,
    subject,
    html,
  });

  if (!ok) {
    if (!force) await redis.del(digestLockKey);
    return Response.json({ sent: false, error: 'Failed to send digest.' }, { status: 500 });
  }

  return Response.json(
    debug
      ? {
          sent: true,
          week: weekKey,
          count: rows.length,
          tickers: included,
          discovered: candidates.length,
          eligibleByMarketCap: eligibleCandidates.length,
        }
      : { sent: true, week: weekKey, count: rows.length },
  );
}
