type MetricRule = {
  label: string;
  keywords: string[];
};

const METRIC_RULES: MetricRule[] = [
  { label: 'Revenue', keywords: ['revenue', 'revenues'] },
  { label: 'EPS', keywords: ['eps', 'earnings per share'] },
  {
    label: 'Operating Income/Margin',
    keywords: ['operating income', 'operating margin', 'gross margin'],
  },
  { label: 'Net Income', keywords: ['net income', 'net loss'] },
  {
    label: 'Operating Cash Flow/Free Cash Flow',
    keywords: ['operating cash flow', 'free cash flow', 'cash flow from operations'],
  },
  { label: 'Guidance', keywords: ['guidance', 'outlook'] },
  {
    label: 'Cash/Marketable Securities',
    keywords: ['cash and marketable securities', 'marketable securities', 'cash and cash equivalents'],
  },
];

const QUARTER_REGEX = /\b(q[1-4]|quarter|three months|3 months)\b/i;
const FULL_YEAR_REGEX =
  /\b(full year|fiscal year|fy\s?\d{2,4}|twelve months|12 months|year ended)\b/i;
const REVENUE_NOT_DISCLOSED_REGEX =
  /\brevenue[^.\n]{0,60}\b(?:not|no)\s+(?:clearly\s+)?(?:disclosed|provided|reported|available)\b/i;

function normalizeText(input: string) {
  return input.toLowerCase();
}

function containsKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function splitIntoUnits(text: string) {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function hasQuarterAndFullYearInSource(sourceText: string, keywords: string[]) {
  const units = splitIntoUnits(normalizeText(sourceText));
  let quarterHit = false;
  let fullYearHit = false;

  for (const unit of units) {
    if (!containsKeyword(unit, keywords)) continue;
    if (QUARTER_REGEX.test(unit)) quarterHit = true;
    if (FULL_YEAR_REGEX.test(unit)) fullYearHit = true;
    if (quarterHit && fullYearHit) return true;
  }

  return false;
}

function hasQuarterAndFullYearInSummary(summaryText: string, keywords: string[]) {
  const units = splitIntoUnits(normalizeText(summaryText));
  let quarterHit = false;
  let fullYearHit = false;

  for (const unit of units) {
    if (!containsKeyword(unit, keywords)) continue;
    if (QUARTER_REGEX.test(unit)) quarterHit = true;
    if (FULL_YEAR_REGEX.test(unit)) fullYearHit = true;
    if (quarterHit && fullYearHit) return true;
  }

  return false;
}

export function validateSummaryPeriodCoverage(summaryText: string, sourceText: string) {
  const missing: string[] = [];
  const required: string[] = [];

  for (const rule of METRIC_RULES) {
    const requiresDual = hasQuarterAndFullYearInSource(sourceText, rule.keywords);
    if (!requiresDual) continue;
    required.push(rule.label);
    if (!hasQuarterAndFullYearInSummary(summaryText, rule.keywords)) {
      missing.push(rule.label);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    required,
  };
}

function normalizeFragment(fragment: string) {
  return fragment.replace(/\s+/g, ' ').trim();
}

export function extractRevenueDisclosureFragment(sourceText: string) {
  const patterns = [
    /((?:(?:operating|total|net)\s+)?revenues?[^.]{0,220})(?:\.|$)/i,
    /((?:(?:operating|total|net)\s+)?revenues?[^;]{0,220});/i,
  ];
  for (const pattern of patterns) {
    const match = sourceText.match(pattern);
    if (!match?.[1]) continue;
    const normalized = normalizeFragment(match[1]);
    if (normalized.length >= 12 && /\d/.test(normalized)) return normalized;
  }
  return null;
}

export function enforceRevenueDisclosure(summaryText: string | null, sourceText: string) {
  if (!summaryText) return summaryText;
  if (!REVENUE_NOT_DISCLOSED_REGEX.test(summaryText)) return summaryText;
  const fragment = extractRevenueDisclosureFragment(sourceText);
  if (!fragment) return summaryText;
  return summaryText.replace(REVENUE_NOT_DISCLOSED_REGEX, `Revenue: ${fragment}`);
}
