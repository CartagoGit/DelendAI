/** Contracts for `../../services/projection-refresh`. */

/** What refreshing the SQLite projection did, and what to tell the operator. */
export interface IProjectionRefresh {
	readonly status: 'refreshed' | 'skipped' | 'failed';
	/** One line per fact. Empty when there is nothing worth saying. */
	readonly lines: readonly string[];
}
