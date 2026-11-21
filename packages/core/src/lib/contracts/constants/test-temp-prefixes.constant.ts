/**
 * test-temp-prefixes.constant.ts — the temp directory prefixes the test
 * kit used before x01091, and so left behind in the system temp folder.
 * The one list `work reap` reads.
 */
export const PRE_X01091_TEST_TEMP_PREFIXES: readonly string[] = [
	'delendai-gh-',
	'state-contract-',
	'unit-index-',
	'tok-report-',
	'state-coordination-',
	'state-sqlite-',
	'tok-',
];

/** A leftover is removed once it is older than this: one day. */
export const TEST_TEMP_LEFTOVER_AGE_SECONDS = 24 * 60 * 60;

/** How many non-empty leftovers a report names; the rest are counted. */
export const TEST_TEMP_LISTED_NON_EMPTY = 50;
