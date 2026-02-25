import { createHash } from 'node:crypto';

const QUARTER_LABEL_REGEX = /\bQ[1-4](?:\s+FY\d{4})?\b/i;

const EARNINGS_SIGNAL_KEYWORDS = [
  'earnings',
  'financial results',
  'results for',
  'quarter ended',
  'reported',
];

const METRIC_KEYWORDS = [
  'revenue',
  'eps',
  'earnings per share',
  'net income',
  'operating income',
  'cash flow',
  'guidance',
];

const NON_EARNINGS_SIGNALS = [
  'definitive agreement',
  'acquisition',
  'merger',
  'appoints',
  'board of directors',
];

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hasQuarterLabel(quarterLabel: string | null) {
  if (!quarterLabel) return false;
  return QUARTER_LABEL_REGEX.test(quarterLabel);
}

export function isLikelyEarningsPressRelease(params: {
  quarterLabel: string | null;
  pressReleaseText: string | null;
}) {
  const { quarterLabel, pressReleaseText } = params;
  if (!hasQuarterLabel(quarterLabel)) return false;
  if (!pressReleaseText) return false;

  const normalized = normalizeText(pressReleaseText);
  const earningsSignals = EARNINGS_SIGNAL_KEYWORDS.filter((item) => normalized.includes(item)).length;
  const metricSignals = METRIC_KEYWORDS.filter((item) => normalized.includes(item)).length;
  const nonEarningsSignals = NON_EARNINGS_SIGNALS.filter((item) => normalized.includes(item)).length;

  if (metricSignals >= 2 && earningsSignals >= 1) return true;
  if (metricSignals >= 3) return true;
  if (nonEarningsSignals >= 2 && metricSignals < 2) return false;
  return false;
}

export function replyRequestFingerprint(params: {
  sender: string;
  subject: string;
  tickers: string[];
  replyText: string;
}) {
  const canonical = JSON.stringify({
    sender: params.sender.toLowerCase().trim(),
    subject: params.subject.toUpperCase().replace(/\s+/g, ' ').trim(),
    tickers: [...new Set(params.tickers.map((t) => t.toUpperCase().trim()))].sort(),
    body: params.replyText.replace(/\s+/g, ' ').trim().slice(0, 4000),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
