/**
 * Contracts for the self-learning observation store (q00014 S4).
 *
 * An observation is something that ALREADY happened and was ALREADY
 * recorded somewhere else: a command that failed, a test that broke, a
 * tool the model called wrongly, a refusal the engine returned, a slice
 * that closed. This plugin does not instrument anything — it reads what
 * the runtime already writes and keeps it in one place, per project.
 */

/**
 * The closed set of things worth remembering.
 *
 * Closed on purpose. An open `kind` becomes a free-text field, and a
 * store of free text is a store nothing can reason over — the lessons
 * in S5 are frequencies and correlations across these kinds, not
 * language.
 */
export const OBSERVATION_KINDS = [
	/** A command ran and the outcome is known. */
	'command-outcome',
	/** A test failed, as the failure journal recorded it. */
	'test-failure',
	/** The model called a tool in a way the schema rejected. */
	'tool-confusion',
	/** The engine refused something, with its code. */
	'refusal',
	/** A slice closed, cleanly or not. */
	'slice-outcome',
] as const;

export type IObservationKind = (typeof OBSERVATION_KINDS)[number];

/**
 * One recorded fact.
 *
 * `subject` is what the fact is ABOUT — a command line, a spec name, a
 * tool name, a refusal code — and is what the lesson layer groups by.
 * `outcome` is deliberately three-valued: a store that only remembers
 * failures cannot say whether something usually works.
 */
export interface IObservation {
	readonly kind: IObservationKind;
	readonly subject: string;
	readonly outcome: 'ok' | 'fail' | 'unknown';
	/** Epoch milliseconds. Recency is half of what makes a lesson true. */
	readonly atMs: number;
	/** Short, already-safe context. Never a file's contents. */
	readonly detail?: string;
	/** Where the observation came from, so a reader can go and look. */
	readonly source: string;
}

/** What a write did. Reported rather than assumed: the store is bounded. */
export interface IObservationWriteResult {
	readonly appended: number;
	readonly skipped: number;
	readonly total: number;
	readonly compacted: number;
}

export interface IObservationQuery {
	readonly kind?: IObservationKind;
	readonly subject?: string;
	/** Only observations at or after this instant. */
	readonly sinceMs?: number;
	readonly limit?: number;
}

/**
 * How this plugin reads a file.
 *
 * Injected rather than imported. A `filesystem-read` plugin may not
 * call `node:fs` directly (`lint:architecture-readfile-via-safe-reader`)
 * — every read goes through the host's `SafeWorkspaceReader`, which is
 * what keeps a path option from turning into a read of somebody else's
 * directory. `null` means "not there", which is the normal state of a
 * store nobody has written yet and must never be an exception.
 */
export type IWorkspaceTextReader = (path: string) => Promise<string | null>;

export interface IObservationStoreOptions {
	/** Absolute path of the JSONL file this store owns. */
	readonly filePath: string;
	/** The only way this module reads. See {@link IWorkspaceTextReader}. */
	readonly readText: IWorkspaceTextReader;
	/**
	 * Maximum observations kept. Past it the oldest are dropped on the
	 * next write — a learning store that grows without bound stops being
	 * a cache and starts being a liability.
	 */
	readonly maxObservations?: number;
	/**
	 * Absolute workspace root, used as the PHYSICAL containment root for
	 * the store rewrite (x00544 S3). Rooting at the store file's own
	 * directory would be vacuous: realpath-ing a symlinked directory
	 * makes the escape destination its own root.
	 */
	readonly workspaceRoot?: string;
}
