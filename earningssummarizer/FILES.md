# File Map

## UI
- `app/earnings/page.tsx`
- `components/EarningsClient.tsx`
- `app/globals.css` (earnings styles)

## APIs
- `app/api/earnings/route.ts` (press release lookup)
- `app/api/settings/route.ts` (ticker + email settings)
- `app/api/cron/earnings/route.ts` (hourly email job)

## Core logic
- `lib/earnings.ts` (SEC parsing, press release detection, quarter parsing)
- `lib/numberAccuracy.ts` (numbers-only test utilities)

## Tests + fixtures
- `tests/number-accuracy.test.ts`
- `tests/zm-number-accuracy.test.ts`
- `tests/aapl-nvda-number-accuracy.test.ts`
- `tests/fixtures/zm_q3_fy2026.txt`
- `tests/fixtures/zm_q3_fy2026_summary.txt`
- `tests/fixtures/aapl_q1_fy2026.txt`
- `tests/fixtures/aapl_q1_fy2026_summary.txt`
- `tests/fixtures/nvda_q3_fy2026.txt`
- `tests/fixtures/nvda_q3_fy2026_summary.txt`

## Scripts
- `scripts/generate_zm_summary.mjs`
- `scripts/generate_summary_fixture.mjs`

## Cron config
- `vercel.json`
