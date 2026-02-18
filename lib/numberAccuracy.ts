export function extractNumbers(text: string) {
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((raw) => raw.replace(/,/g, ''))
    .map((raw) => {
      const value = Number.parseFloat(raw);
      if (Number.isNaN(value)) return null;
      return normalizeNumber(value);
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeNumber(value: number) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1000000) / 1000000;
  return rounded.toString();
}

export function extractNumbersByKeywords(source: string, keywords: string[]) {
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matches: string[] = [];
  const loweredKeywords = keywords.map((k) => k.toLowerCase());

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const hasKeyword = loweredKeywords.some((keyword) => lower.includes(keyword));
    if (!hasKeyword) continue;
    matches.push(...extractNumbers(sentence));
  }

  return Array.from(new Set(matches));
}

export function numbersAreEquivalent(aRaw: string, bRaw: string) {
  const a = Number.parseFloat(aRaw);
  const b = Number.parseFloat(bRaw);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  const aInBillionsRounded1 = Math.round((a / 1000) * 10) / 10;
  const aInMillionsRounded1 = Math.round((a * 1000) * 10) / 10;
  const ratio = a / b;
  return (
    Math.abs(a - b) < 1e-6 ||
    Math.abs(ratio - 1000) < 1e-3 ||
    Math.abs(ratio - 0.001) < 1e-6 ||
    Math.abs(aInBillionsRounded1 - b) < 0.11 ||
    Math.abs(aInMillionsRounded1 - b) < 0.11
  );
}

export function findNumbersNotInSource(summary: string, source: string) {
  const summaryNumbers = new Set(extractNumbers(summary));
  const sourceNumbers = extractNumbers(source);
  const sourceSet = new Set(sourceNumbers);
  const missing: string[] = [];
  summaryNumbers.forEach((num) => {
    if (sourceSet.has(num)) return;
    const value = Number.parseFloat(num);
    if (Number.isNaN(value)) {
      missing.push(num);
      return;
    }
    const equivalentFound = sourceNumbers.some((sourceNum) => numbersAreEquivalent(sourceNum, num));
    if (!equivalentFound) missing.push(num);
  });
  return missing;
}

export function summaryNumbersSubset(summary: string, source: string) {
  return findNumbersNotInSource(summary, source).length === 0;
}
