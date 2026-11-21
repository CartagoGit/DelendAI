/** Where the leases live, under the git common directory every worktree shares. */
export const UNIT_LEASE_DIRECTORY = 'delendai/unit-leases';

/**
 * Minutes a unit may stay silent before it stops being live, when the
 * policy states none (`coordination.leaseTtlMinutes` of 0 means "never
 * expires" for a claim, which would make every unit live forever).
 */
export const DEFAULT_UNIT_LEASE_TTL_MINUTES = 30;

/**
 * How many lease windows of silence separate an idle unit, whose owner is
 * probably between steps, from an abandoned one, whose owner is gone. One
 * window is the policy's; the factor keeps a single knob.
 */
export const ABANDONED_AFTER_LEASE_WINDOWS = 8;

export const SECONDS_PER_MINUTE = 60;

export const MILLISECONDS_PER_SECOND = 1000;

/**
 * How long a work ref's tip may stay uncommitted before its unit counts
 * as abandoned when judged from the ref alone, where no lease is
 * readable (a forge ref, another machine's unit).
 */
export const ABANDONED_UNIT_SILENCE_SECONDS =
	DEFAULT_UNIT_LEASE_TTL_MINUTES *
	ABANDONED_AFTER_LEASE_WINDOWS *
	SECONDS_PER_MINUTE;

/** Paths a command regenerates from the committed sources. */
export const REGENERABLE_PATH_PATTERNS: readonly RegExp[] = [
	/(^|\/)node_modules\//u,
	/\.generated\./u,
	/(^|\/)generated\//u,
	/(^|\/)bun\.lockb?$/u,
	/\.tsbuildinfo$/u,
	/(^|\/)\.cache\//u,
	/(^|\/)(dist|build)\//u,
];
