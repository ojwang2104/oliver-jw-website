import { Redis } from '@upstash/redis';
import { getDailyEarningsCandidates, getLatestPressRelease, normalizeTickers } from '../../../../lib/earnings';
import { validateSummaryPeriodCoverage } from '../../../../lib/summaryQuality';

export const runtime = 'nodejs';

const TICKERS_KEY = 'earnings:tickers';
const RECIPIENT_KEY = 'earnings:recipient';
const LAST_SEEN_KEY = 'earnings:last_seen';
const SENT_LOCK_PREFIX = 'earnings:sent_lock';
const SENT_LOCK_TTL_SECONDS = 60 * 60 * 24 * 30;
const MIN_MARKET_CAP = 10_000_000_000;
const AUTO_SEND_MAX_FILING_AGE_DAYS = 3;

const redis = Redis.fromEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'OJW Earnings Summarizer <mail@oliverjw.me>';
const CRON_SECRET = process.env.CRON_SECRET;

type LastSeenMap = Record<string, string>;
const METRIC_REGEX =
  /\b(revenue|eps|earnings per share|operating income|operating margin|gross margin|net income|operating cash flow|free cash flow|guidance|cash and marketable securities|cash and cash equivalents|marketable securities)\b/gi;
const NUMBER_REGEX = /\$?\b\d[\d,]*(?:\.\d+)?%?\b/g;

function extractOutputText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts: string[] = [];
  for (const output of data?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

async function fetchPreviousCloseMarketCaps(tickers: string[]) {
  const caps = new Map<string, number>();
  if (tickers.length === 0) return caps;
  const chunkSize = 100;
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`;
    const res = await fetch(url);
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
  return caps;
}

async function summarizeDocument(params: {
  ticker: string;
  companyName: string | null;
  quarterLabel: string | null;
  sourceLabel: 'transcript' | 'press release';
  sourceText: string;
}) {
  if (!OPENAI_API_KEY) return null;
  const { ticker, companyName, quarterLabel, sourceLabel, sourceText } = params;
  const clipped = sourceText.slice(0, 12000);
  const baseSystemPrompt =
    'You are a precise financial analyst. Summarize earnings materials into 7 concise bullet points. You must include separate bullets for: (1) revenue, (2) EPS, (3) operating income or margin, (4) net income, (5) operating cash flow and free cash flow, (6) guidance, and (7) cash/marketable securities when present. Do not combine guidance and cash/marketable securities in one bullet. Add one bullet for qualitative management commentary if available. Avoid fluff. Do not invent numbers. Critical format rule: if both quarterly and full-year figures exist for a metric, include both in that same metric bullet with explicit labels, like: "Revenue: Q4 ... Full year ...". Apply this to every metric where both are disclosed.';

  const runSummary = async (systemPrompt: string) => {
    const input = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Company: ${companyName ?? ticker} (${ticker})`,
          `Quarter: ${quarterLabel ?? 'Unknown'}`,
          `Source: ${sourceLabel}`,
          `Earnings ${sourceLabel}:`,
          clipped,
        ].join('\n'),
      },
    ];

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return extractOutputText(data) || null;
  };

  const firstPass = await runSummary(baseSystemPrompt);
  if (!firstPass) return null;

  const firstValidation = validateSummaryPeriodCoverage(firstPass, clipped);
  if (firstValidation.ok) return firstPass;

  const repairPrompt = `${baseSystemPrompt} Your previous answer missed dual-period coverage for: ${firstValidation.missing.join(
    ', ',
  )}. Rewrite so these metrics explicitly include both quarterly and full-year values when present in source.`;

  const secondPass = await runSummary(repairPrompt);
  if (!secondPass) return firstPass;

  const secondValidation = validateSummaryPeriodCoverage(secondPass, clipped);
  return secondValidation.ok ? secondPass : firstPass;
}

async function summarizeTranscriptPdf(params: {
  ticker: string;
  companyName: string | null;
  quarterLabel: string | null;
  transcriptUrl: string;
}) {
  if (!OPENAI_API_KEY) return null;
  const pdfRes = await fetch(params.transcriptUrl);
  if (!pdfRes.ok) return null;
  const pdfBytes = await pdfRes.arrayBuffer();
  if (!pdfBytes.byteLength) return null;

  const form = new FormData();
  form.append(
    'file',
    new Blob([pdfBytes], { type: 'application/pdf' }),
    `${params.ticker}-transcript.pdf`,
  );
  form.append('purpose', 'assistants');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });
  if (!uploadRes.ok) return null;
  const uploadData = await uploadRes.json();
  const fileId = uploadData?.id as string | undefined;
  if (!fileId) return null;

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a precise financial analyst. Summarize the transcript into 7 concise bullets with exact numbers. Include separate bullets for guidance and cash/marketable securities when present, and do not combine them. Include management commentary. Do not invent facts. Critical format rule: if both quarterly and full-year figures exist for a metric, include both in that same metric bullet with explicit labels, like: "Revenue: Q4 ... Full year ...". Apply this to every metric where both are disclosed.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Company: ${params.companyName ?? params.ticker} (${params.ticker})`,
                `Quarter: ${params.quarterLabel ?? 'Unknown'}`,
                'Summarize this earnings call transcript PDF.',
              ].join('\n'),
            },
            {
              type: 'input_file',
              file_id: fileId,
            },
          ],
        },
      ],
    }),
  });

  const text = res.ok ? extractOutputText(await res.json()) : null;

  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
  }).catch(() => null);

  return text || null;
}

function buildSummaryHtml(summaryText: string | null) {
  if (!summaryText) return '<p>No summary available.</p>';
  const bullets = summaryText
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  if (bullets.length === 0) return `<p>${formatFinanceText(summaryText)}</p>`;
  return `<ul>${bullets.map((item) => `<li>${formatFinanceText(item)}</li>`).join('')}</ul>`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(input: string) {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
  };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
    }
    return named[lower] ?? full;
  });
}

function formatFinanceText(input: string) {
  const escaped = escapeHtml(decodeHtmlEntities(input));
  const numberBolded = escaped.replace(NUMBER_REGEX, (match) => `<strong>${match}</strong>`);
  return numberBolded.replace(METRIC_REGEX, (match) => `<strong>${match}</strong>`);
}

function extractBusinessCommentary(params: {
  preferredText: string | null;
  fallbackText: string | null;
}) {
  const pickLines = (text: string | null) => {
    if (!text) return [];
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const keywords = [
      'said',
      'ceo',
      'cfo',
      'demand',
      'customers',
      'products',
      'services',
      'data center',
      'growth',
      'strategy',
      'outlook',
      'guidance',
      'pipeline',
      'adoption',
      'momentum',
    ];
    const legalDisclosurePatterns = [
      'forward-looking statement',
      'forward looking statement',
      'safe harbor',
      'actual results may differ materially',
      'may differ materially',
      'risk factors',
      'undue reliance',
      'sec filings',
      'form 10-k',
      'form 10-q',
      'cautionary',
      'litigation',
      'non-gaap financial measures',
      'regulation g',
      'reconciliation to gaap',
      'investor relations website',
      'no obligation to update',
    ];

    const selected: string[] = [];
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (!keywords.some((keyword) => lower.includes(keyword))) continue;
      if (legalDisclosurePatterns.some((pattern) => lower.includes(pattern))) continue;
      if (sentence.length < 55 || sentence.length > 260) continue;
      if (lower.includes('highlights')) continue;
      if (sentence.includes(' - ') && sentence.split(' - ')[0].length < 20) continue;
      if ((sentence.match(/\d[\d,.]*%?/g) ?? []).length > 4) continue;
      if ((sentence.match(/["']/g) ?? []).length === 1) continue;
      selected.push(sentence);
      if (selected.length >= 3) break;
    }
    return selected;
  };

  const preferred = pickLines(params.preferredText);
  if (preferred.length > 0) return { lines: preferred, source: 'transcript' as const };
  return { lines: pickLines(params.fallbackText), source: 'press release' as const };
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

async function reserveSendLock(ticker: string, marker: string) {
  const lockKey = `${SENT_LOCK_PREFIX}:${ticker}:${marker}`;
  const result = await redis.set(lockKey, '1', {
    nx: true,
    ex: SENT_LOCK_TTL_SECONDS,
  });
  return { reserved: Boolean(result), lockKey };
}

function isFreshFilingForAutoSend(filingDate: string | null) {
  if (!filingDate) return false;
  const parsed = new Date(`${filingDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = Date.now() - parsed.getTime();
  const maxAgeMs = AUTO_SEND_MAX_FILING_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs;
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

  const [tickersRaw, recipientEmail, lastSeenRaw] = await Promise.all([
    redis.get<string>(TICKERS_KEY),
    redis.get<string>(RECIPIENT_KEY),
    redis.get<LastSeenMap>(LAST_SEEN_KEY),
  ]);

  if (!recipientEmail) {
    return Response.json({ sent: 0, skipped: 'Missing recipient email.' });
  }

  const manualTickers = tickersRaw ? normalizeTickers(tickersRaw) : [];
  const dynamicCandidates = await getDailyEarningsCandidates();
  const dynamicTickerSet = new Set(dynamicCandidates.map((item) => item.ticker));
  const marketCaps = await fetchPreviousCloseMarketCaps([...dynamicTickerSet]);
  const dynamicTickers = [...dynamicTickerSet].filter(
    (ticker) => (marketCaps.get(ticker) ?? 0) >= MIN_MARKET_CAP,
  );
  const tickers = [...new Set([...manualTickers, ...dynamicTickers])];
  if (tickers.length === 0) {
    return Response.json({
      sent: 0,
      skipped: 'No eligible earnings reporters above $10B market cap.',
    });
  }

  const lastSeen: LastSeenMap = lastSeenRaw ?? {};
  let sent = 0;
  const debugInfo: Array<Record<string, string | boolean | null>> = [];

  for (const ticker of tickers) {
    const result = await getLatestPressRelease(ticker);
    if (!result.pressReleaseUrl) {
      if (debug) {
        debugInfo.push({
          ticker,
          status: 'no_press_release',
          company: result.companyName ?? null,
        });
      }
      continue;
    }
    if (!isFreshFilingForAutoSend(result.pressReleaseFilingDate)) {
      if (debug) {
        debugInfo.push({
          ticker,
          status: 'stale_filing_skipped',
          company: result.companyName ?? null,
          filingDate: result.pressReleaseFilingDate ?? null,
        });
      }
      continue;
    }
    const marker = result.accessionNumber ?? result.pressReleaseUrl;
    if (lastSeen[ticker] === marker) {
      if (debug) {
        debugInfo.push({
          ticker,
          status: 'already_sent',
          company: result.companyName ?? null,
          marker,
        });
      }
      continue;
    }

    const { reserved, lockKey } = await reserveSendLock(ticker, marker);
    if (!reserved) {
      if (debug) {
        debugInfo.push({
          ticker,
          status: 'already_sent_recent',
          company: result.companyName ?? null,
          marker,
        });
      }
      continue;
    }

    const transcriptPdfFallbackSummary =
      !result.transcriptText && result.transcriptUrl?.toLowerCase().endsWith('.pdf')
        ? await summarizeTranscriptPdf({
            ticker: result.ticker,
            companyName: result.companyName,
            quarterLabel: result.quarterLabel,
            transcriptUrl: result.transcriptUrl,
          })
        : null;

    const summarySourceText =
      result.transcriptText ?? transcriptPdfFallbackSummary ?? result.pressReleaseText;
    const summarySourceLabel =
      result.transcriptText || transcriptPdfFallbackSummary ? 'transcript' : 'press release';
    const summary = summarySourceText
      ? await summarizeDocument({
          ticker: result.ticker,
          companyName: result.companyName,
          quarterLabel: result.quarterLabel,
          sourceLabel: summarySourceLabel,
          sourceText: summarySourceText,
        })
      : null;

    const subject = `${result.ticker} earnings ${result.quarterLabel ?? ''}`.trim();
    const businessCommentary = extractBusinessCommentary({
      preferredText: result.transcriptText ?? transcriptPdfFallbackSummary,
      fallbackText: result.pressReleaseText,
    });
    const html = [
      `<p><strong>${result.companyName ?? result.ticker}</strong></p>`,
      `<p>${formatFinanceText(`${result.quarterLabel ?? 'Quarter'} • Filed ${result.pressReleaseFilingDate ?? 'Unknown date'}`)}</p>`,
      result.pressReleaseIsPrevious
        ? '<p><em>Note: Latest press release was unavailable; using the most recent prior earnings release.</em></p>'
        : '',
      `<p><a href="${result.pressReleaseUrl}">Press release</a></p>`,
      result.transcriptUrl
        ? `<p><a href="${result.transcriptUrl}">Earnings call transcript (${result.transcriptSource ?? 'source'})</a></p>`
        : '<p><em>No earnings call transcript link found on SEC, investor relations pages, or web search; summary and commentary are based on the press release.</em></p>',
      result.transcriptUrl && !result.transcriptText
        ? transcriptPdfFallbackSummary
          ? '<p><em>Transcript PDF summarized via LLM fallback.</em></p>'
          : '<p><em>Transcript link found, but transcript text could not be parsed automatically; summary uses the press release.</em></p>'
        : '',
      '<h4>Summary</h4>',
      buildSummaryHtml(summary),
      businessCommentary.lines.length > 0
        ? `<h4>Business Commentary (${businessCommentary.source})</h4>`
        : '',
      businessCommentary.lines.length > 0
        ? `<ul>${businessCommentary.lines.map((line) => `<li>${formatFinanceText(line)}</li>`).join('')}</ul>`
        : '',
    ].join('');

    const ok = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    if (ok) {
      lastSeen[ticker] = marker;
      sent += 1;
      if (debug) {
        debugInfo.push({
          ticker,
          status: 'sent',
          company: result.companyName ?? null,
          marker,
        });
      }
    } else if (debug) {
      await redis.del(lockKey);
      debugInfo.push({
        ticker,
        status: 'send_failed',
        company: result.companyName ?? null,
      });
    } else {
      await redis.del(lockKey);
    }
  }

  await redis.set(LAST_SEEN_KEY, lastSeen);
  return Response.json(
    debug
      ? {
          sent,
          debug: debugInfo,
          auto_discovered: dynamicTickerSet.size,
          auto_eligible: dynamicTickers.length,
          manual_tickers: manualTickers.length,
        }
      : { sent },
  );
}
