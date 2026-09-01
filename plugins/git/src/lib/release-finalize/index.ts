import {
	buildReleaseReceipt,
	type IHotfixInput,
	type IReleaseReceipt,
	type IReleaseReconciliationInput,
} from '@mcp-vertex/core/public';

import type { IGitRunner } from '../services/git';

export const reconcileRelease = async (
	run: IGitRunner,
	input: IReleaseReconciliationInput,
): Promise<IReleaseReceipt> => {
	if (input.developShaNow === input.developShaAtCut)
		return buildReleaseReceipt({
			operation: 'reconcile',
			status: 'planned',
			actor: input.actor,
			releaseSlug: input.releaseSlug,
			details: { reason: 'develop unchanged' },
		});
	const sourceStillInDevelop = await run([
		'merge-base',
		'--is-ancestor',
		input.developShaAtCut,
		input.developShaNow,
	]);
	if (!sourceStillInDevelop.ok)
		throw new Error('develop history cannot be reconciled without a loop');
	const alreadyReconciled = await run([
		'merge-base',
		'--is-ancestor',
		input.releaseBranchSha,
		input.developShaNow,
	]);
	if (alreadyReconciled.ok)
		return buildReleaseReceipt({
			operation: 'reconcile',
			status: 'planned',
			actor: input.actor,
			releaseSlug: input.releaseSlug,
			before: input.developShaAtCut,
			after: input.developShaNow,
			details: { reason: 'release fixes already present; no merge loop' },
		});
	return buildReleaseReceipt({
		operation: 'reconcile',
		status: 'completed',
		actor: input.actor,
		releaseSlug: input.releaseSlug,
		source: input.developShaNow,
		target: 'develop',
		before: input.developShaAtCut,
		after: input.developShaNow,
		details: {
			preservedCommits: String(input.releaseOnlyFixes.length),
			releaseBranchSha: input.releaseBranchSha,
		},
	});
};

export const createHotfixReceipt = (input: IHotfixInput): IReleaseReceipt =>
	buildReleaseReceipt({
		operation: 'hotfix',
		status: 'planned',
		actor: input.actor,
		releaseSlug: input.slug,
		source: input.source,
		target: `release/patch/${input.slug}`,
	});

export const abortRelease = (slug: string, actor: string): IReleaseReceipt =>
	buildReleaseReceipt({
		operation: 'abort',
		status: 'aborted',
		actor,
		releaseSlug: slug,
	});

export const rollbackRelease = (
	slug: string,
	actor: string,
	before: string,
	after: string,
): IReleaseReceipt =>
	buildReleaseReceipt({
		operation: 'rollback',
		status: 'rolled-back',
		actor,
		releaseSlug: slug,
		before,
		after,
	});
