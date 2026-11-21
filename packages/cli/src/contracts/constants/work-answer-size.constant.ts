/** The flag that keeps the full record in the answer. */
export const VERBOSE_FLAG = '--verbose';

/** How many trailing lines of a failure the answer keeps. */
export const FAILURE_LINES = 20;

export const LOG_DIR = ['.cache', 'delendai', 'results', 'logs'] as const;

/** The scalar fields of a publication or pull request worth one line. */
export const SUMMARY_KEYS = [
	'url',
	'number',
	'branch',
	'ref',
	'message',
] as const;
