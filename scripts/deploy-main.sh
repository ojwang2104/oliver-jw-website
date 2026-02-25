#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_BRANCH="${BASE_BRANCH:-main}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install and authenticate first."
  exit 1
fi

if [[ "$CURRENT_BRANCH" == "$BASE_BRANCH" ]]; then
  echo "Already on ${BASE_BRANCH}. Commit/push directly, or run from a feature branch."
  exit 1
fi

echo "Running secret scan..."
if [[ -x "./scripts/scan-secrets.sh" ]]; then
  ./scripts/scan-secrets.sh
else
  rg -n --hidden --no-ignore-vcs -S \
    "(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----)" \
    -g '!.git/**' -g '!node_modules/**' -g '!.next/**' $(git ls-files) || true
fi

echo "Pushing branch ${CURRENT_BRANCH}..."
git push -u origin "$CURRENT_BRANCH"

if gh pr view --head "$CURRENT_BRANCH" --json number >/dev/null 2>&1; then
  PR_NUMBER="$(gh pr view --head "$CURRENT_BRANCH" --json number --jq .number)"
  echo "PR #${PR_NUMBER} already exists. Merging..."
else
  TITLE="${PR_TITLE:-Deploy ${CURRENT_BRANCH} to ${BASE_BRANCH}}"
  BODY="${PR_BODY:-Automated PR created from terminal.}"
  gh pr create --base "$BASE_BRANCH" --head "$CURRENT_BRANCH" --title "$TITLE" --body "$BODY" >/dev/null
  PR_NUMBER="$(gh pr view --head "$CURRENT_BRANCH" --json number --jq .number)"
  echo "Created PR #${PR_NUMBER}."
fi

gh pr merge "$PR_NUMBER" --squash --delete-branch

echo "Merged PR #${PR_NUMBER} into ${BASE_BRANCH}."
echo "Vercel auto-deploy should start from ${BASE_BRANCH} if Git integration is configured."
