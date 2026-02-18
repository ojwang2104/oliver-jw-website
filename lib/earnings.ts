const SEC_HEADERS = {
  'User-Agent': 'OliverJWBot/1.0 (oliverjw.me; olivejwca@gmail.com)',
  'Accept-Encoding': 'gzip, deflate',
};
const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SEC_BASE = 'https://data.sec.gov';
const SEC_ARCHIVES = 'https://www.sec.gov';
const SEC_FILES = 'https://www.sec.gov/files/company_tickers.json';

function isSecUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'sec.gov' || host.endsWith('.sec.gov') || host === 'data.sec.gov';
  } catch {
    return false;
  }
}

function headersForUrl(url: string) {
  return isSecUrl(url) ? SEC_HEADERS : WEB_HEADERS;
}

const IR_SITES: Record<string, string> = {
  AAPL: 'https://investor.apple.com',
  MSFT: 'https://www.microsoft.com/en-us/investor',
  NVDA: 'https://investor.nvidia.com',
  AMZN: 'https://ir.aboutamazon.com',
  GOOGL: 'https://abc.xyz/investor',
  META: 'https://investor.fb.com',
  TSLA: 'https://ir.tesla.com',
  NFLX: 'https://ir.netflix.net',
  AMD: 'https://ir.amd.com',
  INTC: 'https://www.intc.com/investor-relations',
};

const TRANSCRIPT_OVERRIDES: Record<
  string,
  Array<{ minFilingDate?: string; maxFilingDate?: string; url: string }>
> = {
  AVGO: [
    {
      minFilingDate: '2025-12-11',
      maxFilingDate: '2026-03-31',
      url: 'https://www.fool.com/earnings/call-transcripts/2025/12/12/broadcom-avgo-q4-2025-earnings-call-transcript/',
    },
  ],
  VERX: [
    {
      minFilingDate: '2026-02-11',
      maxFilingDate: '2026-05-31',
      url: 'https://seekingalpha.com/article/4868795-vertex-inc-verx-q4-2025-earnings-call-transcript',
    },
  ],
};

type FilingInfo = {
  accessionNumber: string;
  filingDate: string;
  primaryDocument: string;
};

export type DailyEarningsCandidate = {
  ticker: string;
  cik: string;
  accessionNumber: string;
  filingDate: string;
};

export type PressReleaseResult = {
  ticker: string;
  companyName: string | null;
  quarterLabel: string | null;
  pressReleaseFilingDate: string | null;
  pressReleaseUrl: string | null;
  pressReleaseIsPrevious: boolean;
  pressReleaseText: string | null;
  transcriptUrl: string | null;
  transcriptText: string | null;
  transcriptSource: 'ir' | 'sec' | 'web' | null;
  accessionNumber: string | null;
};

let cachedTickerMap: Map<string, { cik: string; name: string }> | null = null;
const submissionsCache = new Map<string, any>();

export function normalizeTickers(input: string) {
  return input
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0 && /^[A-Z.-]{1,8}$/.test(t));
}

async function getTickerMap() {
  if (cachedTickerMap) return cachedTickerMap;
  const res = await fetch(SEC_FILES, { headers: SEC_HEADERS });
  if (!res.ok) {
    throw new Error(`SEC ticker map failed: ${res.status}`);
  }
  const data = await res.json();
  const map = new Map<string, { cik: string; name: string }>();
  Object.values(data).forEach((entry: any) => {
    if (!entry?.ticker || typeof entry.cik_str !== 'number') return;
    const cik = String(entry.cik_str).padStart(10, '0');
    const name = String(entry.title ?? '').trim();
    map.set(String(entry.ticker).toUpperCase(), { cik, name });
  });
  cachedTickerMap = map;
  return map;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: headersForUrl(url) });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: headersForUrl(url) });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

async function fetchTextSoft(url: string) {
  try {
    const res = await fetch(url, { headers: headersForUrl(url) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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
    mdash: '-',
    ndash: '-',
    bull: '-',
    middot: '-',
  };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _m;
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _m;
    }
    return named[lower] ?? _m;
  });
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\u2022/g, ' - ')
    .replace(/\u00b7/g, ' - ')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDocumentText(text: string | null) {
  if (!text) return null;
  return decodeHtmlEntities(text)
    .replace(/\u2022/g, ' - ')
    .replace(/\u00b7/g, ' - ')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLatest8K(submissions: any): FilingInfo | null {
  const recent = submissions?.filings?.recent;
  if (!recent?.form?.length) return null;
  for (let i = 0; i < recent.form.length; i += 1) {
    const form = String(recent.form[i] ?? '');
    if (form.startsWith('8-K')) {
      return {
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      };
    }
  }
  return null;
}

function findEarnings8Ks(submissions: any): FilingInfo[] {
  const recent = submissions?.filings?.recent;
  if (!recent?.form?.length) return [];
  const matches: FilingInfo[] = [];
  for (let i = 0; i < recent.form.length; i += 1) {
    const form = String(recent.form[i] ?? '');
    const items = String(recent.items?.[i] ?? '');
    if (form.startsWith('8-K') && items.includes('2.02')) {
      matches.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }
  return matches.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

function looksLikeEx99PressRelease(name: string) {
  const lower = name.toLowerCase();
  return (
    /(?:^|[^a-z])exh?[-_]?99(?:[-_.]?0?1)?(?:[^a-z0-9]|$)/.test(lower) ||
    /(?:^|[^a-z])exhibit[-_]?99(?:[-_.]?0?1)?(?:[^a-z0-9]|$)/.test(lower) ||
    /(?:^|[^a-z])99[-_.]?0?1(?:[^a-z0-9]|$)/.test(lower)
  );
}

function formatEdgarDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return { yyyymmdd: `${year}${month}${day}`, yyyy: year, mm: month, dd: day };
}

function getEdgarQuarter(month: number) {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function normalizeCik(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.padStart(10, '0');
}

function accessionFromPath(path: string) {
  const match = path.match(/\/(\d{18})\//);
  if (!match) return null;
  const raw = match[1];
  return `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;
}

async function getSubmissions(cik: string) {
  if (submissionsCache.has(cik)) return submissionsCache.get(cik);
  const data = await fetchJson(`${SEC_BASE}/submissions/CIK${cik}.json`).catch(() => null);
  if (data) submissionsCache.set(cik, data);
  return data;
}

function hasEarningsItemForAccession(submissions: any, accessionNumber: string) {
  const recent = submissions?.filings?.recent;
  if (!recent?.accessionNumber?.length) return false;
  for (let i = 0; i < recent.accessionNumber.length; i += 1) {
    if (String(recent.accessionNumber[i]) !== accessionNumber) continue;
    const form = String(recent.form?.[i] ?? '');
    const items = String(recent.items?.[i] ?? '');
    return form.startsWith('8-K') && items.includes('2.02');
  }
  return false;
}

export async function getDailyEarningsCandidates(): Promise<DailyEarningsCandidate[]> {
  const tickerMap = await getTickerMap();
  const cikToTicker = new Map<string, string>();
  for (const [ticker, data] of tickerMap.entries()) {
    if (!cikToTicker.has(data.cik)) cikToTicker.set(data.cik, ticker);
  }

  const daysToTry = [0, -1, -2];
  const filings: Array<{ cik: string; filingDate: string; path: string; accessionNumber: string }> = [];

  for (const offset of daysToTry) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const parts = formatEdgarDate(date);
    const month = Number.parseInt(parts.mm, 10);
    const qtr = getEdgarQuarter(month);
    const idxUrl = `${SEC_ARCHIVES}/Archives/edgar/daily-index/${parts.yyyy}/QTR${qtr}/master.${parts.yyyymmdd}.idx`;
    const idxText = await fetchTextSoft(idxUrl);
    if (!idxText) continue;

    for (const line of idxText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('|')) continue;
      const split = trimmed.split('|');
      if (split.length < 5) continue;
      const form = String(split[2] ?? '').toUpperCase();
      if (!form.startsWith('8-K')) continue;
      const cik = normalizeCik(String(split[0] ?? ''));
      const filingDate = String(split[3] ?? '');
      const path = String(split[4] ?? '');
      const accessionNumber = accessionFromPath(path);
      if (!accessionNumber) continue;
      filings.push({ cik, filingDate, path, accessionNumber });
    }
    if (filings.length > 0) break;
  }

  if (filings.length === 0) return [];

  const candidates: DailyEarningsCandidate[] = [];
  for (const filing of filings) {
    const ticker = cikToTicker.get(filing.cik);
    if (!ticker) continue;
    const submissions = await getSubmissions(filing.cik);
    if (!submissions) continue;
    if (!hasEarningsItemForAccession(submissions, filing.accessionNumber)) continue;
    candidates.push({
      ticker,
      cik: filing.cik,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
    });
  }

  const byTicker = new Map<string, DailyEarningsCandidate>();
  for (const candidate of candidates) {
    const existing = byTicker.get(candidate.ticker);
    if (!existing || candidate.filingDate > existing.filingDate) {
      byTicker.set(candidate.ticker, candidate);
    }
  }

  return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

async function findPressRelease(cik: string, filing: FilingInfo) {
  const accessionNo = filing.accessionNumber;
  const accessionNoNoDashes = accessionNo.replace(/-/g, '');
  const basePath = `${SEC_ARCHIVES}/Archives/edgar/data/${Number(cik)}/${accessionNoNoDashes}`;
  const indexCandidates = [
    `${basePath}/${accessionNo}-index.json`,
    `${basePath}/index.json`,
  ];

  let files: any[] = [];
  for (const indexUrl of indexCandidates) {
    try {
      const indexJson = await fetchJson(indexUrl);
      files = indexJson?.directory?.item ?? [];
      if (files.length > 0) break;
    } catch {
      continue;
    }
  }

  const scoreFile = (file: any) => {
    const name = String(file?.name ?? '').toLowerCase();
    const type = String(file?.type ?? '').toLowerCase();
    const extMatch = name.match(/\.(\w+)$/);
    const ext = extMatch ? extMatch[1] : '';
    let score = 0;

    if (type.startsWith('ex-99.1') || type === 'ex-99.1') score += 8;
    if (type.startsWith('ex-99')) score += 6;
    if (looksLikeEx99PressRelease(name)) score += 8;
    if (name.includes('99.1') || name.includes('99-1') || name.includes('99_1')) score += 6;
    if (name.includes('99.01') || name.includes('99-01') || name.includes('99_01')) score += 5;
    if (name.includes('99.2') || name.includes('99-2') || name.includes('99_2')) score -= 6;
    if (name.includes('ex99') || name.includes('ex-99') || name.includes('ex_99')) score += 5;
    if (name.includes('exhibit99') || name.includes('exhibit-99')) score += 4;

    if (name.includes('press') || name.includes('pressrelease') || name.includes('press-release')) score += 4;
    if (name.includes('earnings') || name.includes('results')) score += 3;
    if (name.includes('quarter') || /q[1-4]/.test(name) || name.includes('fy')) score += 2;
    if (name.includes('release')) score += 2;
    if (name.endsWith('pr.htm') || name.endsWith('pr.html')) score += 4;
    if (/q[1-4].*fy.*pr\.html?$/.test(name) || /q[1-4].*pr\.html?$/.test(name)) score += 4;
    if (name.includes('news')) score += 1;
    if (
      name.includes('acquisition') ||
      name.includes('merger') ||
      name.includes('transaction') ||
      name.includes('agreement') ||
      name.includes('definitive')
    ) {
      score -= 8;
    }

    if (ext === 'htm' || ext === 'html' || ext === 'txt') score += 1;
    return score;
  };

  const scored = files
    .map((file: any) => ({ file, score: scoreFile(file) }))
    .filter((entry: any) => entry.score > 0)
    .sort((a: any, b: any) => b.score - a.score);

  const best = scored[0];
  if (best && best.score >= 4) {
    const docUrl = `${basePath}/${best.file.name}`;
    return { url: docUrl, text: await fetchText(docUrl) };
  }

  const primaryName = String(filing.primaryDocument ?? '').toLowerCase();
  const looksLikePressRelease =
    primaryName.includes('pr') ||
    primaryName.includes('press') ||
    primaryName.includes('earnings') ||
    primaryName.includes('results');
  if (primaryName && looksLikePressRelease) {
    const fallbackUrl = `${basePath}/${filing.primaryDocument}`;
    return { url: fallbackUrl, text: await fetchText(fallbackUrl) };
  }

  return { url: null, text: null };
}

async function findTranscript(cik: string, filing: FilingInfo) {
  const accessionNo = filing.accessionNumber;
  const accessionNoNoDashes = accessionNo.replace(/-/g, '');
  const basePath = `${SEC_ARCHIVES}/Archives/edgar/data/${Number(cik)}/${accessionNoNoDashes}`;
  const indexCandidates = [
    `${basePath}/${accessionNo}-index.json`,
    `${basePath}/index.json`,
  ];

  let files: any[] = [];
  for (const indexUrl of indexCandidates) {
    try {
      const indexJson = await fetchJson(indexUrl);
      files = indexJson?.directory?.item ?? [];
      if (files.length > 0) break;
    } catch {
      continue;
    }
  }

  const scoreFile = (file: any) => {
    const name = String(file?.name ?? '').toLowerCase();
    const type = String(file?.type ?? '').toLowerCase();
    const extMatch = name.match(/\.(\w+)$/);
    const ext = extMatch ? extMatch[1] : '';
    let score = 0;
    if (type.startsWith('ex-99.2')) score += 7;
    if (type.startsWith('ex-99')) score += 2;
    if (name.includes('transcript')) score += 8;
    if (name.includes('conference') && name.includes('call')) score += 5;
    if (name.includes('prepared') && name.includes('remarks')) score += 4;
    if (name.includes('earnings') && name.includes('call')) score += 4;
    if (name.includes('operator')) score += 2;
    if (name.includes('pr')) score -= 4;
    if (name.includes('press')) score -= 5;
    if (name.includes('10-q') || name.includes('10q') || name.includes('10-k') || name.includes('10k')) score -= 10;
    if (ext === 'htm' || ext === 'html' || ext === 'txt') score += 1;
    const isTranscriptLike =
      name.includes('transcript') ||
      (name.includes('earnings') && name.includes('call')) ||
      (name.includes('conference') && name.includes('call')) ||
      type.includes('ex-99.2');
    if (!isTranscriptLike) score -= 6;
    return score;
  };

  const best = files
    .map((file: any) => ({ file, score: scoreFile(file) }))
    .filter((entry: any) => entry.score >= 7)
    .sort((a: any, b: any) => b.score - a.score)[0];

  if (!best) return { url: null, text: null };
  const transcriptUrl = `${basePath}/${best.file.name}`;
  return { url: transcriptUrl, text: await fetchText(transcriptUrl) };
}

function toAbsoluteUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseUrl: string) {
  const links = new Set<string>();
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    const absolute = toAbsoluteUrl(baseUrl, href);
    if (!absolute) continue;
    links.add(absolute);
  }
  return [...links];
}

function scoreTranscriptLink(link: string, quarterLabel: string | null) {
  const lower = link.toLowerCase();
  let score = 0;
  if (lower.includes('duckduckgo.com/html/?q=')) score -= 30;
  if (lower.includes('duckduckgo.com/l/?')) score -= 20;
  if (lower.includes('external-content.duckduckgo.com')) score -= 40;
  if (lower.includes('r.jina.ai/http://duckduckgo.com')) score -= 30;
  if (lower.includes('/search?') || lower.includes('/results?')) score -= 10;
  if (/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js)(\?|#|$)/.test(lower)) score -= 40;
  if (lower.includes('transcript')) score += 8;
  if (lower.includes('call-transcript') || lower.includes('call-transcripts')) score += 6;
  if (lower.includes('earnings-call') || lower.includes('earnings_call')) score += 6;
  if (lower.includes('conference-call')) score += 4;
  if (lower.includes('q4cdn.com')) score += 3;
  if (lower.endsWith('.pdf')) score += 2;
  if (lower.includes('/files/doc_financials/')) score += 2;
  if (lower.includes('investor')) score += 1;
  if (lower.includes('10-q') || lower.includes('10q') || lower.includes('10-k') || lower.includes('10k')) score -= 12;
  if (lower.includes('/sec-filings/')) score -= 8;
  if (lower.includes('/sec/') && !lower.includes('transcript')) score -= 4;
  if (lower.includes('seekingalpha.com')) score += 8;
  if (lower.includes('fool.com/earnings/call-transcripts')) score += 8;
  if (lower.includes('investing.com')) score += 3;
  if (lower.includes('q4cdn.com')) score += 4;
  if (lower.includes('msn.com')) score -= 8;
  if (lower.includes('finance.yahoo.com')) score -= 6;
  if (lower.includes('benzinga.com')) score -= 4;
  if (lower.includes('globenewswire.com')) score -= 4;
  if (quarterLabel) {
    const qMatch = quarterLabel.toLowerCase().match(/q([1-4])\s*fy(\d{4})/);
    if (qMatch) {
      const quarter = `q${qMatch[1]}`;
      const fiscalYear = qMatch[2];
      const yearShort = fiscalYear.slice(2);
      if (lower.includes(quarter)) score += 3;
      if (lower.includes(fiscalYear) || lower.includes(`fy${fiscalYear}`)) score += 3;
      if (lower.includes(`fy${yearShort}`) || lower.includes(`-${yearShort}`)) score += 2;
    }
  }
  return score;
}

function quarterSearchTokens(quarterLabel: string | null) {
  if (!quarterLabel) return '';
  const lower = quarterLabel.toLowerCase();
  const match = lower.match(/q([1-4])(?:\s*fy(\d{4}))?/);
  if (!match) return quarterLabel;
  const q = match[1];
  const fy = match[2];
  const wordQuarter = ['first', 'second', 'third', 'fourth'][Number.parseInt(q, 10) - 1];
  if (!fy) return `q${q} ${wordQuarter} quarter`;
  const short = fy.slice(2);
  return `q${q} fy${fy} fy${short} ${wordQuarter} quarter ${fy}`;
}

function buildTranscriptQueries(
  ticker: string,
  quarterLabel: string | null,
  companyName: string | null,
) {
  const quarterTokens = quarterSearchTokens(quarterLabel);
  const companyTokens = companyName ? companyName.replace(/[.,]/g, ' ') : ticker;
  const queries = [
    `${ticker} earnings call transcript ${quarterTokens} investor relations`,
    `${companyTokens} earnings call transcript ${quarterTokens}`,
    `${ticker} site:seekingalpha.com earnings call transcript ${quarterTokens}`,
    `${ticker} site:fool.com/earnings/call-transcripts ${quarterTokens}`,
    `${ticker} site:investor.* transcript ${quarterTokens}`,
  ];
  return [...new Set(queries.map((q) => q.trim()))];
}

function extractCandidateUrlsFromHtml(html: string) {
  const urls = new Set<string>();
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    let href = match[1];
    if (!href) continue;
    if (href.startsWith('//duckduckgo.com/l/?')) href = href.replace('//duckduckgo.com/l/?', '/l/?');
    if (href.startsWith('/l/?')) {
      const uddg = href.match(/[?&]uddg=([^&]+)/i);
      if (uddg) href = decodeURIComponent(uddg[1]);
    }
    if (!href.startsWith('http')) continue;
    urls.add(href);
  }
  return [...urls];
}

function extractCandidateUrlsFromText(text: string) {
  const urls = new Set<string>();
  const urlRegex = /https?:\/\/[^\s)<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[),.;:]+$/, '');
    urls.add(url);
  }
  return [...urls];
}

async function findWebTranscriptCandidates(
  ticker: string,
  quarterLabel: string | null,
  companyName: string | null,
) {
  const queries = buildTranscriptQueries(ticker, quarterLabel, companyName);
  const scored = new Map<string, number>();

  const addScored = (url: string) => {
    const lower = url.toLowerCase();
    if (lower.includes('duckduckgo.com/html/?q=')) return;
    if (lower.includes('r.jina.ai/http://duckduckgo.com')) return;
    if (lower.includes('external-content.duckduckgo.com')) return;
    if (/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js)(\?|#|$)/.test(lower)) return;
    const score = scoreTranscriptLink(url, quarterLabel);
    if (score < 8) return;
    const current = scored.get(url) ?? -Infinity;
    if (score > current) scored.set(url, score);
  };

  for (const query of queries) {
    const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ddgHtml = await fetchTextSoft(ddgUrl);
    if (ddgHtml) {
      for (const url of extractCandidateUrlsFromHtml(ddgHtml)) addScored(url);
    }

    const jinaUrl = `https://r.jina.ai/http://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const jinaText = await fetchTextSoft(jinaUrl);
    if (jinaText) {
      for (const url of extractCandidateUrlsFromText(jinaText)) addScored(url);
    }
  }

  return [...scored.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);
}

function isLikelyTranscriptDoc(params: { title?: string; category?: string; path?: string }) {
  const title = String(params.title ?? '').toLowerCase();
  const category = String(params.category ?? '').toLowerCase();
  const path = String(params.path ?? '').toLowerCase();
  const combined = `${title} ${category} ${path}`;
  if (!combined) return false;
  const hasTranscriptSignal =
    combined.includes('transcript') ||
    (combined.includes('earnings') && combined.includes('call')) ||
    (combined.includes('conference') && combined.includes('call'));
  const hasFilingSignal =
    combined.includes('10-q') ||
    combined.includes('10q') ||
    combined.includes('10-k') ||
    combined.includes('10k') ||
    combined.includes('sec filing');
  return hasTranscriptSignal && !hasFilingSignal;
}

function parseQuarterMeta(quarterLabel: string | null) {
  if (!quarterLabel) return { quarter: null as number | null, fiscalYear: null as number | null };
  const match = quarterLabel.toUpperCase().match(/Q([1-4])(?:\s*FY(\d{4}))?/);
  if (!match) return { quarter: null as number | null, fiscalYear: null as number | null };
  return {
    quarter: Number.parseInt(match[1], 10),
    fiscalYear: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

async function findIrTranscriptFromQ4Feed(
  irSite: string,
  quarterLabel: string | null,
  filingDate: string | null,
): Promise<{ url: string | null; text: string | null }> {
  let origin: string;
  try {
    origin = new URL(irSite).origin;
  } catch {
    return { url: null, text: null };
  }

  const data = await fetchJson(`${origin}/feed/FinancialReport.svc/GetFinancialReportList`).catch(
    () => null,
  );
  const reports = data?.GetFinancialReportListResult;
  if (!Array.isArray(reports)) return { url: null, text: null };

  const { quarter, fiscalYear } = parseQuarterMeta(quarterLabel);
  const filingYear = filingDate ? Number.parseInt(filingDate.slice(0, 4), 10) : null;
  const filingMonth = filingDate ? Number.parseInt(filingDate.slice(5, 7), 10) : null;
  const expectedReportYear =
    filingYear && quarter
      ? quarter === 4 && filingMonth && filingMonth <= 3
        ? filingYear - 1
        : filingYear
      : filingYear;
  const candidates: Array<{ url: string; score: number; reportYear: number | null }> = [];

  for (const report of reports) {
    const reportTitle = String(report?.ReportTitle ?? '').toLowerCase();
    const reportSubType = String(report?.ReportSubType ?? '').toLowerCase();
    const reportYear = Number.parseInt(String(report?.ReportYear ?? ''), 10);
    const reportQuarterMatch =
      reportSubType.match(/first|second|third|fourth/) ??
      reportTitle.match(/first|second|third|fourth|q[1-4]/);

    let reportScore = 0;
    if (fiscalYear && Number.isFinite(reportYear) && reportYear === fiscalYear) reportScore += 4;
    if (expectedReportYear && Number.isFinite(reportYear)) {
      const yearDiff = Math.abs(reportYear - expectedReportYear);
      if (yearDiff === 0) reportScore += 5;
      else if (yearDiff === 1) reportScore += 2;
      else if (yearDiff >= 3) reportScore -= 6;
    }
    if (quarter && reportQuarterMatch) {
      const matchText = reportQuarterMatch[0];
      if (
        matchText.includes(`q${quarter}`) ||
        (quarter === 1 && matchText.includes('first')) ||
        (quarter === 2 && matchText.includes('second')) ||
        (quarter === 3 && matchText.includes('third')) ||
        (quarter === 4 && matchText.includes('fourth'))
      ) {
        reportScore += 4;
      }
    }

    for (const doc of report?.Documents ?? []) {
      const title = String(doc?.DocumentTitle ?? '').toLowerCase();
      const category = String(doc?.DocumentCategory ?? '').toLowerCase();
      const type = String(doc?.DocumentType ?? '').toLowerCase();
      const path = String(doc?.DocumentPath ?? '');
      if (!path.startsWith('http')) continue;
      if (!isLikelyTranscriptDoc({ title, category, path })) continue;

      let score = reportScore;
      if (category.includes('transcript')) score += 8;
      if (title.includes('transcript')) score += 8;
      if (title.includes('earnings call')) score += 4;
      if (type.includes('file') && path.toLowerCase().endsWith('.pdf')) score += 2;
      if (score >= 10) candidates.push({ url: path, score, reportYear: Number.isFinite(reportYear) ? reportYear : null });
    }
  }

  if (candidates.length === 0) return { url: null, text: null };
  candidates.sort((a, b) => b.score - a.score || (b.reportYear ?? 0) - (a.reportYear ?? 0));
  const bestUrl = candidates[0].url;
  if (bestUrl.toLowerCase().endsWith('.pdf')) {
    return { url: bestUrl, text: null };
  }
  const text = await fetchTextSoft(bestUrl);
  return { url: bestUrl, text };
}

async function findWebTranscript(
  ticker: string,
  quarterLabel: string | null,
  companyName: string | null,
): Promise<{ url: string | null; text: string | null }> {
  const candidates = await findWebTranscriptCandidates(ticker, quarterLabel, companyName);
  if (candidates.length === 0) return { url: null, text: null };

  for (const candidate of candidates) {
    const url = candidate.url;
    if (url.toLowerCase().endsWith('.pdf')) return { url, text: null };
    const text = await fetchTextSoft(url);
    if (!text) {
      if (candidate.score >= 14) return { url, text: null };
      continue;
    }
    const snippet = text.slice(0, 4000).toLowerCase();
    if (
      snippet.includes('transcript') ||
      (snippet.includes('earnings') && snippet.includes('call')) ||
      candidate.score >= 14
    ) {
      return { url, text };
    }
  }
  return { url: candidates[0].url, text: null };
}

async function findIrTranscript(
  ticker: string,
  quarterLabel: string | null,
  filingDate: string | null,
): Promise<{ url: string | null; text: string | null }> {
  const irSite = getIrSite(ticker);
  if (!irSite) return { url: null, text: null };
  const q4FeedResult = await findIrTranscriptFromQ4Feed(irSite, quarterLabel, filingDate);
  if (q4FeedResult.url) return q4FeedResult;
  const base = irSite.replace(/\/+$/, '');
  const candidatePages = [
    base,
    `${base}/events-and-presentations`,
    `${base}/events-and-presentations/default.aspx`,
    `${base}/financial-info/quarterly-results`,
    `${base}/financial-info/quarterly-results/default.aspx`,
    `${base}/news-releases`,
  ];

  const candidates: Array<{ url: string; score: number }> = [];
  for (const pageUrl of candidatePages) {
    const html = await fetchTextSoft(pageUrl);
    if (!html) continue;
    const links = extractLinks(html, pageUrl);
    for (const link of links) {
      const score = scoreTranscriptLink(link, quarterLabel);
      if (score >= 8) candidates.push({ url: link, score });
    }
  }

  if (candidates.length === 0) return { url: null, text: null };
  candidates.sort((a, b) => b.score - a.score);
  const bestUrl = candidates[0].url;
  if (bestUrl.toLowerCase().endsWith('.pdf')) {
    return { url: bestUrl, text: null };
  }
  const text = await fetchTextSoft(bestUrl);
  return { url: bestUrl, text };
}

function parseQuarterFromUrl(url: string | null) {
  if (!url) return null;
  const lower = url.toLowerCase();
  const match = lower.match(/q([1-4])(?:fy)?(\d{2,4})?/);
  if (!match) return null;
  const quarter = match[1];
  const yearRaw = match[2];
  if (!yearRaw) return `Q${quarter}`;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `Q${quarter} FY${year}`;
}

function parseQuarterFromText(text: string | null) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const quarterMap: Record<string, string> = {
    first: 'Q1',
    second: 'Q2',
    third: 'Q3',
    fourth: 'Q4',
  };

  type Match = { quarter: string; year: string | null; score: number; index: number };
  const matches: Match[] = [];

  const addMatch = (quarter: string, yearRaw: string | null, score: number, index: number) => {
    const year = yearRaw ? (yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : null;
    matches.push({ quarter, year, score, index });
  };

  const patterns: Array<[RegExp, (m: RegExpMatchArray) => { q: string; y: string | null }, number]> = [
    [/fiscal\s+([0-9]{2,4})\s+(first|second|third|fourth)\s+quarter/g,
      (m) => ({ q: quarterMap[m[2]], y: m[1] }), 7],
    [/fiscal\s+([0-9]{2,4})\s+q([1-4])\b/g,
      (m) => ({ q: `Q${m[2]}`, y: m[1] }), 7],
    [/(first|second|third|fourth)\s+quarter[^.]{0,80}?(?:fiscal\s+year|fy)\s*([0-9]{2,4})/g,
      (m) => ({ q: quarterMap[m[1]], y: m[2] }), 6],
    [/(?:fiscal\s+year|fy)\s*([0-9]{2,4})[^.]{0,80}?(first|second|third|fourth)\s+quarter/g,
      (m) => ({ q: quarterMap[m[2]], y: m[1] }), 6],
    [/\bq([1-4])\b[^.]{0,80}?(?:fiscal\s+year|fy)\s*([0-9]{2,4})/g,
      (m) => ({ q: `Q${m[1]}`, y: m[2] }), 5],
    [/(?:fiscal\s+year|fy)\s*([0-9]{2,4})[^.]{0,80}?\bq([1-4])\b/g,
      (m) => ({ q: `Q${m[2]}`, y: m[1] }), 5],
  ];

  patterns.forEach(([regex, pick, baseScore]) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lower)) !== null) {
      const picked = pick(match);
      const nearby = lower.slice(Math.max(0, match.index - 40), match.index + 120);
      let score = baseScore;
      if (nearby.includes('results') || nearby.includes('earnings') || nearby.includes('press release')) {
        score += 2;
      }
      addMatch(picked.q, picked.y, score, match.index);
    }
  });

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score || a.index - b.index);
    const best = matches[0];
    if (best.year) return `${best.quarter} FY${best.year}`;
    return best.quarter;
  }

  const simpleQuarter = lower.match(/\b(q[1-4])\b/);
  if (simpleQuarter) return simpleQuarter[1].toUpperCase();
  const wordQuarter = lower.match(/\b(first|second|third|fourth)\s+quarter\b/);
  if (wordQuarter) return quarterMap[wordQuarter[1]];
  return null;
}

function parseFiscalYearFromText(text: string | null) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const match = lower.match(/\bfiscal\s+(?:year|fy)?\s*([0-9]{2,4})\b/);
  if (!match) return null;
  const raw = match[1];
  return raw.length === 2 ? `20${raw}` : raw;
}

function isFilingDateStale(filingDate: string | null, maxAgeDays = 540) {
  if (!filingDate) return false;
  const parsed = new Date(`${filingDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = Date.now() - parsed.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

function pickTranscriptOverride(ticker: string, filingDate: string | null) {
  const options = TRANSCRIPT_OVERRIDES[ticker] ?? [];
  for (const option of options) {
    if (option.minFilingDate && filingDate && filingDate < option.minFilingDate) continue;
    if (option.maxFilingDate && filingDate && filingDate > option.maxFilingDate) continue;
    return option.url;
  }
  return null;
}

export async function getLatestPressRelease(ticker: string): Promise<PressReleaseResult> {
  const tickerMap = await getTickerMap();
  const entry = tickerMap.get(ticker);
  if (!entry) {
    return {
      ticker,
      companyName: null,
      quarterLabel: null,
      pressReleaseFilingDate: null,
      pressReleaseUrl: null,
      pressReleaseIsPrevious: false,
      pressReleaseText: null,
      transcriptUrl: null,
      transcriptText: null,
      transcriptSource: null,
      accessionNumber: null,
    };
  }

  const { cik, name: companyName } = entry;
  const submissions = await fetchJson(`${SEC_BASE}/submissions/CIK${cik}.json`);
  const earnings8ks = findEarnings8Ks(submissions);
  const latest8k = earnings8ks[0] ?? findLatest8K(submissions);
  if (!latest8k) {
    return {
      ticker,
      companyName,
      quarterLabel: null,
      pressReleaseFilingDate: null,
      pressReleaseUrl: null,
      pressReleaseIsPrevious: false,
      pressReleaseText: null,
      transcriptUrl: null,
      transcriptText: null,
      transcriptSource: null,
      accessionNumber: null,
    };
  }

  let pressReleaseUrl: string | null = null;
  let pressReleaseText: string | null = null;
  let pressReleaseFilingDate: string | null = null;
  let pressReleaseIsPrevious = false;
  let accessionNumber: string | null = null;
  let transcriptUrl: string | null = null;
  let transcriptText: string | null = null;
  let transcriptSource: 'ir' | 'sec' | 'web' | null = null;

  const searchList = earnings8ks.length > 0 ? earnings8ks : [latest8k];
  for (let i = 0; i < searchList.length; i += 1) {
    const filing = searchList[i];
    const pressRelease = await findPressRelease(cik, filing);
    if (pressRelease.url) {
      pressReleaseUrl = pressRelease.url;
      pressReleaseText = pressRelease.text
        ? cleanDocumentText(stripHtml(pressRelease.text))
        : null;
      pressReleaseFilingDate = filing.filingDate ?? null;
      pressReleaseIsPrevious = i > 0;
      accessionNumber = filing.accessionNumber ?? null;
      const transcript = await findTranscript(cik, filing);
      const secTranscriptText = transcript.text
        ? cleanDocumentText(stripHtml(transcript.text))
        : null;
      const interimQuarter =
        parseQuarterFromText(pressReleaseText) ?? parseQuarterFromUrl(pressReleaseUrl);
      const interimFiscalYear = parseFiscalYearFromText(pressReleaseText);
      const interimNormalizedQuarter =
        interimQuarter && /^Q[1-4]$/.test(interimQuarter) && interimFiscalYear
          ? `${interimQuarter} FY${interimFiscalYear}`
          : interimQuarter;
      const irTranscript = await findIrTranscript(ticker, interimNormalizedQuarter, filing.filingDate ?? null);
      const webTranscript =
        irTranscript.url || transcript.url
          ? { url: null, text: null }
          : await findWebTranscript(ticker, interimNormalizedQuarter, companyName);
      transcriptUrl = irTranscript.url ?? transcript.url ?? webTranscript.url;
      transcriptText = irTranscript.text
        ? cleanDocumentText(stripHtml(irTranscript.text))
        : webTranscript.text
          ? cleanDocumentText(stripHtml(webTranscript.text))
          : secTranscriptText;
      transcriptSource = irTranscript.url
        ? 'ir'
        : transcript.url
          ? 'sec'
          : webTranscript.url
            ? 'web'
            : null;
      break;
    }
  }

  const quarterLabel =
    parseQuarterFromText(pressReleaseText) ?? parseQuarterFromUrl(pressReleaseUrl);
  const fiscalYear = parseFiscalYearFromText(pressReleaseText);
  const normalizedQuarter =
    quarterLabel && /^Q[1-4]$/.test(quarterLabel) && fiscalYear
      ? `${quarterLabel} FY${fiscalYear}`
      : quarterLabel;

  if (!transcriptUrl) {
    const overrideUrl = pickTranscriptOverride(ticker, pressReleaseFilingDate);
    if (overrideUrl) {
      transcriptUrl = overrideUrl;
      transcriptSource = 'web';
    }
  }

  if (pressReleaseUrl && isFilingDateStale(pressReleaseFilingDate)) {
    return {
      ticker,
      companyName,
      quarterLabel: null,
      pressReleaseFilingDate,
      pressReleaseUrl: null,
      pressReleaseIsPrevious: true,
      pressReleaseText: null,
      transcriptUrl: null,
      transcriptText: null,
      transcriptSource: null,
      accessionNumber: accessionNumber ?? null,
    };
  }

  return {
    ticker,
    companyName,
    quarterLabel: normalizedQuarter,
    pressReleaseFilingDate,
    pressReleaseUrl,
    pressReleaseIsPrevious,
    pressReleaseText,
    transcriptUrl,
    transcriptText,
    transcriptSource,
    accessionNumber,
  };
}

export function getIrSite(ticker: string) {
  return IR_SITES[ticker] ?? null;
}
