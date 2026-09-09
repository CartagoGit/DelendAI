/**
 * generations-repo.ts — checkpoints of a work unit.
 *
 * A generation is one WIP checkpoint: the base integration SHA it was
 * built on, the ref and commit it was written to, the exact file scope
 * it touched, who wrote it and where, and — once it becomes a merge
 * candidate — the PR, the CI verdict and the SHA it integrated as.
 *
 * WHY `record()` is an upsert on `(work_unit_id, generation)`: that
 * pair IS the spec's `(repository, proposal, slice, generation)`
 * identity, because a work unit is unique on the first three. A
 * machine rebuilding from `wip/*` refs re-observes the same
 * checkpoints; re-observation must converge, not accumulate. The
 * conflict clause deliberately refreshes only the fields the forge can
 * re-derive, and never resets `integrated_sha` back to NULL — a fact
 * that has been observed once is not un-observed by a later poll that
 * happened to be less informed.
 *
 * WHY the durability/merge-candidate split matters here: a durability
 * checkpoint exists so work survives a crash and may be red. Only a
 * merge candidate may carry an integrated SHA, and the schema (0016)
 * enforces that with a CHECK rather than trusting this file.
 */
import type { Database } from 'bun:sqlite';

import { canonicalFileScope, fileScopeDigest } from './ids';

export type TCheckpointKind = 'durability' | 'merge-candidate';

export type TCandidateState =
	| 'draft'
	| 'proposed'
	| 'integrating'
	| 'integrated'
	| 'superseded'
	| 'abandoned';

export type TValidationState =
	| 'unknown'
	| 'pending'
	| 'green'
	| 'red'
	| 'skipped';

export type TCiResult =
	| 'pending'
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'timed_out'
	| 'neutral';

export interface IGenerationRecord {
	readonly id: number;
	readonly workUnitId: number;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	readonly fileScopeDigest: string;
	readonly checkpointKind: TCheckpointKind;
	readonly candidateState: TCandidateState;
	readonly validationState: TValidationState;
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly pullRequestId: number | null;
	readonly ciResult: TCiResult | null;
	readonly integratedSha: string | null;
	readonly revision: number;
}

export interface IRecordGenerationArgs {
	readonly workUnitId: number;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	readonly checkpointKind: TCheckpointKind;
	readonly candidateState?: TCandidateState | undefined;
	readonly validationState?: TValidationState | undefined;
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly now?: number | undefined;
}

interface IGenerationRow {
	readonly id: number;
	readonly work_unit_id: number;
	readonly generation: number;
	readonly base_integration_sha: string;
	readonly wip_ref: string;
	readonly wip_head_sha: string;
	readonly patch_digest: string;
	readonly file_scope_json: string;
	readonly file_scope_digest: string;
	readonly checkpoint_kind: TCheckpointKind;
	readonly candidate_state: TCandidateState;
	readonly validation_state: TValidationState;
	readonly author_agent_id: string;
	readonly machine_id: string;
	readonly pull_request_id: number | null;
	readonly ci_result: TCiResult | null;
	readonly integrated_sha: string | null;
	readonly revision: number;
}

const GENERATION_COLUMNS = `id, work_unit_id, generation, base_integration_sha,
	wip_ref, wip_head_sha, patch_digest, file_scope_json, file_scope_digest,
	checkpoint_kind, candidate_state, validation_state, author_agent_id,
	machine_id, pull_request_id, ci_result, integrated_sha, revision`;

const parseScope = (json: string): readonly string[] => {
	const parsed: unknown = JSON.parse(json);
	return Array.isArray(parsed) ? (parsed as readonly string[]) : [];
};

const mapRow = (row: IGenerationRow): IGenerationRecord => ({
	id: row.id,
	workUnitId: row.work_unit_id,
	generation: row.generation,
	baseIntegrationSha: row.base_integration_sha,
	wipRef: row.wip_ref,
	wipHeadSha: row.wip_head_sha,
	patchDigest: row.patch_digest,
	fileScope: parseScope(row.file_scope_json),
	fileScopeDigest: row.file_scope_digest,
	checkpointKind: row.checkpoint_kind,
	candidateState: row.candidate_state,
	validationState: row.validation_state,
	authorAgentId: row.author_agent_id,
	machineId: row.machine_id,
	pullRequestId: row.pull_request_id,
	ciResult: row.ci_result,
	integratedSha: row.integrated_sha,
	revision: row.revision,
});

export class GenerationsRepo {
	constructor(private readonly db: Database) {}

	get(workUnitId: number, generation: number): IGenerationRecord | null {
		const row = this.db
			.query<IGenerationRow, [number, number]>(
				`SELECT ${GENERATION_COLUMNS} FROM generations
				 WHERE work_unit_id = ? AND generation = ?`,
			)
			.get(workUnitId, generation);
		return row ? mapRow(row) : null;
	}

	listForWorkUnit(workUnitId: number): readonly IGenerationRecord[] {
		return this.db
			.query<IGenerationRow, [number]>(
				`SELECT ${GENERATION_COLUMNS} FROM generations
				 WHERE work_unit_id = ? ORDER BY generation ASC`,
			)
			.all(workUnitId)
			.map(mapRow);
	}

	/** Idempotent on `(work_unit_id, generation)`. */
	record(args: IRecordGenerationArgs): IGenerationRecord {
		const now = args.now ?? Date.now();
		const scope = canonicalFileScope(args.fileScope);
		this.db
			.prepare(
				`INSERT INTO generations (
					work_unit_id, generation, base_integration_sha, wip_ref,
					wip_head_sha, patch_digest, file_scope_json,
					file_scope_digest, checkpoint_kind, candidate_state,
					validation_state, author_agent_id, machine_id, revision,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
				ON CONFLICT (work_unit_id, generation) DO UPDATE SET
					wip_head_sha = excluded.wip_head_sha,
					patch_digest = excluded.patch_digest,
					file_scope_json = excluded.file_scope_json,
					file_scope_digest = excluded.file_scope_digest,
					checkpoint_kind = excluded.checkpoint_kind,
					updated_at = excluded.updated_at`,
			)
			.run(
				args.workUnitId,
				args.generation,
				args.baseIntegrationSha,
				args.wipRef,
				args.wipHeadSha,
				args.patchDigest,
				JSON.stringify(scope),
				fileScopeDigest(scope),
				args.checkpointKind,
				args.candidateState ?? 'draft',
				args.validationState ?? 'unknown',
				args.authorAgentId,
				args.machineId,
				now,
				now,
			);
		const row = this.get(args.workUnitId, args.generation);
		if (!row) throw new Error('generations upsert did not persist');
		return row;
	}

	/** Links a merge candidate to the PR that carries it. */
	attachPullRequest(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly pullRequestId: number;
		readonly now: number;
	}): IGenerationRecord | null {
		this.db
			.prepare(
				`UPDATE generations
				 SET pull_request_id = ?, candidate_state = 'proposed',
					 revision = revision + 1, updated_at = ?
				 WHERE work_unit_id = ? AND generation = ?
				   AND checkpoint_kind = 'merge-candidate'`,
			)
			.run(
				args.pullRequestId,
				args.now,
				args.workUnitId,
				args.generation,
			);
		return this.get(args.workUnitId, args.generation);
	}

	/** Records the validation / CI verdict for a candidate. */
	recordValidation(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly validationState: TValidationState;
		readonly ciResult?: TCiResult | undefined;
		readonly now: number;
	}): IGenerationRecord | null {
		this.db
			.prepare(
				`UPDATE generations
				 SET validation_state = ?, ci_result = ?,
					 revision = revision + 1, updated_at = ?
				 WHERE work_unit_id = ? AND generation = ?`,
			)
			.run(
				args.validationState,
				args.ciResult ?? null,
				args.now,
				args.workUnitId,
				args.generation,
			);
		return this.get(args.workUnitId, args.generation);
	}

	/**
	 * Single-winner integration, same shape as `WorkUnitsRepo.close`:
	 * the precondition `integrated_sha IS NULL` lives in the WHERE
	 * clause, so two observers of the same merge cannot both claim to
	 * have been the one that recorded it.
	 */
	markIntegrated(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly integratedSha: string;
		readonly now: number;
	}): { readonly first: boolean; readonly generation: IGenerationRecord } {
		const changes = this.db
			.prepare(
				`UPDATE generations
				 SET integrated_sha = ?, candidate_state = 'integrated',
					 revision = revision + 1, updated_at = ?
				 WHERE work_unit_id = ? AND generation = ?
				   AND integrated_sha IS NULL`,
			)
			.run(
				args.integratedSha,
				args.now,
				args.workUnitId,
				args.generation,
			).changes;
		const row = this.get(args.workUnitId, args.generation);
		if (!row) throw new Error('generation not found for integration');
		return { first: changes === 1, generation: row };
	}
}
