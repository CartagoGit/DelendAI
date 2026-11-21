/** land-watchdog.constant.ts — the shell the watchdog steps run. */

/** The one title every missed-event issue carries; the open issue is found by it. */
export const WATCHDOG_ISSUE_TITLE =
	'The watchdog found work no event had started';

/** Where the pass writes what it did, for the issue body. */
export const WATCHDOG_EVIDENCE_PATH = '${{ runner.temp }}/land-watchdog.md';

/** Counts the event-driven land runs queued, running or finished in the last five minutes. */
export const WATCHDOG_INFLIGHT_RUN = [
	'n=$(gh run list --workflow land.yml --repo "${GITHUB_REPOSITORY}" \\',
	'  --branch "${GITHUB_REF_NAME}" --limit 30 --json status,event,createdAt --jq \\',
	'  \'[.[] | select(.event != "schedule") | select(.status != "completed" or ((.createdAt | fromdateiso8601) > (now - 300)))] | length\') || n=0',
	'echo "count=${n:-0}" >> "${GITHUB_OUTPUT}"',
];

/** Opens or refreshes the one issue on a finding (rc 1), closes it on a clean strict pass (rc 0), and leaves a crash to the failed run. */
export const WATCHDOG_ISSUE_RUN = [
	'set -euo pipefail',
	`title="${WATCHDOG_ISSUE_TITLE}"`,
	'open="$(gh issue list --repo "${GITHUB_REPOSITORY}" --state open --search "\\"${title}\\" in:title" --json number,title --jq ".[] | select(.title == \\"${title}\\") | .number")"',
	'if [ "${RC}" = "0" ]; then',
	'  for n in ${open}; do',
	'    gh issue close "${n}" --repo "${GITHUB_REPOSITORY}" --comment "A strict scheduled pass found nothing to do (run ${RUN} at ${SHA}): no event is missing."',
	'  done',
	'  exit 0',
	'fi',
	'[ "${RC}" = "1" ] || exit 0',
	'body="The scheduled pass acted, so an event was missed. Run ${RUN} (${RUN_URL})."$\'\\n\\n\'"$(cat "${EVIDENCE}" 2>/dev/null || true)"',
	'first=""',
	'for n in ${open}; do',
	'  if [ -z "${first}" ]; then first="${n}"; else gh issue close "${n}" --repo "${GITHUB_REPOSITORY}" --comment "Duplicate of #${first}."; fi',
	'done',
	'if [ -n "${first}" ]; then',
	'  gh issue edit "${first}" --repo "${GITHUB_REPOSITORY}" --body "${body}"',
	'else',
	'  gh issue create --repo "${GITHUB_REPOSITORY}" --title "${title}" --body "${body}"',
	'fi',
];
