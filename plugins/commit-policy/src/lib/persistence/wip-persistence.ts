/**
 * wip-persistence.ts — the `wip-ref` arm of the engine's persistence
 * decision: checkpoint the claimed paths to a work ref, and hand the
 * result to integration ONLY when it is a merge candidate.
 *
 * WHY it is a port implementation rather than code inside `engine.ts`:
 * the engine must be able to keep the historical path bit-for-bit
 * unchanged, and the cheapest guarantee of that is that the new
 * behaviour is not in the same file. The engine gains one call and one
 * early return; everything policy-shaped lives here.
 *
 * Three promises this file keeps, each against a specific way the old
 * behaviour would have been wrong under a WIP policy:
 *
 *  1. `.git/index` is never opened and HEAD never moves. Staging goes
 *     through the core WIP engine's temporary index; this file issues no
 *     `add`, no `commit`, no `push`. The only git this file runs itself
 *     is a `rev-parse` to read the integration head.
 *  2. The claim is passed WHOLE. The engine's slice-scope resolver
 *     narrows a declared list down to what is dirty and owned, which is
 *     right for a commit and wrong for a checkpoint: a narrower claim
 *     drops paths the ref already made durable. So the CLAIMED scope is
 *     what reaches the WIP engine, `allowScopeNarrowing` is never set,
 *     and a `scope-narrowed` answer is surfaced as a refusal naming the
 *     endangered paths — never silenced.
 *  3. Durability never merges. Only a classification of `candidate`
 *     reaches the integration port, and only when the policy actually
 *     requires pull requests.
 */

import type { IGitRunner } from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { resolveWorkRef } from '@delendai/core/public';

import type {
	ICheckpointReport,
	ICommitPersistencePort,
	IIntegrationHandoffPort,
	IIntegrationHandoffReport,
	IPersistenceOutcome,
	IPersistenceRequest,
} from '../contracts/interfaces/persistence.interface';
import { classifyCheckpointIntent } from './checkpoint-intent';
import { resolvePersistenceRoute } from './persistence-route';

import type { ICreatePolicyPersistenceOptions } from './wip-persistence.interface';

export type { ICreatePolicyPersistenceOptions } from './wip-persistence.interface';

const NO_HANDOFF: IIntegrationHandoffReport = {
	attempted: false,
	status: '',
	reason: 'durability checkpoint; never handed to integration',
};

/**
 * Read the integration branch head. Deliberately NOT `HEAD`: the
 * checkpoint must be based on the branch the work will eventually merge
 * into, not on whatever the shared checkout happens to be sitting on.
 */
const readIntegrationHead = async (
	run: IGitRunner,
	branch: string,
): Promise<string | undefined> => {
	for (const revision of [`refs/heads/${branch}`, branch]) {
		const result = await run([
			'rev-parse',
			'--verify',
			'--quiet',
			revision,
		]);
		const sha = result.ok ? result.output.trim() : '';
		if (sha.length > 0) return sha;
	}
	return undefined;
};

/**
 * Build the persistence port for this workspace.
 *
 * Returns `undefined` when there is nothing to route — no policy, or a
 * policy that keeps the direct-commit path. The engine treats an absent
 * port as "behave exactly as before", so the historical path is reached
 * by construction rather than by a correctly-taken branch.
 */
export const createPolicyPersistence = (
	options: ICreatePolicyPersistenceOptions,
): ICommitPersistencePort | undefined => {
	const routeDetail = resolvePersistenceRoute(options.policy);
	if (routeDetail.kind === 'direct-commit') return undefined;
	const policy = options.policy;
	if (policy === undefined) return undefined;
	if (routeDetail.kind === 'refused') {
		return {
			route: 'refused',
			routeDetail,
			persist: async () => ({
				handled: true,
				status: 'refused',
				code: routeDetail.code,
				reason: routeDetail.reason,
				remedy: routeDetail.remedy,
			}),
		};
	}
	const wip = options.wip;
	if (wip === undefined) {
		// A policy that forbids direct integration commits and has no WIP
		// engine bound has no safe path at all. Refusing is the only
		// honest answer: falling back to the direct path would commit to
		// the very branch the policy protects.
		return {
			route: 'refused',
			routeDetail: {
				kind: 'refused',
				code: 'WIP_CHECKPOINT_FAILED',
				reason: 'WIP_CHECKPOINT_FAILED: the policy persists to WIP refs but no WIP engine is bound to this workspace (is the workspace a git working tree?).',
				remedy: 'Run the plugin inside a git working tree, or choose a profile whose persistence.allowsDirectIntegrationCommit is true.',
			},
			persist: async () => ({
				handled: true,
				status: 'refused',
				code: 'WIP_CHECKPOINT_FAILED',
				reason: 'WIP_CHECKPOINT_FAILED: no WIP engine is bound to this workspace.',
				remedy: 'Run the plugin inside a git working tree, or choose a profile whose persistence.allowsDirectIntegrationCommit is true.',
			}),
		};
	}
	const persist = async (
		request: IPersistenceRequest,
	): Promise<IPersistenceOutcome> => {
		const classification = classifyCheckpointIntent({
			triggerKind: request.triggerKind,
			hasSliceSelector:
				request.proposalId.length > 0 && request.sliceId.length > 0,
			policy,
		});
		const baseSha = await readIntegrationHead(
			options.run,
			policy.branches.integration,
		);
		if (baseSha === undefined) {
			return {
				handled: true,
				status: 'refused',
				code: 'WIP_CHECKPOINT_FAILED',
				reason: `WIP_CHECKPOINT_FAILED: integration branch \`${policy.branches.integration}\` could not be resolved, so no checkpoint base exists.`,
				remedy: `Create or fetch \`${policy.branches.integration}\`, or correct branches.integration in the development policy.`,
			};
		}
		const generation =
			options.resolveGeneration === undefined
				? 1
				: await options.resolveGeneration({
						proposalId: request.proposalId,
						sliceId: request.sliceId,
					});
		const ref = resolveWorkRef(policy.branches.workRefTemplate, {
			agent: options.agentId,
			proposal:
				request.proposalId.length > 0
					? request.proposalId
					: 'workspace',
			slice:
				request.sliceId.length > 0
					? request.sliceId
					: request.triggerKind,
			generation,
		});
		const result = await wip.createOrUpdateWipRef({
			baseSha,
			// The CLAIM, whole. See promise 2 in the file header.
			paths: request.claimedPaths,
			ref,
			message: request.message,
			...(options.author !== undefined ? { author: options.author } : {}),
		});
		if (result.status === 'scope-narrowed') {
			return {
				handled: true,
				status: 'refused',
				code: 'WIP_SCOPE_NARROWED',
				reason: `WIP_SCOPE_NARROWED: checkpointing ${ref} with this claim would drop ${result.dropped.length} already-checkpointed path(s): ${result.dropped.slice(0, 5).join(', ')}${result.dropped.length > 5 ? ', …' : ''}`,
				remedy: "Include the previously-claimed paths in the work unit scope, or release the claim explicitly through the recovery flow. commit-policy never sets allowScopeNarrowing on the agent's behalf.",
			};
		}
		if (result.status === 'failed') {
			return {
				handled: true,
				status: 'refused',
				code: 'WIP_CHECKPOINT_FAILED',
				reason: `WIP_CHECKPOINT_FAILED: ${result.reason ?? 'the WIP engine refused the checkpoint'}`,
				remedy: 'Inspect the claimed paths; nothing was written and the work ref was not moved.',
			};
		}
		const handoff = await handOff({
			classification,
			policy,
			integration: options.integration,
			request,
			ref,
			result,
			baseSha,
		});
		const report: ICheckpointReport = {
			ref,
			commit: result.commit,
			tree: result.tree,
			patchDigest: result.patchDigest,
			baseSha,
			scope: result.scope,
			classification,
			handoff,
		};
		return {
			handled: true,
			status: result.status === 'created' ? 'checkpointed' : 'unchanged',
			report,
		};
	};
	return { route: 'wip-ref', routeDetail, persist };
};

/**
 * Hand a candidate to integration — or record, in the report, exactly
 * why it was not handed over. Never silently skipped: "nothing reached
 * integration" and "integration declined" are different facts and an
 * operator has to be able to tell them apart.
 */
const handOff = async (input: {
	readonly classification: ReturnType<typeof classifyCheckpointIntent>;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly integration: IIntegrationHandoffPort | undefined;
	readonly request: IPersistenceRequest;
	readonly ref: string;
	readonly result: {
		readonly commit: string;
		readonly patchDigest: string;
		readonly scope: readonly string[];
	};
	readonly baseSha: string;
}): Promise<IIntegrationHandoffReport> => {
	if (!input.classification.eligibleForIntegration) return NO_HANDOFF;
	if (!input.policy.integration.requiresPullRequest) {
		return {
			attempted: false,
			status: '',
			reason: 'integration.requiresPullRequest is false; the candidate stays on its work ref',
		};
	}
	if (input.integration === undefined) {
		return {
			attempted: false,
			status: '',
			reason: 'no integration engine is wired into commit-policy; the candidate is checkpointed and waiting',
		};
	}
	const answer = await input.integration.submit({
		wipRef: input.ref,
		wipHeadSha: input.result.commit,
		baseIntegrationSha: input.baseSha,
		fileScope: input.result.scope,
		patchDigest: input.result.patchDigest,
		proposalId: input.request.proposalId,
		sliceId: input.request.sliceId,
		title: input.request.message.split('\n')[0] ?? input.request.message,
	});
	return { attempted: true, status: answer.status, reason: answer.reason };
};
