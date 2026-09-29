/**
 * proposal-index-read-stats.interface.ts — what the proposal index read
 * path observed in this process, so the doctor can report it.
 */

/**
 * How one `readProposalIndex` call was answered.
 *
 *   - `json-pinned` — the source is pinned to `json`; SQL was not consulted.
 *   - `sql-parity` — SQL served and matched the JSON index.
 *   - `sql-divergence-reported` — pinned to `sql`: SQL served although the
 *     JSON index disagrees.
 *   - `sql-refused` — pinned to `sql`: the projection could not serve, so
 *     the read threw instead of falling back.
 *   - `fallback-unavailable` — `auto`: no usable database, JSON served.
 *   - `fallback-metadata-missing` — `auto`: the projection is unstamped,
 *     JSON served.
 *   - `fallback-divergence` — `auto`: SQL disagreed with JSON, JSON served.
 */
export type IProposalIndexReadOutcome =
	| 'json-pinned'
	| 'sql-parity'
	| 'sql-divergence-reported'
	| 'sql-refused'
	| 'fallback-unavailable'
	| 'fallback-metadata-missing'
	| 'fallback-divergence';

export interface IProposalIndexReadStats {
	/** Index reads recorded since start-up (or the last reset). */
	readonly reads: number;
	/** Reads under `auto` that served JSON instead of the SQL projection. */
	readonly fallbacks: number;
	/** Outcome of the most recent read; `null` before the first one. */
	readonly last: IProposalIndexReadOutcome | null;
	/** Ids that differed between SQL and JSON in the most recent read. */
	readonly lastDivergence: number;
}

/** Parity between the SQL projection and the JSON index, as last observed. */
export type IProposalIndexParityStatus =
	| 'parity'
	| 'divergent'
	| 'unverified'
	| 'not-compared'
	| 'not-observed';
