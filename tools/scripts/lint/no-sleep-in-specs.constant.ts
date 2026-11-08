/** Constants for `no-sleep-in-specs.script.ts`. */

/**
 * The shapes of waiting on a wall clock.
 *
 * Narrow on purpose: a bare `setTimeout` that SCHEDULES something is
 * normal and often the subject of the test. What is refused is waiting
 * a duration — a promise wrapped around a timer (awaited at once or
 * kept in a helper such as `pause`/`sleep`, on one line or across
 * several), a sleep helper, or a blocking sleep. They are matched over
 * the whole text, so a wrapped timer cannot hide on a second line.
 */
export const SLEEP_PATTERNS: readonly RegExp[] = [
	/new\s+Promise(?:<[^>]*>)?\s*\(\s*(?:\([^)]*\)|\w+)\s*=>\s*(?:\{\s*)?setTimeout\b/u,
	/new\s+Promise\s*\([^;]{0,80}?setTimeout/u,
	/await\s+(?:sleep|delay|wait)\s*\(\s*\d/u,
	/\bBun\.sleep(?:Sync)?\s*\(/u,
	/await\s+setTimeoutPromise\s*\(/u,
	/\bAtomics\.wait\s*\(/u,
	/\bsleepSync\s*\(/u,
];

/**
 * What a spec goes through instead, named in the refusal so the fix is
 * one lookup away: the fake clock and its peers, or a barrier that ends
 * when the condition holds.
 */
export const DETERMINISTIC_ALTERNATIVES: readonly string[] = [
	'useFakeClock / stubAbortSignalTimeout / skipLockPauses — move the clock',
	'waitUntil — wait for the condition, not for the clock',
	'a barrier the code under test raises (a notify, a file, a printed line)',
];

/** Written on, or just above, a sleep that genuinely tests timing. */
export const WAIVER_MARKER = 'delendai:timing-is-the-subject';

/** Specs accepted for now, so the rule bites on what arrives next. */
export const BASELINE_PATH =
	'tools/scripts/lint/no-sleep-in-specs.baseline.json';

/** This rule's own spec: it must contain what it refuses. */
export const SELF_SPEC = 'tools/scripts/lint/no-sleep-in-specs.script.spec.ts';
