import { describe, expect, it } from 'vitest';
import { enforceRevenueDisclosure, extractRevenueDisclosureFragment } from '../lib/summaryQuality';

describe('summary revenue disclosure guardrail', () => {
  it('extracts operating revenues fragment', () => {
    const source =
      'Consolidated Statements of Operations Operating revenues were $6,074 million for Q4 and $25,533 million for full year 2025.';
    expect(extractRevenueDisclosureFragment(source)).toContain('Operating revenues');
  });

  it('replaces revenue not disclosed when source has operating revenues', () => {
    const source =
      'Consolidated Statements of Operations Operating revenues were $6,074 million for Q4 and $25,533 million for full year 2025.';
    const summary =
      '- Revenue not disclosed.\n- EPS: Diluted EPS was $2.44 in Q4 and $8.93 for full year 2025.';
    const repaired = enforceRevenueDisclosure(summary, source);
    expect(repaired).toContain('Revenue: Operating revenues were $6,074 million');
    expect(repaired).not.toContain('Revenue not disclosed');
  });
});
