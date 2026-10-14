/**
 * Contract shapes for `./forge-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `forge-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `forge-repo.ts`, so no import site changes.
 */

export type IPullRequestState = 'draft' | 'open' | 'closed' | 'merged';

export type ICiRunState =
	| 'queued'
	| 'in_progress'
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'timed_out'
	| 'neutral';

export interface IPullRequestRecord {
	readonly id: number;
	readonly repositoryId: number;
	readonly number: number;
	readonly headRef: string;
	readonly baseRef: string;
	readonly headSha: string;
	readonly state: IPullRequestState;
	readonly mergeSha: string | null;
}

export interface IUpsertPullRequestArgs {
	readonly repositoryId: number;
	readonly number: number;
	readonly headRef: string;
	readonly baseRef: string;
	readonly headSha: string;
	readonly state: IPullRequestState;
	readonly mergeSha?: string | undefined;
	readonly now?: number | undefined;
}

export interface ICiRunRecord {
	readonly id: number;
	readonly repositoryId: number;
	readonly candidateSha: string;
	readonly workflow: string;
	readonly checkName: string;
	readonly externalId: string | null;
	readonly state: ICiRunState;
	readonly startedAt: number | null;
	readonly completedAt: number | null;
}

export interface IUpsertCiRunArgs {
	readonly repositoryId: number;
	readonly candidateSha: string;
	readonly workflow: string;
	readonly checkName: string;
	readonly externalId?: string | undefined;
	readonly state: ICiRunState;
	readonly startedAt?: number | undefined;
	readonly completedAt?: number | undefined;
	readonly now?: number | undefined;
}
