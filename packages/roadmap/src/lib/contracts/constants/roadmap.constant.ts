/** Version of the roadmap document shape this package reads and writes. */
export const ROADMAP_SCHEMA_VERSION = 1;

/**
 * What an entry changes for a consumer. The release bump is derived from
 * these by the changelog plugin's `inferBump`; this package never maps a
 * kind to a version number itself.
 */
export const ROADMAP_ENTRY_KINDS = [
	'breaking',
	'feature',
	'fix',
	'chore',
] as const;

/**
 * Where an entry stands. `delivered`, `deferred`, `dropped` and
 * `superseded` are all valid endings: a roadmap that can only move
 * forward is not telling the truth.
 */
export const ROADMAP_ENTRY_STATES = [
	'proposed',
	'committed',
	'in-progress',
	'delivered',
	'deferred',
	'dropped',
	'superseded',
] as const;

/** Endings an entry never leaves. */
export const ROADMAP_TERMINAL_STATES = [
	'delivered',
	'dropped',
	'superseded',
] as const;

/** States that no longer count as part of what a horizon promises. */
export const ROADMAP_WITHDRAWN_STATES = [
	'deferred',
	'dropped',
	'superseded',
] as const;

/**
 * The legal moves between states. An entry that is not listed as a key
 * has no way out. `deferred` is the only non-final ending: a deferred
 * entry can be taken up again.
 */
export const ROADMAP_ENTRY_TRANSITIONS: Readonly<
	Record<(typeof ROADMAP_ENTRY_STATES)[number], readonly string[]>
> = {
	proposed: ['committed', 'deferred', 'dropped', 'superseded'],
	committed: ['in-progress', 'deferred', 'dropped', 'superseded'],
	'in-progress': [
		'delivered',
		'committed',
		'deferred',
		'dropped',
		'superseded',
	],
	delivered: [],
	deferred: ['proposed', 'committed', 'dropped', 'superseded'],
	dropped: [],
	superseded: [],
};

/**
 * The closed set of conditions a gate can declare. The first version only
 * declares them: nothing here runs a check, so an unverified gate reports
 * `unknown`.
 */
export const ROADMAP_GATE_KINDS = [
	'proposal-done',
	'path-exists',
	'check-green',
	'attestation',
] as const;

/** What the release bump of a horizon is declared to be. */
export const ROADMAP_BUMP_HINTS = ['major', 'minor', 'patch', 'none'] as const;

/** How sure an estimate is, from a guess to something measured. */
export const ROADMAP_ESTIMATE_CONFIDENCES = ['low', 'medium', 'high'] as const;

/** The only shape a calendar date takes in the roadmap file. */
export const ROADMAP_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
