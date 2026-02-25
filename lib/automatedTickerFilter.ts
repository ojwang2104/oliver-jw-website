export type TickerProfile = {
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
};

export const PHARMA_OVERRIDE_MIN_MARKET_CAP = 100_000_000_000;

const INCLUDED_AUTOMATED_TICKERS = new Set(['CEG']);
const EXCLUDED_AUTOMATED_TICKERS = new Set(['DE', 'DTM', 'EVRG', 'ED', 'AMH', 'ET']);
const EXCLUDED_SECTOR_KEYWORDS = ['energy', 'utilities', 'real estate', 'industrials'];
const EXCLUDED_INDUSTRY_KEYWORDS = [
  'oil',
  'gas',
  'pipeline',
  'electric',
  'utility',
  'real estate',
  'reit',
  'construction',
  'machinery',
  'steel',
  'mining',
];
const PHARMA_SECTOR_KEYWORDS = ['pharmaceutical', 'biotechnology', 'biotech'];
const PHARMA_INDUSTRY_KEYWORDS = ['pharma', 'pharmaceutical', 'biotech', 'biotechnology', 'drug'];

export function isLikelyPharmaCompany(profile: TickerProfile | null) {
  const sector = String(profile?.sector ?? '').toLowerCase();
  const industry = String(profile?.industry ?? '').toLowerCase();
  return (
    PHARMA_SECTOR_KEYWORDS.some((keyword) => sector.includes(keyword)) ||
    PHARMA_INDUSTRY_KEYWORDS.some((keyword) => industry.includes(keyword))
  );
}

export function shouldExcludeAutomatedTicker(
  ticker: string,
  profile: TickerProfile | null,
  marketCap: number | null,
) {
  const upper = ticker.toUpperCase();
  if (INCLUDED_AUTOMATED_TICKERS.has(upper)) return false;
  if (EXCLUDED_AUTOMATED_TICKERS.has(upper)) return true;

  const sector = String(profile?.sector ?? '').toLowerCase();
  const industry = String(profile?.industry ?? '').toLowerCase();
  if (EXCLUDED_SECTOR_KEYWORDS.some((keyword) => sector.includes(keyword))) return true;
  if (EXCLUDED_INDUSTRY_KEYWORDS.some((keyword) => industry.includes(keyword))) return true;

  if (isLikelyPharmaCompany(profile)) {
    return (marketCap ?? 0) <= PHARMA_OVERRIDE_MIN_MARKET_CAP;
  }
  return false;
}
