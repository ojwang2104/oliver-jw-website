import { describe, expect, it } from 'vitest';
import { shouldExcludeAutomatedTicker, type TickerProfile } from '../lib/automatedTickerFilter';

function profile(partial: Partial<TickerProfile>): TickerProfile {
  return {
    marketCap: null,
    sector: null,
    industry: null,
    ...partial,
  };
}

describe('automated ticker filter policy', () => {
  it('always includes manually allowed tickers', () => {
    const excluded = shouldExcludeAutomatedTicker(
      'CEG',
      profile({ sector: 'Biotechnology', industry: 'Drug Manufacturers - Specialty' }),
      20_000_000_000,
    );
    expect(excluded).toBe(false);
  });

  it('excludes pharma companies at or below $100B', () => {
    const pharma = profile({ sector: 'Healthcare', industry: 'Drug Manufacturers - General' });
    expect(shouldExcludeAutomatedTicker('MRK', pharma, 100_000_000_000)).toBe(true);
    expect(shouldExcludeAutomatedTicker('MRK', pharma, 95_000_000_000)).toBe(true);
  });

  it('includes pharma companies above $100B', () => {
    const pharma = profile({ sector: 'Biotechnology', industry: 'Biotechnology' });
    expect(shouldExcludeAutomatedTicker('ABBV', pharma, 120_000_000_000)).toBe(false);
  });

  it('still excludes non-pharma blocked sectors', () => {
    const utility = profile({ sector: 'Utilities', industry: 'Regulated Electric' });
    expect(shouldExcludeAutomatedTicker('ED', utility, 120_000_000_000)).toBe(true);
  });
});
