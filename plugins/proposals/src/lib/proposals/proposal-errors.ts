/**
 * proposal-errors.ts
 *
 * ProposalParseError and the closed IProposalErrorCode union used across the
 * proposals module. T2 and T3 may add more error codes; the union is extended
 * here, not in consumer modules.
 */

import type { IProposalIndexSqlFailure } from '../contracts/interfaces/proposal-index-source.interface';

export type { IProposalIndexSqlFailure } from '../contracts/interfaces/proposal-index-source.interface';

export type IProposalErrorCode =
	| 'INVALID_FRONTMATTER'
	| 'INVALID_BUDGET'
	| 'INVALID_CRITERION'
	| 'PROPOSAL_NOT_FOUND'
	| 'INVALID_PROPOSAL_ID'
	| 'INVALID_SWARM_BUDGET'
	| 'INVALID_CONTINUITY_POLICY';

/**
 * Thrown by `parseProposalDocument` and related functions when a proposal
 * file contains invalid or missing frontmatter.
 */
export class ProposalParseError extends Error {
	readonly code: IProposalErrorCode;
	readonly path: string;

	constructor(code: IProposalErrorCode, path: string, message: string) {
		super(message);
		this.name = 'ProposalParseError';
		this.code = code;
		this.path = path;
	}
}

/**
 * Thrown when the proposal index is pinned to `sql` and SQL cannot serve.
 *
 * WHY a throw and not a quiet JSON read: `sql` used to fall back to JSON
 * exactly like `auto` did, differing only in the wording of a one-time
 * warning. An operator who pinned it to prove production runs on SQL got
 * a green run that had read the legacy index, and nothing could tell the
 * two apart. Strict now means strict; the fallback lives in `auto`.
 */
export class ProposalIndexSqlUnavailableError extends Error {
	readonly failure: IProposalIndexSqlFailure;
	readonly indexPath: string;

	constructor(failure: IProposalIndexSqlFailure, indexPath: string) {
		super(
			failure === 'unstamped'
				? `proposal index is pinned to "sql", but the SQLite projection for ${indexPath} was never stamped by a reconcile, so nothing vouches for it. Run the proposals reconcile, or use "auto" to allow the JSON fallback.`
				: `proposal index is pinned to "sql", but no SQLite projection could be served for ${indexPath}. Build it with the proposals reconcile, or use "auto" to allow the JSON fallback.`,
		);
		this.name = 'ProposalIndexSqlUnavailableError';
		this.failure = failure;
		this.indexPath = indexPath;
	}
}
