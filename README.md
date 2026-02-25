# Oliver JW Website + Earnings Automation

This repository contains a personal Next.js website and an auditable earnings automation pipeline.

The automation scope for public review is the **daily morning earnings sender**:
- [route.ts](/Users/oliverwang/oliver-jw-website/app/api/cron/earnings/route.ts)

## What The Morning Automation Does
1. Finds recent earnings reporters from SEC 8-K filings.
2. Applies market-cap and sector/industry filters.
3. Excludes pharma/biotech by default unless market cap is `> $100B`.
4. Pulls press release/transcript materials.
5. Produces a structured earnings summary.
6. Sends one email per ticker via Resend.
7. Deduplicates sends with Redis.

## Architecture
- Trigger: Vercel cron -> `/api/cron/earnings`
- Discovery: SEC + Nasdaq + Yahoo
- Summarization: OpenAI Responses API
- Outbound: Resend email API
- State/locks: Upstash Redis

See:
- [AUDIT.md](/Users/oliverwang/oliver-jw-website/docs/AUDIT.md)
- [OPERATIONS.md](/Users/oliverwang/oliver-jw-website/docs/OPERATIONS.md)
- [SECURITY.md](/Users/oliverwang/oliver-jw-website/SECURITY.md)

## Local Setup
```bash
npm ci
cp .env.example .env.local
npm run dev
```

## Test
```bash
npx vitest run
```

## CI
GitHub Actions runs:
- `npm ci`
- `npm run lint`
- `npx vitest run`
- `npm run build`

## Environment Variables
Use `.env.example` as the source of truth.

## Notes
- Never commit `.env.local` or live secrets.
- Lockfile (`package-lock.json`) is committed for reproducible installs.
