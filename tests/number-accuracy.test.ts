import { describe, expect, it } from 'vitest';
import { findNumbersNotInSource, summaryNumbersSubset } from '../lib/numberAccuracy';

describe('summary numbers accuracy', () => {
  const source = [
    'Revenue was $143.8 billion, up 16% year-over-year.',
    'Diluted EPS was $2.84.',
    'Operating cash flow was $54 billion.',
    'Gross margin was $69.2 billion.',
  ].join(' ');

  it('passes when summary numbers are all present in source', () => {
    const summary = [
      'Revenue reached 143.8 billion and EPS was 2.84.',
      'Operating cash flow totaled 54 billion with gross margin 69.2 billion.',
    ].join(' ');
    expect(summaryNumbersSubset(summary, source)).toBe(true);
  });

  it('fails when summary invents numbers', () => {
    const summary = [
      'Revenue reached 143.8 billion and EPS was 2.84.',
      'Guidance was raised to 150 billion.',
    ].join(' ');
    const missing = findNumbersNotInSource(summary, source);
    expect(missing).toContain('150');
  });
});
