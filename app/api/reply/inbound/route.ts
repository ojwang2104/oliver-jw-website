import { getLatestPressRelease, normalizeTickers } from '../../../../lib/earnings';
import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import { validateSummaryPeriodCoverage } from '../../../../lib/summaryQuality';

export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? 'OJW Earnings Summarizer <mail@oliverjw.me>';
const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET;
const TEST_RECIPIENT_EMAIL = 'oliverjwca@gmail.com';
const REPLY_DEDUPE_PREFIX = 'earnings:reply_dedupe';
const REPLY_DEDUPE_TTL_SECONDS = 60 * 10;
const REQUEST_DEDUPE_PREFIX = 'earnings:reply_request';
const REQUEST_DEDUPE_TTL_SECONDS = 60 * 60 * 24;
const redis = Redis.fromEnv();

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
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `${params.ticker}-transcript.pdf`);
  form.append('purpose', 'assistants');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
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
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
  }).catch(() => null);

  return text || null;
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

function buildSummaryHtml(summaryText: string | null) {
  if (!summaryText) return '<p>No summary available.</p>';
  const bullets = summaryText
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  if (bullets.length === 0) return `<p>${formatFinanceText(summaryText)}</p>`;
  return `<ul>${bullets.map((item) => `<li>${formatFinanceText(item)}</li>`).join('')}</ul>`;
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

function extractSenderEmail(raw: unknown) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const bracket = raw.match(/<([^>]+)>/);
    const candidate = (bracket?.[1] ?? raw).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
  }
  if (typeof raw === 'object') {
    const email = (raw as any)?.email;
    if (typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return email.trim();
    }
  }
  return null;
}

function extractReplyText(payload: any) {
  const directCandidates = [
    payload?.text,
    payload?.data?.text,
    payload?.content?.text,
    payload?.plain,
    payload?.body,
    payload?.html,
    payload?.data?.body,
    payload?.data?.plain,
    payload?.data?.content?.text,
    payload?.data?.email?.text,
    payload?.data?.message?.text,
    payload?.data?.message?.body,
  ];

  const recursiveCandidates: string[] = [];
  const seen = new WeakSet<object>();

  function walk(value: unknown, path: string, depth: number) {
    if (depth > 5 || value == null) return;
    if (typeof value === 'string') {
      if (/(text|plain|body|content|snippet|stripped|reply)/i.test(path)) {
        const trimmed = value.trim();
        if (trimmed.length > 0) recursiveCandidates.push(trimmed);
      }
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, nested] of Object.entries(obj)) {
      walk(nested, `${path}.${key}`, depth + 1);
    }
  }

  walk(payload, 'payload', 0);

  const all = [...directCandidates, ...recursiveCandidates]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(all));
  return unique.join('\n');
}

function extractReplySubject(payload: any) {
  const subjectCandidates = [
    payload?.subject,
    payload?.data?.subject,
    payload?.data?.email?.subject,
    payload?.data?.message?.subject,
  ];
  const picked = subjectCandidates.find((item) => typeof item === 'string' && item.trim().length > 0);
  return typeof picked === 'string' ? picked.trim() : '';
}

function extractInboundRequestId(payload: any, headerId: string | null) {
  const candidates = [
    headerId,
    payload?.id,
    payload?.data?.id,
    payload?.email_id,
    payload?.data?.email_id,
    payload?.message_id,
    payload?.data?.message_id,
    payload?.data?.email?.id,
    payload?.data?.email?.message_id,
    payload?.headers?.['message-id'],
    payload?.data?.headers?.['message-id'],
  ];
  const picked = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);
  return typeof picked === 'string' ? picked.trim() : null;
}

function decodeQuotedPrintable(input: string) {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function extractCommaSeparatedTickerLists(rawText: string) {
  const decoded = decodeQuotedPrintable(rawText);
  const matches = decoded.match(/\b[A-Z][A-Z.-]{0,7}(?:\s*,\s*[A-Z][A-Z.-]{0,7})+\b/g) ?? [];
  return matches.flatMap((m) => normalizeTickers(m));
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!RESEND_API_KEY) {
    return { ok: false, status: 0, error: 'Missing RESEND_API_KEY' };
  }
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
  let responseBody: any = null;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    id: typeof responseBody?.id === 'string' ? responseBody.id : null,
    error:
      typeof responseBody?.message === 'string'
        ? responseBody.message
        : typeof responseBody?.error?.message === 'string'
          ? responseBody.error.message
          : null,
  };
}

export async function POST(request: Request) {
  if (INBOUND_SECRET) {
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret');
    const auth = request.headers.get('authorization');
    const tokenHeader = request.headers.get('x-inbound-secret');
    if (
      auth !== `Bearer ${INBOUND_SECRET}` &&
      tokenHeader !== INBOUND_SECRET &&
      querySecret !== INBOUND_SECRET
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const rawText = await request.text();
  const headerRequestId =
    request.headers.get('svix-id') ??
    request.headers.get('x-resend-id') ??
    request.headers.get('x-webhook-id');
  let payload: any = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    const params = new URLSearchParams(rawText);
    payload = Object.fromEntries(params.entries());
  }

  const sender =
    extractSenderEmail(payload?.from) ??
    extractSenderEmail(payload?.data?.from) ??
    extractSenderEmail(payload?.sender);
  if (!sender) {
    return Response.json({ error: 'Could not determine sender email.' }, { status: 400 });
  }

  const replyText = extractReplyText(payload);
  const replySubject = extractReplySubject(payload);
  const fromReply = normalizeTickers(replyText);
  const fromRaw = extractCommaSeparatedTickerLists(rawText);
  const fromSubject = normalizeTickers(replySubject);
  const tickers =
    (fromRaw.length > 0 ? fromRaw : fromReply.length > 0 ? fromReply : fromSubject)
      .filter((ticker) => ticker.length <= 5)
      .slice(0, 20);

  const explicitRequestId = extractInboundRequestId(payload, headerRequestId);
  const fallbackRequestId = createHash('sha256')
    .update(
      JSON.stringify({
        sender: sender.toLowerCase(),
        subject: replySubject.toUpperCase(),
        tickers,
        body: replyText.slice(0, 4000),
      }),
    )
    .digest('hex');
  const requestId = explicitRequestId ?? `fallback:${fallbackRequestId}`;
  const requestDedupeKey = `${REQUEST_DEDUPE_PREFIX}:${requestId}`;
  const requestReserved = await redis.set(requestDedupeKey, sender, {
    nx: true,
    ex: REQUEST_DEDUPE_TTL_SECONDS,
  });
  if (!requestReserved) {
    console.info('[reply/inbound] duplicate request suppressed', {
      sender,
      tickers,
      requestId,
    });
    return Response.json({
      processed: true,
      deduped: true,
      tickers,
      reason: 'duplicate_request',
    });
  }

  const dedupeBasket = [...tickers].sort().join(',');
  if (dedupeBasket.length > 0) {
    const dedupeKey = `${REPLY_DEDUPE_PREFIX}:${sender.toLowerCase()}:${dedupeBasket}`;
    const reserved = await redis.set(dedupeKey, sender, {
      nx: true,
      ex: REPLY_DEDUPE_TTL_SECONDS,
    });
    if (!reserved) {
      console.info('[reply/inbound] duplicate basket suppressed', {
        sender,
        tickers,
        dedupeWindowSeconds: REPLY_DEDUPE_TTL_SECONDS,
      });
      return Response.json({
        processed: true,
        deduped: true,
        tickers,
      });
    }
  }
  console.info('[reply/inbound] request parsed', {
    sender,
    tickers,
    routedTo: TEST_RECIPIENT_EMAIL,
  });

  if (tickers.length === 0) {
    console.warn('[reply/inbound] no tickers parsed', {
      sender,
      replyPreview: replyText.slice(0, 300),
      payloadKeys: Object.keys(payload ?? {}),
    });
    const noTickerSend = await sendEmail({
      to: TEST_RECIPIENT_EMAIL,
      subject: 'No valid tickers found in your reply',
      html: '<p>Reply with comma-separated tickers, for example: <code>AAPL, MSFT, NVDA</code>.</p>',
    });
    if (!noTickerSend.ok) {
      console.error('[reply/inbound] no-ticker reply email failed', noTickerSend);
    } else {
      console.info('[reply/inbound] no-ticker reply email sent', { status: noTickerSend.status });
    }
    return Response.json({ processed: true, tickers: [], send: noTickerSend });
  }

  const sections: string[] = [];
  for (const ticker of tickers) {
    const result = await getLatestPressRelease(ticker);
    if (!result.pressReleaseUrl) {
      sections.push(`<h3>${ticker}</h3><p>No earnings press release found.</p>`);
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
    const businessCommentary = extractBusinessCommentary({
      preferredText: result.transcriptText ?? transcriptPdfFallbackSummary,
      fallbackText: result.pressReleaseText,
    });
    sections.push(
      [
        `<h3>${escapeHtml(result.companyName ?? result.ticker)} (${result.ticker})</h3>`,
        `<p>${formatFinanceText(`${result.quarterLabel ?? 'Quarter'} • Filed ${result.pressReleaseFilingDate ?? 'Unknown date'}`)}</p>`,
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
        businessCommentary.lines.length > 0 ? `<h4>Business Commentary (${businessCommentary.source})</h4>` : '',
        businessCommentary.lines.length > 0
          ? `<ul>${businessCommentary.lines.map((line) => `<li>${formatFinanceText(line)}</li>`).join('')}</ul>`
          : '',
      ].join(''),
    );
  }

  const sendResult = await sendEmail({
    to: TEST_RECIPIENT_EMAIL,
    subject: `Requested earnings summaries: ${tickers.join(', ')}`,
    html: sections.join('<hr />'),
  });

  if (!sendResult.ok) {
    console.error('[reply/inbound] summary reply email failed', {
      sender,
      routedTo: TEST_RECIPIENT_EMAIL,
      tickers,
      sendResult,
    });
  } else {
    console.info('[reply/inbound] summary reply email sent', {
      sender,
      routedTo: TEST_RECIPIENT_EMAIL,
      tickers,
      resendStatus: sendResult.status,
      resendId: sendResult.id,
    });
  }

  return Response.json({ processed: true, tickers, send: sendResult });
}
