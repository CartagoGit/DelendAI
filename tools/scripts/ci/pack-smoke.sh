#!/usr/bin/env bash
# pack-smoke.sh — x00268 (Track G, audit §32).
#
# Wraps the pack-smoke command so a failure preserves the full
# output via GitHub-Actions collapsible groups (`::group::` /
# `::endgroup::`) and exits with the inner command's exit code.
#
# The audit's flagged bug was the old shape:
#
#   set -euo pipefail
#   output="$(some_failing_command 2>&1)"   # ← aborts before the echo
#   echo "$output"
#
# When `some_failing_command` failed, `set -e` triggered before
# the diagnostic `echo` ran, so the only evidence in the log was
# the generic set-e error — the actual failure context was lost.
#
# The fix is the canonical "capture + always-print" pattern:
#
#   1. Disable errexit while running the inner command.
#   2. Redirect output to a temp file (created with `mktemp`,
#      cleaned via `trap`) so it survives even on failure.
#   3. Re-enable errexit, then ALWAYS print the captured output
#      inside a `::group::` block. The group is collapsible in
#      GitHub Actions, so a successful run doesn't pollute the
#      log but a failed run's evidence is one click away.
#   4. If the inner command failed, emit `::error::` so the step
#      marker is visible AND exit with the original code.
#
# Usage:
#
#   tools/scripts/ci/pack-smoke.sh                   # default pack-smoke
#   tools/scripts/ci/pack-smoke.sh --command <cmd>   # custom command
#
# The `--command` form is the test seam: the spec can pass a
# failing or succeeding command and assert the wrapper preserves
# the output verbatim.

set -eu

OUTPUT_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE"' EXIT

# Default: the full tarball-install e2e (slow but the only check
# that proves the published artefacts resolve each other under
# plain node module resolution — see
# tools/scripts/smoke/pack.script.ts for the inner details).
CMD=(bun tools/scripts/smoke/pack.script.ts)
if [ "${1:-}" = "--command" ]; then
	shift
	if [ "$#" -eq 0 ]; then
		echo "pack-smoke.sh: --command requires at least one argument" >&2
		exit 2
	fi
	CMD=("$@")
fi

# Capture output even when the inner command fails. errexit is
# re-enabled before the diagnostic block so a typo in the
# post-mortem path itself would still abort loudly.
set +e
"${CMD[@]}" >"$OUTPUT_FILE" 2>&1
RC=$?
set -e

echo "::group::pack-smoke output (exit=$RC)"
cat "$OUTPUT_FILE"
echo "::endgroup::"

if [ "$RC" -ne 0 ]; then
	echo "::error::pack-smoke failed with exit $RC"
	exit "$RC"
fi
