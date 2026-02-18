import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractNumbers, extractNumbersByKeywords, findNumbersNotInSource } from '../lib/numberAccuracy';

describe('Zoom Q3 FY2026 numbers accuracy', () => {
  it('summary numbers are all present in the press release fixture', async () => {
    const sourcePath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'zm_q3_fy2026.txt',
    );
    const summaryPath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'zm_q3_fy2026_summary.txt',
    );

    const source = await fs.readFile(sourcePath, 'utf-8');
    const summary = await fs.readFile(summaryPath, 'utf-8');

    if (summary.includes('PLACEHOLDER')) {
      throw new Error('Run: npm run generate:zm-summary to create the summary fixture.');
    }

    const missing = findNumbersNotInSource(summary, source);
    expect(missing, `Unexpected numbers: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('summary includes key metrics when present', async () => {
    const sourcePath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'zm_q3_fy2026.txt',
    );
    const summaryPath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'zm_q3_fy2026_summary.txt',
    );

    const source = await fs.readFile(sourcePath, 'utf-8');
    const summary = await fs.readFile(summaryPath, 'utf-8');

    const buckets = [
      { name: 'Revenue', keywords: ['total revenue', 'revenue'] },
      { name: 'EPS', keywords: ['eps', 'earnings per share'] },
      { name: 'Operating income/margin', keywords: ['operating income', 'income from operations', 'operating margin'] },
      { name: 'Net income', keywords: ['net income', 'net loss'] },
      { name: 'Operating cash flow', keywords: ['operating cash flow', 'cash flow from operations'] },
      { name: 'Free cash flow', keywords: ['free cash flow'] },
      { name: 'Guidance revenue', keywords: ['guidance - q4', 'guidance - full', 'revenue'] },
      { name: 'Guidance EPS', keywords: ['guidance - q4', 'guidance - full', 'eps'] },
      { name: 'GAAP vs Non-GAAP EPS', keywords: ['gaap eps', 'non-gaap eps'] },
      { name: 'Cash & marketable securities', keywords: ['cash and marketable securities', 'cash, cash equivalents'] },
    ];

    const summaryNumbers = new Set(extractNumbers(summary));

    const missingBuckets: string[] = [];

    for (const bucket of buckets) {
      const bucketNumbers = extractNumbersByKeywords(source, bucket.keywords);
      if (bucketNumbers.length === 0) continue;

      const hasAny = bucketNumbers.some((num) => summaryNumbers.has(num));
      if (!hasAny) missingBuckets.push(bucket.name);
    }

    expect(missingBuckets, `Missing metrics: ${missingBuckets.join(', ')}`).toHaveLength(0);
  });
});
