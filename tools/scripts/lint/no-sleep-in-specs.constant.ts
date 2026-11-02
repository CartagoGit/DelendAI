/** Constants for `no-sleep-in-specs.script.ts`. */

/**
 * The shapes of waiting on a wall clock.
 *
 * Narrow on purpose: a bare `setTimeout` that SCHEDULES something is
 * normal and often the subject of the test. What is refused is awaiting
 * a duration — a promise wrapped around a timer, or a sleep helper.
 */
export const SLEEP_PATTERNS: readonly RegExp[] = [
	/await\s+new\s+Promise\s*\([^;]{0,80}?setTimeout/u,
	/await\s+(?:sleep|delay|wait)\s*\(\s*\d/u,
	/await\s+Bun\.sleep\s*\(/u,
	/await\s+setTimeoutPromise\s*\(/u,
];

/** Written on, or just above, a sleep that genuinely tests timing. */
export const WAIVER_MARKER = 'delendai:timing-is-the-subject';

/** Specs accepted for now, so the rule bites on what arrives next. */
export const BASELINE_PATH =
	'tools/scripts/lint/no-sleep-in-specs.baseline.json';

/** This rule's own spec: it must contain what it refuses. */
export const SELF_SPEC = 'tools/scripts/lint/no-sleep-in-specs.script.spec.ts';
