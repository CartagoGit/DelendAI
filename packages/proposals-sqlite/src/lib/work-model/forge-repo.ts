/**
 * forge-repo.ts — the mirror of forge-side facts (PRs and CI).
 *
 * WHY these rows carry no local opinion: everything here is
 * re-observable by asking GitHub. That is precisely what makes a fresh
 * machine able to rebuild — poll the PRs and the check runs, upsert,
 * and the local view converges. So both writers are upserts keyed on
 * the FORGE's own identity: `(repository, number)` for a pull request,
 * `(repository, candidate_sha, workflow, check_name)` for a run. Two
 * polls of the same state produce one row, and a poll that arrives out
 * of order overwrites with what the forge currently says, because the
 * forge — not this database — is the authority for these fields.
 */
import type { Database } from 'bun:sqlite';

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

interface IPullRequestRow {
	readonly id: number;
	readonly repository_id: number;
	readonly number: number;
	readonly head_ref: string;
	readonly base_ref: string;
	readonly head_sha: string;
	readonly state: IPullRequestState;
	readonly merge_sha: string | null;
}

interface ICiRunRow {
	readonly id: number;
	readonly repository_id: number;
	readonly candidate_sha: string;
	readonly workflow: string;
	readonly check_name: string;
	readonly external_id: string | null;
	readonly state: ICiRunState;
	readonly started_at: number | null;
	readonly completed_at: number | null;
}

const PR_COLUMNS = `id, repository_id, number, head_ref, base_ref, head_sha,
	state, merge_sha`;

const CI_COLUMNS = `id, repository_id, candidate_sha, workflow, check_name,
	external_id, state, started_at, completed_at`;

const mapPullRequest = (row: IPullRequestRow): IPullRequestRecord => ({
	id: row.id,
	repositoryId: row.repository_id,
	number: row.number,
	headRef: row.head_ref,
	baseRef: row.base_ref,
	headSha: row.head_sha,
	state: row.state,
	mergeSha: row.merge_sha,
});

const mapCiRun = (row: ICiRunRow): ICiRunRecord => ({
	id: row.id,
	repositoryId: row.repository_id,
	candidateSha: row.candidate_sha,
	workflow: row.workflow,
	checkName: row.check_name,
	externalId: row.external_id,
	state: row.state,
	startedAt: row.started_at,
	completedAt: row.completed_at,
});

export class ForgeRepo {
	constructor(private readonly db: Database) {}

	upsertPullRequest(args: IUpsertPullRequestArgs): IPullRequestRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`INSERT INTO pull_requests (
					repository_id, number, head_ref, base_ref, head_sha,
					state, merge_sha, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (repository_id, number) DO UPDATE SET
					head_ref = excluded.head_ref,
					base_ref = excluded.base_ref,
					head_sha = excluded.head_sha,
					state = excluded.state,
					merge_sha = COALESCE(excluded.merge_sha, pull_requests.merge_sha),
					updated_at = excluded.updated_at`,
			)
			.run(
				args.repositoryId,
				args.number,
				args.headRef,
				args.baseRef,
				args.headSha,
				args.state,
				args.mergeSha ?? null,
				now,
				now,
			);
		const row = this.findPullRequest(args.repositoryId, args.number);
		if (!row) throw new Error('pull_requests upsert did not persist');
		return row;
	}

	findPullRequest(
		repositoryId: number,
		prNumber: number,
	): IPullRequestRecord | null {
		const row = this.db
			.query<IPullRequestRow, [number, number]>(
				`SELECT ${PR_COLUMNS} FROM pull_requests
				 WHERE repository_id = ? AND number = ?`,
			)
			.get(repositoryId, prNumber);
		return row ? mapPullRequest(row) : null;
	}

	upsertCiRun(args: IUpsertCiRunArgs): ICiRunRecord {
		const now = args.now ?? Date.now();
		this.db
			.prepare(
				`INSERT INTO ci_runs (
					repository_id, candidate_sha, workflow, check_name,
					external_id, state, started_at, completed_at,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (repository_id, candidate_sha, workflow, check_name)
				DO UPDATE SET
					external_id = COALESCE(excluded.external_id, ci_runs.external_id),
					state = excluded.state,
					started_at = COALESCE(excluded.started_at, ci_runs.started_at),
					completed_at = COALESCE(excluded.completed_at, ci_runs.completed_at),
					updated_at = excluded.updated_at`,
			)
			.run(
				args.repositoryId,
				args.candidateSha,
				args.workflow,
				args.checkName,
				args.externalId ?? null,
				args.state,
				args.startedAt ?? null,
				args.completedAt ?? null,
				now,
				now,
			);
		const row = this.findCiRun(args);
		if (!row) throw new Error('ci_runs upsert did not persist');
		return row;
	}

	findCiRun(key: {
		readonly repositoryId: number;
		readonly candidateSha: string;
		readonly workflow: string;
		readonly checkName: string;
	}): ICiRunRecord | null {
		const row = this.db
			.query<ICiRunRow, [number, string, string, string]>(
				`SELECT ${CI_COLUMNS} FROM ci_runs
				 WHERE repository_id = ? AND candidate_sha = ?
				   AND workflow = ? AND check_name = ?`,
			)
			.get(
				key.repositoryId,
				key.candidateSha,
				key.workflow,
				key.checkName,
			);
		return row ? mapCiRun(row) : null;
	}

	listCiRunsForCandidate(
		repositoryId: number,
		candidateSha: string,
	): readonly ICiRunRecord[] {
		return this.db
			.query<ICiRunRow, [number, string]>(
				`SELECT ${CI_COLUMNS} FROM ci_runs
				 WHERE repository_id = ? AND candidate_sha = ?
				 ORDER BY workflow ASC, check_name ASC`,
			)
			.all(repositoryId, candidateSha)
			.map(mapCiRun);
	}
}
