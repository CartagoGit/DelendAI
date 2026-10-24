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

/** How many times a rejected publication is merged and retried. */
export const JOURNAL_PUBLISH_ATTEMPTS = 3;

/** The commit that carries one published batch of the journal. */
export const JOURNAL_COMMIT_MESSAGE =
	'chore(journal): publish coordination events';

/** The identity a journal commit is written under, whatever the checkout's own. */
export const JOURNAL_COMMIT_IDENTITY: readonly string[] = [
	'-c',
	'user.name=delendai-journal',
	'-c',
	'user.email=journal@delendai.invalid',
	'-c',
	'commit.gpgsign=false',
];

/**
 * The namespace the journal ref lives under when the project has none:
 * git refuses a ref with fewer than three parts (`refs/journal`), so the
 * journal of a project with no namespace would otherwise never publish.
 */
export const JOURNAL_FALLBACK_NAMESPACE = 'delendai';

/** The file mode of the journal blob inside the ref's tree. */
export const JOURNAL_FILE_MODE = '100644';
