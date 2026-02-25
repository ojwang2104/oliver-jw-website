# Audit Guide: Morning Earnings Auto-Sender

## Scope
This document covers:
- [route.ts](/Users/oliverwang/oliver-jw-website/app/api/cron/earnings/route.ts)
- [earnings.ts](/Users/oliverwang/oliver-jw-website/lib/earnings.ts)
- [automatedTickerFilter.ts](/Users/oliverwang/oliver-jw-website/lib/automatedTickerFilter.ts)
- [summaryQuality.ts](/Users/oliverwang/oliver-jw-website/lib/summaryQuality.ts)

## Data Sources
- SEC filings and archives (earnings material discovery)
- Yahoo quote API (market cap)
- Nasdaq screener API (sector/industry + market cap fallback)
- OpenAI Responses API (summary generation)
- Resend API (email delivery)
- Upstash Redis (locks and last-seen state)

## Decision Rules
1. Candidate set:
- Dynamic: `getDailyEarningsCandidates()`
- Manual: Redis key `earnings:tickers`
2. Market-cap gate:
- Dynamic tickers must be `>= $10B`
3. Exclusion policy:
- Hard excludes by ticker
- Sector/industry excludes for non-target sectors
- Pharma/biotech excluded unless market cap is `> $100B`
- Explicit allowlist may override excludes
4. Filing freshness:
- Ignore filings older than 3 days
5. Earnings relevance:
- `isLikelyEarningsPressRelease` must pass
6. Dedupe:
- `earnings:last_seen` marker
- send lock key `earnings:sent_lock:<ticker>:<marker>`

## State Keys
- `earnings:tickers`
- `earnings:recipient`
- `earnings:last_seen`
- `earnings:sent_lock:<ticker>:<marker>`

## Outbound Behavior
- One outbound email per ticker in scope per fresh marker.
- Subject format: `<TICKER> earnings <QuarterLabel>`.
- Includes press release link, transcript link if available, summary, and business commentary.

## Failure Handling
- Missing recipient -> returns skipped response.
- Failed send -> lock removed so retry can occur.
- Missing transcript text -> falls back to press release summary.

## Test Coverage
- Filter policy tests: [automated-ticker-filter.test.ts](/Users/oliverwang/oliver-jw-website/tests/automated-ticker-filter.test.ts)
- Earnings guardrails: [earnings-guards.test.ts](/Users/oliverwang/oliver-jw-website/tests/earnings-guards.test.ts)
- Revenue disclosure repair: [summary-quality.test.ts](/Users/oliverwang/oliver-jw-website/tests/summary-quality.test.ts)
