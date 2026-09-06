import { canonicalStateHash } from './hash';
import type { TDriftDirection } from './generation';

export type { TDriftDirection } from './generation';

export interface IDriftDetection {
	readonly direction: TDriftDirection;
	readonly baseSha: string;
	readonly headSha: string;
	readonly baseIsAncestor: boolean;
	readonly headIsAncestor: boolean;
	readonly baseFingerprint: string;
	readonly headFingerprint: string;
}

export interface IReconciliationPlan {
	readonly direction: TDriftDirection;
	readonly steps: readonly IReconciliationStep[];
	readonly targetFingerprint: string;
}

export type IReconciliationStep =
	| { readonly kind: 'no-op' }
	| {
			readonly kind: 'incremental-apply';
			readonly baseSha: string;
			readonly headSha: string;
	  }
	| { readonly kind: 'full-rebuild'; readonly reason: string };

/**
 * Detect drift between two state snapshots (or between a snapshot's
 * reconciled_commit_sha and HEAD).
 */
export const detectDrift = (input: {
	readonly baseSha: string;
	readonly headSha: string;
	readonly baseFingerprint: string;
	readonly headFingerprint: string;
	readonly isAncestor: (child: string, parent: string) => boolean;
}): IDriftDetection => {
	const sameSha = input.baseSha === input.headSha;
	const sameFingerprint = input.baseFingerprint === input.headFingerprint;
	const baseIsAncestor =
		sameSha || input.isAncestor(input.headSha, input.baseSha);
	const headIsAncestor =
		sameSha || input.isAncestor(input.baseSha, input.headSha);

	const direction = resolveDriftDirection({
		sameSha,
		sameFingerprint,
		baseIsAncestor,
		headIsAncestor,
	});

	return {
		direction,
		baseSha: input.baseSha,
		headSha: input.headSha,
		baseIsAncestor,
		headIsAncestor,
		baseFingerprint: input.baseFingerprint,
		headFingerprint: input.headFingerprint,
	};
};

/**
 * Produce a reconciliation plan from a drift detection. Pure function.
 */
export const applyReconciliationPlan = (
	detection: IDriftDetection,
): IReconciliationPlan => {
	switch (detection.direction) {
		case 'equal':
			return {
				direction: detection.direction,
				steps: [{ kind: 'no-op' }],
				targetFingerprint: canonicalStateHash({
					headSha: detection.headSha,
					headFingerprint: detection.headFingerprint,
				}),
			};
		case 'behind':
			return {
				direction: detection.direction,
				steps: [
					{
						kind: 'incremental-apply',
						baseSha: detection.baseSha,
						headSha: detection.headSha,
					},
				],
				targetFingerprint: canonicalStateHash({
					headSha: detection.headSha,
					headFingerprint: detection.headFingerprint,
				}),
			};
		case 'ahead':
			return {
				direction: detection.direction,
				steps: [
					{
						kind: 'full-rebuild',
						reason:
							'Durable state is newer than HEAD; incremental reconciliation is unsafe.',
					},
				],
				targetFingerprint: canonicalStateHash({
					headSha: detection.headSha,
					headFingerprint: detection.headFingerprint,
				}),
			};
		case 'diverged':
			return {
				direction: detection.direction,
				steps: [
					{
						kind: 'full-rebuild',
						reason:
							'Base and head diverged; a deterministic rebuild is required.',
					},
				],
				targetFingerprint: canonicalStateHash({
					headSha: detection.headSha,
					headFingerprint: detection.headFingerprint,
				}),
			};
		default:
			return assertNever(detection.direction);
	}
};

function resolveDriftDirection(input: {
	readonly sameSha: boolean;
	readonly sameFingerprint: boolean;
	readonly baseIsAncestor: boolean;
	readonly headIsAncestor: boolean;
}): TDriftDirection {
	if (input.sameSha && input.sameFingerprint) {
		return 'equal';
	}
	if (!input.sameSha && input.baseIsAncestor && !input.headIsAncestor) {
		return 'behind';
	}
	if (!input.sameSha && input.headIsAncestor && !input.baseIsAncestor) {
		return 'ahead';
	}
	return 'diverged';
}

function assertNever(_value: never): never {
	throw new Error('Unexpected reconciliation direction.');
}