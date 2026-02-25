import { describe, expect, it } from 'vitest';
import {
  hasQuarterLabel,
  isLikelyEarningsPressRelease,
  replyRequestFingerprint,
} from '../lib/earningsGuards';

describe('earnings guardrails', () => {
  it('recognizes valid quarter labels', () => {
    expect(hasQuarterLabel('Q4 FY2025')).toBe(true);
    expect(hasQuarterLabel('Q2')).toBe(true);
    expect(hasQuarterLabel('Annual update')).toBe(false);
  });

  it('flags likely earnings press release text', () => {
    const text = [
      'Vertex, Inc. Reports Financial Results for the Fourth Quarter and Full Year.',
      'Revenue was $194.7 million and non-GAAP EPS was $0.54.',
      'The company provided revenue guidance for fiscal year 2026.',
    ].join(' ');
    expect(
      isLikelyEarningsPressRelease({
        quarterLabel: 'Q4 FY2025',
        pressReleaseText: text,
      }),
    ).toBe(true);
  });

  it('skips non-earnings corporate updates', () => {
    const text = [
      'Company Announces Definitive Agreement to Acquire ExampleCo.',
      'The transaction is expected to close in the second half of fiscal 2026.',
      'This release discusses integration and board approval details.',
    ].join(' ');
    expect(
      isLikelyEarningsPressRelease({
        quarterLabel: 'Q2 FY2026',
        pressReleaseText: text,
      }),
    ).toBe(false);
  });
});

describe('reply request fingerprint', () => {
  it('is stable across ticker order and spacing differences', () => {
    const a = replyRequestFingerprint({
      sender: 'Person@Email.com ',
      subject: ' test ',
      tickers: ['NVDA', 'AAPL', 'MSFT'],
      replyText: 'AAPL, MSFT, NVDA',
    });
    const b = replyRequestFingerprint({
      sender: 'person@email.com',
      subject: 'TEST',
      tickers: ['MSFT', 'AAPL', 'NVDA', 'MSFT'],
      replyText: ' AAPL,   MSFT, NVDA ',
    });
    expect(a).toBe(b);
  });
});
