import { describe, expect, it } from 'vitest';
import { scoreTranscriptLink } from '../lib/earnings';

describe('transcript link ranking', () => {
  it('prefers current-cycle transcript links over old-year links', () => {
    const freshLink =
      'https://www.fool.com/earnings/call-transcripts/2026/02/12/vertex-verx-q4-2025-earnings-call-transcript/';
    const staleLink =
      'https://www.fool.com/earnings/call-transcripts/2018/02/12/vertex-verx-q4-2017-earnings-call-transcript/';

    const freshScore = scoreTranscriptLink(freshLink, 'Q4 FY2025', '2026-02-11');
    const staleScore = scoreTranscriptLink(staleLink, 'Q4 FY2025', '2026-02-11');

    expect(freshScore).toBeGreaterThan(staleScore);
  });

  it('penalizes SEC filing links compared with actual transcript links', () => {
    const transcriptLink =
      'https://www.fool.com/earnings/call-transcripts/2026/01/31/apple-aapl-q1-2026-earnings-call-transcript/';
    const filingLink =
      'https://www.sec.gov/Archives/edgar/data/320193/000032019326000005/aapl-20251227x10q.htm';

    const transcriptScore = scoreTranscriptLink(transcriptLink, 'Q1 FY2026', '2026-01-31');
    const filingScore = scoreTranscriptLink(filingLink, 'Q1 FY2026', '2026-01-31');

    expect(transcriptScore).toBeGreaterThan(filingScore);
  });
});
