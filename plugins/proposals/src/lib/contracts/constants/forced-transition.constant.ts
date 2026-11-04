/**
 * The gates a forced move skips, by the names its record gives them.
 * Peer review is not here: no flag skips the independent approval of a
 * finished slice; `peer-review-log` is only the journal check above it.
 */
export const FORCE_SKIPPABLE_GATES = [
	'state-machine',
	'slice-completeness',
	'review-entry',
	'validate-evidence',
	'ci-evidence',
	'peer-review-log',
] as const;
