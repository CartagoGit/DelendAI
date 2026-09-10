/**
 * provenance.ts — the end-to-end chain, in one query path.
 *
 * WHY this file exists at all: "who changed what, on whose authority,
 * from which base, validated how, landing as which commit" must be
 * answerable without a human assembling six joins by hand. The chain
 * the work model promises is
 *
 *   proposal → slice → work unit → generation → agent → machine
 *            → file scope → base SHA → WIP SHA → PR → validation
 *            → integrated SHA
 *
 * and `readGenerationProvenance` returns exactly that, from a single
 * SELECT. It is deliberately not built out of the individual repos:
 * composing six reads would let a concurrent write slide between two
 * of them and produce a chain that never existed at any instant.
 *
 * The CI rows and the journal entries are fetched separately because
 * they are one-to-many; the chain itself — the part that must be
 * consistent — is the single row.
 */
import type { Database } from 'bun:sqlite';

import { ForgeRepo } from './forge-repo';
import { CoordinationJournalRepo } from './journal-repo';
import type {
	ICandidateState,
	ICheckpointKind,
	ICiResult,
	IValidationState,
} from './generations-repo';

import type { IGenerationProvenance } from './provenance.interface';

export type { IGenerationProvenance } from './provenance.interface';

interface IProvenanceRow {
	readonly repository_id: number;
	readonly forge: string;
	readonly owner: string;
	readonly repo_name: string;
	readonly integration_branch: string;
	readonly proposal_uid: string;
	readonly slice_uid: string;
	readonly work_unit_uid: string;
	readonly created_by_agent_id: string;
	readonly current_owner_agent_id: string | null;
	readonly generation: number;
	readonly checkpoint_kind: ICheckpointKind;
	readonly candidate_state: ICandidateState;
	readonly validation_state: IValidationState;
	readonly ci_result: ICiResult | null;
	readonly base_integration_sha: string;
	readonly wip_ref: string;
	readonly wip_head_sha: string;
	readonly patch_digest: string;
	readonly file_scope_json: string;
	readonly integrated_sha: string | null;
	readonly agent_id: string;
	readonly agent_host: string;
	readonly agent_model: string | null;
	readonly machine_id: string;
	readonly hostname: string;
	readonly pr_number: number | null;
	readonly pr_head_ref: string | null;
	readonly pr_base_ref: string | null;
	readonly pr_state: string | null;
	readonly pr_merge_sha: string | null;
}

/**
 * One SELECT, six joins: repository → work unit → generation → agent →
 * machine → pull request. `LEFT JOIN` only where the fact is genuinely
 * optional (a durability checkpoint has no PR), so a NULL in the
 * result means "not yet", never "the join was wrong".
 */
const PROVENANCE_SQL = `
SELECT
	r.id AS repository_id, r.forge, r.owner, r.name AS repo_name,
	r.integration_branch,
	w.proposal_uid, w.slice_uid, w.uid AS work_unit_uid,
	w.created_by_agent_id, w.current_owner_agent_id,
	g.generation, g.checkpoint_kind, g.candidate_state, g.validation_state,
	g.ci_result, g.base_integration_sha, g.wip_ref, g.wip_head_sha,
	g.patch_digest, g.file_scope_json, g.integrated_sha,
	a.id AS agent_id, a.host AS agent_host, a.model AS agent_model,
	m.machine_id, m.hostname,
	p.number AS pr_number, p.head_ref AS pr_head_ref,
	p.base_ref AS pr_base_ref, p.state AS pr_state,
	p.merge_sha AS pr_merge_sha
FROM generations g
JOIN work_units w ON w.id = g.work_unit_id
JOIN repositories r ON r.id = w.repository_id
JOIN agents a ON a.id = g.author_agent_id
JOIN machines m ON m.machine_id = g.machine_id
LEFT JOIN pull_requests p ON p.id = g.pull_request_id
WHERE w.uid = ? AND g.generation = ?`;

const parseScope = (json: string): readonly string[] => {
	const parsed: unknown = JSON.parse(json);
	return Array.isArray(parsed) ? (parsed as readonly string[]) : [];
};

/**
 * Reads the full chain for one `(work unit, generation)`. Returns null
 * when that checkpoint is not known to this database — which on a
 * fresh machine is the expected answer until the forge rebuild has
 * run, never an error.
 */
export const readGenerationProvenance = (
	db: Database,
	workUnitUid: string,
	generation: number,
): IGenerationProvenance | null => {
	const row = db
		.query<IProvenanceRow, [string, number]>(PROVENANCE_SQL)
		.get(workUnitUid, generation);
	if (!row) return null;

	const candidateSha = row.integrated_sha ?? row.wip_head_sha;
	return {
		repository: {
			uid: `${row.forge}:${row.owner}/${row.repo_name}`,
			integrationBranch: row.integration_branch,
		},
		proposalUid: row.proposal_uid,
		sliceUid: row.slice_uid,
		workUnitUid: row.work_unit_uid,
		generation: row.generation,
		checkpointKind: row.checkpoint_kind,
		candidateState: row.candidate_state,
		validationState: row.validation_state,
		ciResult: row.ci_result,
		agent: {
			id: row.agent_id,
			host: row.agent_host,
			model: row.agent_model,
		},
		machine: { id: row.machine_id, hostname: row.hostname },
		createdByAgentId: row.created_by_agent_id,
		currentOwnerAgentId: row.current_owner_agent_id,
		fileScope: parseScope(row.file_scope_json),
		baseIntegrationSha: row.base_integration_sha,
		wipRef: row.wip_ref,
		wipHeadSha: row.wip_head_sha,
		patchDigest: row.patch_digest,
		pullRequest:
			row.pr_number === null
				? null
				: {
						number: row.pr_number,
						headRef: row.pr_head_ref ?? '',
						baseRef: row.pr_base_ref ?? '',
						state: row.pr_state ?? '',
						mergeSha: row.pr_merge_sha,
					},
		integratedSha: row.integrated_sha,
		ciRuns: new ForgeRepo(db).listCiRunsForCandidate(
			row.repository_id,
			candidateSha,
		),
		journal: new CoordinationJournalRepo(db).listForWorkUnit(
			row.work_unit_uid,
		),
	};
};
