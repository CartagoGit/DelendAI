/** Constants for `./journal-ref.service`. */

/** The leaf under `refs/<namespace>/` where the journal is published. */
export const JOURNAL_REF_LEAF = 'journal';

/** The one file the journal ref's tree holds: one event per line. */
export const JOURNAL_FILE = 'journal.ndjson';

/** The event kinds a journal line may carry. */
export const JOURNAL_EVENT_KINDS: ReadonlySet<string> = new Set([
	'owner-changed',
	'slice-recovered',
	'slice-deprecated',
	'semantic-checkpoint',
	'recovery-decision',
	'migration-applied',
	'reconciliation-outcome',
]);
