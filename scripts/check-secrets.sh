#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Validate that required secrets are present (non-empty) in the environment.
#
# Usage:
#   bash scripts/check-secrets.sh NAME1 NAME2 ...
#
# Each NAME must already be exported into the environment (GitHub Actions does
# this via `env:`). Exits non-zero with a clear message listing what's missing,
# so the build fails fast instead of deep inside an opaque EAS/auth error.
# ---------------------------------------------------------------------------
set -euo pipefail

missing=()

for name in "$@"; do
  # Indirect expansion: value of the variable whose name is in $name.
  value="${!name:-}"
  if [[ -z "$value" ]]; then
    missing+=("$name")
  else
    echo "  ✓ $name is set"
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo ""
  echo "::error::Missing required secret(s): ${missing[*]}"
  echo "Add them under: GitHub repo -> Settings -> Secrets and variables -> Actions."
  exit 1
fi

echo "All required secrets present."
