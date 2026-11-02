/**
 * resolve-legacy.helper.ts — the compatibility path from pre-policy
 * fields to a resolved policy.
 *
 * Split out of `resolve.ts` (SRP ceiling): reading what an old
 * `agentWorktree` flag and a `commit-policy.options` block MEANT is one
 * job; applying a declared `development` block over a profile is the
 * other. `resolve.ts` keeps the second and asks this module for the
 * first.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ILegacyDevelopmentInput } from './resolve.interface';
import { expandProfile } from './profiles';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const asPositiveNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: undefined;

/**
 * Maps the `commit-policy` cadence triggers onto a checkpoint strategy.
 * `slice` + `interval` together is the continuous case; either alone maps
 * to itself; neither leaves the profile's own value in place.
 */
const readCadence = (
	options: Record<string, unknown> | undefined,
): { strategy?: 'slice' | 'interval' | 'continuous'; minutes?: number } => {
	const cadence = asRecord(options?.cadence);
	const triggers = cadence?.triggers;
	if (!Array.isArray(triggers)) return {};

	let hasSlice = false;
	let minutes: number | undefined;
	for (const raw of triggers) {
		const trigger = asRecord(raw);
		const kind = asString(trigger?.kind);
		if (kind === 'slice') hasSlice = true;
		if (kind === 'interval') {
			minutes = asPositiveNumber(trigger?.minutes) ?? minutes;
		}
	}

	const hasInterval = minutes !== undefined;
	if (hasSlice && hasInterval)
		return { strategy: 'continuous', minutes: minutes ?? 0 };
	if (hasInterval) return { strategy: 'interval', minutes: minutes ?? 0 };
	if (hasSlice) return { strategy: 'slice' };
	return {};
};

/**
 * Builds a policy from the pre-policy fields. The starting point is
 * always `shared-direct` — the model those fields described — and only
 * what they actually say is changed on top of it.
 */
export const fromLegacy = (
	legacy: ILegacyDevelopmentInput,
): IResolvedDevelopmentPolicy => {
	// `shared-direct` BY NAME, not the default profile.
	//
	// The historical model is what a legacy configuration actually
	// described: a shared tree, no work ref, commits straight onto the
	// branch. Reading it from the default meant that changing the default
	// silently migrated every legacy project to a model they never chose
	// — which is the one thing this compatibility path exists to prevent,
	// and exactly what happened the day the default moved.
	const base = expandProfile('shared-direct');
	const options = legacy.commitPolicyOptions;
	const push = asRecord(options?.push);
	const cadence = readCadence(options);

	// `agentWorktree` only ever described WHERE an agent edits. It never
	// implied pull requests, so preserve that model for validation to reject
	// explicitly instead of silently migrating the project to `worktree-pr`.
	const worktrees = legacy.agentWorktree === true;

	return {
		...base,
		source: 'legacy-compat',
		profile: worktrees ? 'custom' : 'shared-direct',
		branches: {
			...base.branches,
			integration: asString(push?.branch) ?? base.branches.integration,
		},
		workspace: {
			...base.workspace,
			strategy: worktrees ? 'agent-worktree' : 'shared-checkout',
		},
		persistence: {
			...base.persistence,
			strategy: worktrees ? 'branch' : 'direct-commit',
		},
		checkpoint: {
			...base.checkpoint,
			strategy: cadence.strategy ?? base.checkpoint.strategy,
			intervalMinutes: cadence.minutes ?? base.checkpoint.intervalMinutes,
		},
		integration: {
			...base.integration,
			// A legacy config that disabled pushing is still a direct
			// model; it simply never reached the remote.
			allowForcePush: asString(push?.force) === 'true',
		},
	};
};
