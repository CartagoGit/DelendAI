import type { IReleaseCandidateMetadata } from '../release';
import type { IReleaseReadiness } from '../release-state';

export interface IExpectedFinalReleaseState {
	readonly releaseBranchSha: string;
	readonly mainSha: string;
	readonly targetVersion: string;
}

export interface IReleaseFinalizeInput {
	readonly candidate: IReleaseCandidateMetadata;
	readonly expected: IExpectedFinalReleaseState;
	readonly readiness: IReleaseReadiness;
	readonly actor: string;
}

export interface IReleaseReceipt {
	readonly operation:
		| 'stabilize'
		| 'finalize'
		| 'reconcile'
		| 'hotfix'
		| 'abort'
		| 'rollback';
	readonly status: 'planned' | 'completed' | 'aborted' | 'rolled-back';
	readonly actor: string;
	readonly timestamp: string;
	readonly releaseSlug: string;
	readonly source?: string;
	readonly target?: string;
	readonly before?: string;
	readonly after?: string;
	readonly details?: Readonly<Record<string, string>>;
}

export interface IReleaseReconciliationInput {
	readonly releaseSlug: string;
	readonly releaseBranchSha: string;
	readonly developShaAtCut: string;
	readonly developShaNow: string;
	readonly releaseOnlyFixes: readonly string[];
	readonly actor: string;
}

export interface IHotfixInput {
	readonly slug: string;
	readonly source: 'main';
	readonly actor: string;
}

export const assertExpectedFinalReleaseState = (
	expected: IExpectedFinalReleaseState,
	actual: IExpectedFinalReleaseState,
): void => {
	if (actual.releaseBranchSha !== expected.releaseBranchSha)
		throw new Error('release branch changed since finalize preview');
	if (actual.mainSha !== expected.mainSha)
		throw new Error('main changed since finalize preview');
	if (actual.targetVersion !== expected.targetVersion)
		throw new Error('target version changed since finalize preview');
};

export const buildReleaseReceipt = (
	input: Omit<IReleaseReceipt, 'timestamp'> & { readonly timestamp?: string },
): IReleaseReceipt =>
	Object.freeze({
		...input,
		timestamp: input.timestamp ?? new Date().toISOString(),
	});
