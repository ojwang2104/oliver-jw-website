# Release Checklist (GitHub Publish)

## Pre-Release
1. Confirm scope and architecture docs are current:
- [AUDIT.md](/Users/oliverwang/oliver-jw-website/docs/AUDIT.md)
- [OPERATIONS.md](/Users/oliverwang/oliver-jw-website/docs/OPERATIONS.md)
2. Confirm `.env.example` is complete and secret-free.
3. Confirm no hardcoded personal credentials/emails remain.
4. Confirm lockfile is committed.

## Verification
```bash
cd /Users/oliverwang/oliver-jw-website
npm ci
npm run lint
npx vitest run
npm run build
```

## GitHub
1. Open PR with summary of:
- policy changes
- test output
- known limitations
2. Ensure CI passes.
3. Merge and tag release (for example `v1.0.0`).
4. Include release notes with:
- commit SHA
- automation behavior
- required environment variables
