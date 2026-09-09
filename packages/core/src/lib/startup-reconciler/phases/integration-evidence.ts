/**
 * integration-evidence.ts — phase 7: which checkpoints are already IN the
 * integration branch, and which refs are gone because they merged.
 *
 * WHY containment is the evidence and age is not: a ref that has not been
 * touched for a week may hold the only copy of somebody's work; a ref
 * whose tip is an ancestor of the integration branch holds nothing that
 * is not already safe. The first is untouchable, the second is
 * cleanup — and the difference is a `merge-base --is-ancestor`, not a
 * timestamp. The policy says the same thing
 * (`recovery.neverDiscardUnmergedWork`), and this phase is where that
 * sentence becomes code.
 *
 * WHY a vanished ref with no evidence is a BLOCKER: the ref was deleted
 * by something, its commits are not in the integration branch, and the
 * only honest conclusion is that work may have been lost. Guessing
 * "probably merged" here would be the single most destructive assumption
 * in the whole subsystem — so it degrades the boot and generates a repair
 * task that says exactly which ref and which SHA to go looking for.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import { ensureMergeCandidate } from '../merge-candidate';
import type { IStartupGitSeam } from '../seams';
import type { IStartupStatePorts } from '../state-ports';

/** What phase 7 produced. */
export interface IIntegrationPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: { readonly generationsIntegrated: number };
}

export const runIntegrationEvidencePhase = async (input: {
	readonly ports: IStartupStatePorts;
	readonly git: IStartupGitSeam;
	readonly repositoryId: number;
	readonly integrationSha: string;
	/** Ref names git currently reports, for "deleted because merged". */
	readonly liveRefs: ReadonlySet<string>;
	readonly now: number;
}): Promise<IIntegrationPhaseResult> => {
	const findings: IStartupFinding[] = [];
	let generationsIntegrated = 0;
	if (input.integrationSha.length === 0) {
		return { findings, counters: { generationsIntegrated } };
	}

	for (const unit of input.ports.workUnits.listForRepository(
		input.repositoryId,
	)) {
		for (const generation of input.ports.generations.listForWorkUnit(
			unit.id,
		)) {
			if (generation.integratedSha !== null) continue;
			const contained = await input.git.isAncestor(
				generation.wipHeadSha,
				input.integrationSha,
			);
			const present = input.liveRefs.has(generation.wipRef);

			if (contained) {
				if (
					!ensureMergeCandidate(
						input.ports.generations,
						generation,
						input.now,
					)
				) {
					continue;
				}
				const outcome = input.ports.generations.markIntegrated({
					workUnitId: generation.workUnitId,
					generation: generation.generation,
					integratedSha: input.integrationSha,
					now: input.now,
				});
				if (!outcome.first) continue;
				generationsIntegrated += 1;
				findings.push(
					finding({
						code: present
							? 'integration-evidence.checkpoint-integrated'
							: 'integration-evidence.merged-ref-absent',
						phase: 'integration-evidence',
						kind: 'repaired',
						subject: `${unit.uid}@${String(generation.generation)}`,
						message: present
							? `Checkpoint ${generation.wipHeadSha} is contained in the integration branch; recorded as integrated.`
							: `The ref ${generation.wipRef} is gone and its checkpoint is contained in the integration branch: it was deleted because it merged.`,
					}),
				);
				continue;
			}

			if (!present) {
				findings.push(
					finding({
						code: 'integration-evidence.ref-vanished',
						phase: 'integration-evidence',
						kind: 'blocker',
						subject: generation.wipRef,
						message: `The ref ${generation.wipRef} no longer exists and its checkpoint ${generation.wipHeadSha} is NOT contained in the integration branch. Nothing was assumed and nothing was removed.`,
						detail: {
							workUnit: unit.uid,
							generation: generation.generation,
							sha: generation.wipHeadSha,
						},
					}),
				);
			}
		}
	}

	return { findings, counters: { generationsIntegrated } };
};
