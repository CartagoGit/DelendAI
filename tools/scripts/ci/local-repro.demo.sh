#!/usr/bin/env bash
# local-repro.demo.sh — v00126 demo runner.
#
# Demonstrates the local-repro script against a real recent
# failed run. Pick a run-id from the GitHub UI (or via
# `gh run list --status failure --limit 1`) and pass it to
# this script; the script invokes local-repro with the right
# --repo / --output and prints the result.
#
# Usage:
#   tools/scripts/ci/local-repro.demo.sh <run-id>
#
# The script does NOT shell out to `gh` for the run lookup
# itself (it would add a dependency that the spec can avoid).
# Instead it expects the operator to have already picked the
# run id from the UI; passing it explicitly keeps the demo
# hermetic.

set -eu

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <run-id>" >&2
  exit 2
fi

RUN_ID="$1"

REPO="${LOCAL_REPRO_REPO:-CartagoGit/mcp-vertex}"
OUTPUT_DIR="${LOCAL_REPRO_OUTPUT:-build/ci}"
STEP_FILTER="${LOCAL_REPRO_STEP:-}"

ARGS=(
  --run-id "$RUN_ID"
  --repo "$REPO"
  --output "$OUTPUT_DIR"
)
if [ -n "$STEP_FILTER" ]; then
  ARGS+=(--step "$STEP_FILTER")
fi

bun tools/scripts/ci/local-repro.script.ts "${ARGS[@]}"
