# Earnings Summarizer Runbook

This runbook is a quick operational checklist for local development, testing, and cron validation.

## 1) Open project
```bash
cd /Users/oliverwang/oliver-jw-website
```

## 2) Start local dev server
```bash
npm run dev
```
Expected: Next.js starts on `http://localhost:3000` (or another free port).

## 3) Load env vars for scripts (separate terminal)
Scripts run outside Next.js and need environment variables loaded into the shell.
```bash
cd /Users/oliverwang/oliver-jw-website
set -a; source .env.local; set +a
```

## 4) Regenerate summary fixtures
```bash
npm run generate:all-summaries
```
Expected: writes three files:
- `tests/fixtures/zm_q3_fy2026_summary.txt`
- `tests/fixtures/aapl_q1_fy2026_summary.txt`
- `tests/fixtures/nvda_q3_fy2026_summary.txt`

## 5) Run tests
```bash
npm test
```
Expected: all tests pass.

Tip: for one-shot run without watch mode:
```bash
npx vitest run
```

## 6) Save alert settings in UI
Open:
- `http://localhost:3000/earnings`

Set:
- Recipient email
- Ticker basket

Click: `Save settings`

## 7) Trigger cron locally (authorized)
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron/earnings?debug=1"
```

Expected response shape:
```json
{"sent":0,"debug":[...]}
```
or
```json
{"sent":1,"debug":[...]}
```

## 8) Interpret cron output
- `sent: 0` + `already_sent`: no new alerts (normal)
- `sent: 0` + `no_press_release`: no detected release for ticker
- `sent: 0` + `send_failed`: email configuration issue
- `sent: >0`: alerts sent successfully

## 9) Common issues and fixes

### Port lock / dev server lock
If Next.js says lock file or port in use:
```bash
lsof -i :3000
kill -9 <PID>
npm run dev
```

### Unauthorized on cron endpoint
Use the same `CRON_SECRET` from `.env.local` in the curl header.

### Missing env vars in script commands
If script says missing keys, reload env in shell:
```bash
set -a; source .env.local; set +a
```

### Upstash missing URL/token
Make sure `.env.local` contains:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 10) Core quality policy
- Summary numbers must be present in source fixture text.
- Required metric buckets must be represented when present.

Files:
- `lib/numberAccuracy.ts`
- `tests/number-accuracy.test.ts`
- `tests/zm-number-accuracy.test.ts`
- `tests/aapl-nvda-number-accuracy.test.ts`
