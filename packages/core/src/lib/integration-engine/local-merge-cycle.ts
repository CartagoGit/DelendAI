/**
 * local-merge-cycle.ts — the runner the merge model was missing.
 *
 * WHY IT EXISTS, and it is the same reason `local-merge-gate.ts` exists
 * one level down: that module computes a verdict and, measured across
 * the whole repository, NOTHING CALLED IT. `planLocalMerge` was exported
 * from the barrel and had no consumer but its own spec. So a project on
 * `shared-checkout-merge` could declare the model, checkpoint work to a
 * ref, get a correct decision from a function nobody invoked, and watch
 * the work sit there. Declarable and not runnable, one level up from the
 * bug that module was written to fix.
 *
 * WHAT THE CRITICAL SECTION IS FOR, and what it is NOT for: it
 * serialises the agents in THIS process against each other. It says
 * nothing about another machine, another clone, or a person pushing from
 * a laptop. So the section is the convenience and the compare-and-swap
 * push is the correctness: the integration head is re-read inside the
 * section, the merge is built against exactly that sha, and the push
 * asserts that sha is still the remote tip. If anything moved in
 * between, the push is refused and the answer is `stale` — retry now,
 * nothing was lost. A lock that is trusted alone is a lock that works
 * until the second machine.
 *
 * WHY THE MERGE NEVER TOUCHES THE CHECKOUT: this model exists for teams
 * whose agents share one working tree. `git merge` there moves HEAD and
 * rewrites files somebody else is editing. `IIntegrationGit.mergeCommit`
 * builds the tree with plumbing instead, so an integration is invisible
 * to the tree it happens in.
 *
 * WHY A CONFLICT IS NOT A FAILURE: `RECOVERY_CONFLICT` names paths a
 * human has to reconcile; `failed` means something below the engine
 * broke. An orchestrator retries one and escalates the other, and
 * collapsing them costs exactly the distinction it needs.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { ICriticalSection } from './critical-section.interface';
import type { IIntegrationGit } from './git-port.interface';
import { gateLocalMerge, planLocalMerge } from './local-merge-gate';
import type {
	ILocalMergeCycleInput,
	ILocalMergeCycleOutcome,
} from './local-merge-cycle.interface';

export type {
	ILocalMergeCycleInput,
	ILocalMergeCycleOutcome,
	ILocalMergeCycleStatus,
} from './local-merge-cycle.interface';

/** The message a merge commit carries, so history says who and why. */
export const mergeMessageFor = (
	workRef: string,
	integrationBranch: string,
): string =>
	`merge: land ${workRef} on ${integrationBranch}\n\nIntegrated by the local merge model: this project's forge has no review object to hold the candidate, so the local certification is what stood between the work and the branch.`;

/**
 * Attempt to land one work ref on the integration branch.
 *
 * Every side effect is injected, so the whole decision path — including
 * the two races — is drivable from a spec without a forge.
 */
export const runLocalMergeCycle = async (
	policy: IResolvedDevelopmentPolicy,
	git: IIntegrationGit,
	criticalSection: ICriticalSection,
	input: ILocalMergeCycleInput,
): Promise<ILocalMergeCycleOutcome> => {
	// Outside the section on purpose: saying "not my model" needs no lock,
	// and taking one to say it would serialise every other strategy behind
	// an engine that is about to decline.
	const declined = gateLocalMerge(policy);
	if (declined !== undefined) {
		return { status: 'declined', reason: declined.reason };
	}

	const branch = policy.branches.integration;
	return criticalSection.run(`integration:${branch}`, async () => {
		await git.fetch(
			input.remote,
			`+refs/heads/${branch}:refs/remotes/${input.remote}/${branch}`,
		);
		const integrationSha = await git.resolveRevision(
			`refs/remotes/${input.remote}/${branch}`,
		);
		const workSha = await git.resolveRevision(input.workRef);
		if (integrationSha === undefined || workSha === undefined) {
			return {
				status: 'failed',
				reason: `could not resolve ${integrationSha === undefined ? `${input.remote}/${branch}` : input.workRef}.`,
			};
		}

		const verdict = planLocalMerge(policy, {
			workRef: input.workRef,
			workSha,
			integrationSha,
			builtOnIntegrationHead: await git.isAncestor(
				integrationSha,
				workSha,
			),
			...(input.certification === undefined
				? {}
				: { certification: input.certification }),
		});
		if (verdict.decision === 'revalidate') {
			return {
				status: 'revalidating',
				reason: verdict.reason,
				integrationSha,
			};
		}
		if (verdict.decision === 'refuse') {
			return {
				status: 'blocked',
				reason: verdict.reason,
				integrationSha,
			};
		}

		const merged = await git.mergeCommit({
			base: integrationSha,
			incoming: workSha,
			message: mergeMessageFor(input.workRef, branch),
		});
		if (merged.kind === 'up-to-date') {
			return {
				status: 'merged',
				reason: `${input.workRef} is already contained in ${branch}; nothing to land.`,
				integrationSha,
				mergedSha: integrationSha,
			};
		}
		if (merged.kind === 'conflict') {
			return {
				status: 'RECOVERY_CONFLICT',
				reason: `${input.workRef} does not merge cleanly into ${branch}; a human has to reconcile it.`,
				integrationSha,
				conflicts: merged.paths,
			};
		}
		if (merged.kind === 'failed') {
			return {
				status: 'failed',
				reason: merged.reason,
				integrationSha,
			};
		}

		// The compare-and-swap. `expectedRemoteSha` is the head the merge
		// was BUILT against, not the head we hope is there — that is what
		// makes a lost race a refused push rather than a silent overwrite
		// of whatever landed first.
		const pushed = await git.pushRef({
			remote: input.remote,
			localRef: merged.sha,
			branch,
			force: false,
			expectedRemoteSha: integrationSha,
		});
		if (!pushed.ok) {
			return {
				status: 'stale',
				reason: `${branch} moved between the merge and the push (${pushed.reason}); nothing was lost, try again against the new head.`,
				integrationSha,
			};
		}

		if (policy.integration.deleteMergedWorkRef) {
			// Deliberately not fatal. The work is on the branch; a ref that
			// outlives it is untidy, and reporting the landing as failed
			// because a cleanup did not happen would send somebody looking
			// for work that is already there.
			await git.deleteRef({ ref: input.workRef, expectedSha: workSha });
		}

		return {
			status: 'merged',
			reason: `${input.workRef} landed on ${branch} at ${merged.sha.slice(0, 8)}.`,
			integrationSha,
			mergedSha: merged.sha,
		};
	});
};
