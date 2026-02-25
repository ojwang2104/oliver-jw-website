# Operations Runbook: Morning Earnings Auto-Sender

## Local Commands
```bash
cd /Users/oliverwang/oliver-jw-website
npm ci
npx vitest run
npm run dev
```

## Dry-Run / Debug Endpoint
With local dev server running:
```bash
curl -H "authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/earnings?debug=1"
```

## Common Incidents

## 1) No emails sent
Checks:
1. Confirm `earnings:recipient` exists in Redis.
2. Confirm latest filings are <= 3 days old.
3. Confirm dedupe marker in `earnings:last_seen` is not already current.
4. Confirm Resend API key and sender domain are valid.

## 2) Wrong ticker included/excluded
Checks:
1. Verify profile data (sector/industry/market cap) returned from Yahoo/Nasdaq.
2. Review filter logic in [automatedTickerFilter.ts](/Users/oliverwang/oliver-jw-website/lib/automatedTickerFilter.ts).
3. Validate pharma threshold edge (`> $100B`, not `>=`).

## 3) "Revenue not disclosed" despite revenue in filing
Checks:
1. Verify source text includes revenue wording (for example operating revenues).
2. Confirm repair logic in [summaryQuality.ts](/Users/oliverwang/oliver-jw-website/lib/summaryQuality.ts) is active.
3. Re-run summary generation in debug and inspect output text.

## 4) Duplicate sends
Checks:
1. Inspect lock keys under `earnings:sent_lock:*`.
2. Inspect `earnings:last_seen`.
3. Confirm marker source: accession number preferred, then press-release URL.

## Deploy Validation Checklist
1. `npx vitest run` passes.
2. `npm run lint` passes.
3. `npm run build` passes.
4. Cron endpoint responds `200` with auth.
5. A debug run returns expected skip/send statuses.
