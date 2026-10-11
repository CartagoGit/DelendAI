/**
 * reconcile-forge.ts — phase 5: mirror what the forge says about pull
 * requests, merges and checks.
 *
 * WHY this is a mirror and never a negotiation: the forge is the
 * authority for these facts. A local row that disagrees is stale, not
 * "conflicting", so every write here is an upsert on the forge's own key
 * (`(repository, number)`, `(repository, sha, workflow, check)`) and two
 * polls of the same state produce one row. That is what stops twenty
 * boots from producing twenty pull-request rows — and, because nothing
 * here CREATES anything on the forge, twenty boots cannot produce twenty
 * pull requests either. This phase has no write path to GitHub at all.
 *
 * WHY the read is conditional: on a warm machine the ETag from the last
 * boot is sent back, the forge answers "not modified", and the phase
 * costs one request and zero rows. A cold machine has no ETag and pays
 * for the full listing — which is correct, because it has nothing.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import { ensureMergeCandidate } from '../merge-candidate';
import type { IStartupForgeSeam } from '../seams.interface';
import type { IStartupStatePorts } from '../state-ports.interface';
import type { IRebuiltRef } from './rebuild-work-units';

import type { IForgePhaseResult } from './reconcile-forge.interface';

export type { IForgePhaseResult } from './reconcile-forge.interface';

const VALIDATION_BY_CI = {
	queued: 'pending',
	in_progress: 'pending',
	success: 'green',
	failure: 'red',
	cancelled: 'red',
	timed_out: 'red',
	neutral: 'skipped',
} as const;

const CI_RESULT_BY_STATE = {
	queued: 'pending',
	in_progress: 'pending',
	success: 'success',
	failure: 'failure',
	cancelled: 'cancelled',
	timed_out: 'timed_out',
	neutral: 'neutral',
} as const;

export const runForgePhase = async (input: {
	readonly forge: IStartupForgeSeam | undefined;
	readonly ports: IStartupStatePorts;
	readonly repositoryId: number;
	readonly rebuilt: readonly IRebuiltRef[];
	readonly previousEtag: string;
	readonly machineId: string;
	readonly now: number;
}): Promise<IForgePhaseResult> => {
	if (input.forge === undefined) {
		return {
			findings: [],
			counters: {
				forgeRequests: 0,
				pullRequestsReconciled: 0,
				ciRunsReconciled: 0,
				generationsIntegrated: 0,
			},
			etag: input.previousEtag,
		};
	}

	const findings: IStartupFinding[] = [];
	let forgeRequests = 0;
	let pullRequestsReconciled = 0;
	let ciRunsReconciled = 0;
	let generationsIntegrated = 0;
	let etag = input.previousEtag;

	const byHeadSha = new Map<string, IRebuiltRef>();
	const byRefName = new Map<string, IRebuiltRef>();
	for (const item of input.rebuilt) {
		byHeadSha.set(item.sha, item);
		byRefName.set(item.ref, item);
		byRefName.set(item.ref.replace(/^refs\//u, ''), item);
	}

	forgeRequests += 1;
	const prs = await input.forge.listPullRequests({
		etag: input.previousEtag.length > 0 ? input.previousEtag : undefined,
	});
	if (prs.kind === 'unavailable') {
		findings.push(
			finding({
				code: 'forge.unavailable',
				phase: 'forge',
				kind: 'blocker',
				subject: 'pull-requests',
				message: `Pull requests could not be read: ${prs.reason}. Merge and CI state may be stale.`,
			}),
		);
	} else if (prs.kind === 'payload') {
		etag = prs.etag ?? '';
		for (const pull of prs.payload) {
			const row = input.ports.forge.upsertPullRequest({
				repositoryId: input.repositoryId,
				number: pull.number,
				headRef: pull.headRef,
				baseRef: pull.baseRef,
				headSha: pull.headSha,
				state: pull.state,
				...(pull.mergeSha === undefined
					? {}
					: { mergeSha: pull.mergeSha }),
				now: input.now,
			});
			pullRequestsReconciled += 1;
			const target =
				byHeadSha.get(pull.headSha) ?? byRefName.get(pull.headRef);
			if (target === undefined) continue;
			// A pull request IS the merge-candidate designation, and only
			// a candidate row may carry a PR or an integrated SHA.
			if (
				!ensureMergeCandidate(
					input.ports.generations,
					target,
					input.now,
				)
			) {
				continue;
			}
			input.ports.generations.attachPullRequest({
				workUnitId: target.workUnitId,
				generation: target.generation,
				pullRequestId: row.id,
				now: input.now,
			});
			if (pull.state === 'merged' && pull.mergeSha !== undefined) {
				const outcome = input.ports.generations.markIntegrated({
					workUnitId: target.workUnitId,
					generation: target.generation,
					integratedSha: pull.mergeSha,
					now: input.now,
				});
				if (outcome.first) {
					generationsIntegrated += 1;
					findings.push(
						finding({
							code: 'integration-evidence.checkpoint-integrated',
							phase: 'forge',
							kind: 'repaired',
							subject: `${target.workUnitUid}@${String(target.generation)}`,
							message: `Pull request #${String(pull.number)} merged as ${pull.mergeSha}.`,
						}),
					);
				}
			}
		}
		findings.push(
			finding({
				code: 'forge.pull-request-reconciled',
				phase: 'forge',
				kind: 'note',
				subject: 'pull-requests',
				message: `Mirrored ${String(pullRequestsReconciled)} pull request(s) from the forge.`,
			}),
		);
	}

	const shas = [...byHeadSha.keys()].sort();
	if (shas.length > 0) {
		forgeRequests += 1;
		const checks = await input.forge.listCheckRuns({ shas });
		if (checks.kind === 'unavailable') {
			findings.push(
				finding({
					code: 'forge.unavailable',
					phase: 'forge',
					kind: 'blocker',
					subject: 'check-runs',
					message: `CI results could not be read: ${checks.reason}.`,
				}),
			);
		} else if (checks.kind === 'payload') {
			for (const run of checks.payload) {
				input.ports.forge.upsertCiRun({
					repositoryId: input.repositoryId,
					candidateSha: run.candidateSha,
					workflow: run.workflow,
					checkName: run.checkName,
					...(run.externalId === undefined
						? {}
						: { externalId: run.externalId }),
					state: run.state,
					...(run.startedAt === undefined
						? {}
						: { startedAt: run.startedAt }),
					...(run.completedAt === undefined
						? {}
						: { completedAt: run.completedAt }),
					now: input.now,
				});
				ciRunsReconciled += 1;
				const target = byHeadSha.get(run.candidateSha);
				if (target === undefined) continue;
				input.ports.generations.recordValidation({
					workUnitId: target.workUnitId,
					generation: target.generation,
					validationState: VALIDATION_BY_CI[run.state],
					ciResult: CI_RESULT_BY_STATE[run.state],
					now: input.now,
				});
			}
			findings.push(
				finding({
					code: 'forge.ci-reconciled',
					phase: 'forge',
					kind: 'note',
					subject: 'check-runs',
					message: `Mirrored ${String(ciRunsReconciled)} CI run(s).`,
				}),
			);
		}
	}

	return {
		findings,
		counters: {
			forgeRequests,
			pullRequestsReconciled,
			ciRunsReconciled,
			generationsIntegrated,
		},
		etag,
	};
};
