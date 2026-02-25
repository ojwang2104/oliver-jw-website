#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# High-confidence secret patterns (avoid noisy generic matches).
PATTERN='(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----)'

echo "[secret-scan] scanning tracked files..."
tracked_hits="$(
  rg -n --hidden --no-ignore-vcs -S "$PATTERN" \
    -g '!.git/**' -g '!node_modules/**' -g '!.next/**' \
    $(git ls-files) || true
)"

if [[ -n "$tracked_hits" ]]; then
  echo "[secret-scan] potential secrets found in tracked files:"
  echo "$tracked_hits"
  exit 1
fi

echo "[secret-scan] scanning commits being pushed..."
push_hits=""
while read -r local_ref local_sha remote_ref remote_sha; do
  # Deletion push has no local object to scan.
  if [[ "$local_sha" == "0000000000000000000000000000000000000000" ]]; then
    continue
  fi

  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    rev_range="$local_sha"
  else
    rev_range="$remote_sha..$local_sha"
  fi

  commit_hits="$(git grep -n -I -E "$PATTERN" $rev_range -- . ':!package-lock.json' || true)"
  if [[ -n "$commit_hits" ]]; then
    push_hits+="$commit_hits"$'\n'
  fi
done

if [[ -n "$push_hits" ]]; then
  echo "[secret-scan] potential secrets found in pushed commit range:"
  echo "$push_hits"
  exit 1
fi

echo "[secret-scan] no high-confidence secrets detected."
