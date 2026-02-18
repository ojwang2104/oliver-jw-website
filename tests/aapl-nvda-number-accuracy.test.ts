import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractNumbers,
  extractNumbersByKeywords,
  findNumbersNotInSource,
  numbersAreEquivalent,
} from '../lib/numberAccuracy';

const buckets = [
  { name: 'Revenue', keywords: ['total revenue', 'revenue'] },
  { name: 'EPS', keywords: ['eps', 'earnings per share'] },
  { name: 'Operating income/margin', keywords: ['operating income', 'income from operations', 'operating margin'] },
  { name: 'Net income', keywords: ['net income', 'net loss'] },
  { name: 'Operating cash flow', keywords: ['operating cash flow', 'cash flow from operations'] },
  { name: 'Free cash flow', keywords: ['free cash flow'] },
  { name: 'Guidance revenue', keywords: ['outlook', 'guidance', 'revenue'] },
  { name: 'Guidance EPS', keywords: ['outlook', 'guidance', 'eps'] },
  { name: 'GAAP vs Non-GAAP EPS', keywords: ['gaap eps', 'non-gaap eps'] },
  { name: 'Cash & marketable securities', keywords: ['cash and marketable securities', 'cash, cash equivalents', 'marketable securities'] },
];

async function loadFixture(slug: string) {
  const sourcePath = path.join(process.cwd(), 'tests', 'fixtures', `${slug}.txt`);
  const summaryPath = path.join(process.cwd(), 'tests', 'fixtures', `${slug}_summary.txt`);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const summary = await fs.readFile(summaryPath, 'utf-8');
  if (summary.includes('PLACEHOLDER')) {
    throw new Error(`Run: npm run generate:${slug.startsWith('aapl') ? 'aapl' : 'nvda'}-summary to create the summary fixture.`);
  }
  return { source, summary };
}

function runSharedAssertions(slug: string, source: string, summary: string) {
  const missing = findNumbersNotInSource(summary, source);
  expect(missing, `${slug} unexpected numbers: ${missing.join(', ')}`).toHaveLength(0);

  const summaryNumbers = new Set(extractNumbers(summary));
  const missingBuckets: string[] = [];
  for (const bucket of buckets) {
    const bucketNumbers = extractNumbersByKeywords(source, bucket.keywords);
    if (bucketNumbers.length === 0) continue;
    const hasAny = bucketNumbers.some((num) => {
      if (summaryNumbers.has(num)) return true;
      return Array.from(summaryNumbers).some((summaryNum) => numbersAreEquivalent(num, summaryNum));
    });
    if (!hasAny) missingBuckets.push(bucket.name);
  }
  expect(missingBuckets, `${slug} missing metrics: ${missingBuckets.join(', ')}`).toHaveLength(0);
}

describe('AAPL and NVDA fixture number accuracy', () => {
  it('AAPL summary follows numeric integrity and coverage', async () => {
    const { source, summary } = await loadFixture('aapl_q1_fy2026');
    runSharedAssertions('AAPL', source, summary);
  });

  it('NVDA summary follows numeric integrity and coverage', async () => {
    const { source, summary } = await loadFixture('nvda_q3_fy2026');
    runSharedAssertions('NVDA', source, summary);
  });
});
