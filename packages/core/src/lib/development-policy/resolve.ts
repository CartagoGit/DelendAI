/**
 * resolve.ts — turns whatever a project actually wrote in
 * `delendai.config.json` into one `IResolvedDevelopmentPolicy`.
 *
 * Three inputs can describe the same thing, so precedence is explicit:
 *
 *   1. an explicit `development` block (profile, then per-axis overrides)
 *   2. the pre-policy fields — `agentWorktree` and the `commit-policy`
 *      plugin options — mapped through the compatibility layer
 *   3. the built-in default, which is the historical model
 *
 * Rule (2) is the reason this file exists. A project that upgrades
 * delendai without editing its config must keep integrating work exactly
 * the way it did yesterday: the legacy fields keep working, they are
 * mapped rather than ignored, and nothing is silently migrated to the new
 * model. Choosing the new model is an edit the operator makes.
 */

import {
	DEVELOPMENT_POLICY_VERSION,
	type IResolvedDevelopmentPolicy,
	type IMergeMethod,
} from '../contracts/interfaces/development-policy.interface';
import { deriveCapabilities } from './derive';
import {
	DEFAULT_DEVELOPMENT_PROFILE,
	expandProfile,
	isDevelopmentProfile,
} from './profiles';

import type {
	IDevelopmentConfigInput,
	ILegacyDevelopmentInput,
	IResolveDevelopmentPolicyInput,
} from './resolve.interface';

export type {
	IDevelopmentConfigInput,
	ILegacyDevelopmentInput,
	IResolveDevelopmentPolicyInput,
} from './resolve.interface';

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
const fromLegacy = (
	legacy: ILegacyDevelopmentInput,
): IResolvedDevelopmentPolicy => {
	const base = expandProfile(DEFAULT_DEVELOPMENT_PROFILE);
	const options = legacy.commitPolicyOptions;
	const push = asRecord(options?.push);
	const cadence = readCadence(options);

	// `agentWorktree` only ever described WHERE an agent edits. It never
	// implied pull requests, so the integration axis is left alone.
	const worktrees = legacy.agentWorktree === true;

	return {
		...base,
		source: 'legacy-compat',
		profile: worktrees ? 'custom' : DEFAULT_DEVELOPMENT_PROFILE,
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

/** Applies an explicit `development` block over an already-chosen base. */
const applyOverrides = (
	base: IResolvedDevelopmentPolicy,
	input: IDevelopmentConfigInput,
): IResolvedDevelopmentPolicy => ({
	...base,
	branches: {
		integration: input.branches?.integration ?? base.branches.integration,
		release: input.branches?.release ?? base.branches.release,
		workRefTemplate:
			input.branches?.workRefTemplate ?? base.branches.workRefTemplate,
		workRefPrefix:
			input.branches?.workRefPrefix ?? base.branches.workRefPrefix,
	},
	workspace: {
		...base.workspace,
		strategy: (input.workspace?.strategy ??
			base.workspace.strategy) as typeof base.workspace.strategy,
	},
	persistence: {
		...base.persistence,
		strategy: (input.persistence?.strategy ??
			base.persistence.strategy) as typeof base.persistence.strategy,
		autoCommitOnTask:
			input.persistence?.autoCommitOnTask ??
			base.persistence.autoCommitOnTask,
		autoPushAfterCommit:
			input.persistence?.autoPushAfterCommit ??
			base.persistence.autoPushAfterCommit,
	},
	checkpoint: {
		...base.checkpoint,
		strategy: (input.checkpoint?.strategy ??
			base.checkpoint.strategy) as typeof base.checkpoint.strategy,
		intervalMinutes:
			input.checkpoint?.intervalMinutes ??
			base.checkpoint.intervalMinutes,
		durableWip: input.checkpoint?.durableWip ?? base.checkpoint.durableWip,
	},
	integration: {
		...base.integration,
		strategy: (input.integration?.strategy ??
			base.integration.strategy) as typeof base.integration.strategy,
		requiredChecks:
			input.integration?.requiredChecks ??
			base.integration.requiredChecks,
		requireLatestIntegration:
			input.integration?.requireLatestIntegration ??
			base.integration.requireLatestIntegration,
		mergeGreenProgressContinuously:
			input.integration?.mergeGreenProgressContinuously ??
			base.integration.mergeGreenProgressContinuously,
		requiredApprovals:
			input.integration?.requiredApprovals ??
			base.integration.requiredApprovals,
		releaseRequiredApprovals:
			input.integration?.releaseRequiredApprovals ??
			base.integration.releaseRequiredApprovals,
		releaseRequiredChecks: [
			...(input.integration?.releaseRequiredChecks ??
				base.integration.releaseRequiredChecks),
		],
		mergeMethod: (input.integration?.mergeMethod ??
			base.integration.mergeMethod) as IMergeMethod,
		deleteMergedWorkRef:
			input.integration?.deleteMergedWorkRef ??
			base.integration.deleteMergedWorkRef,
		linearHistory:
			input.integration?.linearHistory ?? base.integration.linearHistory,
		allowForcePush:
			input.integration?.allowForcePush ??
			base.integration.allowForcePush,
		allowDeleteIntegrationBranch:
			input.integration?.allowDeleteIntegrationBranch ??
			base.integration.allowDeleteIntegrationBranch,
	},
	coordination: {
		...base.coordination,
		strategy: (input.coordination?.strategy ??
			base.coordination.strategy) as typeof base.coordination.strategy,
		leaseTtlMinutes:
			input.coordination?.leaseTtlMinutes ??
			base.coordination.leaseTtlMinutes,
	},
	recovery: {
		...base.recovery,
		strategy: (input.recovery?.strategy ??
			base.recovery.strategy) as typeof base.recovery.strategy,
		neverDiscardUnmergedWork:
			input.recovery?.neverDiscardUnmergedWork ??
			base.recovery.neverDiscardUnmergedWork,
	},
	governance: {
		...base.governance,
		strategy: (input.governance?.strategy ??
			base.governance.strategy) as typeof base.governance.strategy,
		failClosedOnUnverifiable:
			input.governance?.failClosedOnUnverifiable ??
			base.governance.failClosedOnUnverifiable,
	},
});

/**
 * Resolves the canonical development policy for a workspace.
 *
 * Never throws on an unknown strategy string: an unrecognised value is
 * carried through to `validateDevelopmentPolicy`, which reports it as a
 * structured violation. Failing there rather than here is what lets
 * startup print a concrete diagnostic instead of a stack trace.
 */
export const resolveDevelopmentPolicy = (
	input: IResolveDevelopmentPolicyInput,
): IResolvedDevelopmentPolicy => {
	const development = input.development;
	const hasExplicitBlock =
		development !== undefined && Object.keys(development).length > 0;

	if (!hasExplicitBlock) {
		const legacy = input.legacy;
		const hasLegacy =
			legacy !== undefined &&
			(legacy.agentWorktree !== undefined ||
				legacy.commitPolicyOptions !== undefined);

		if (!hasLegacy) {
			return deriveCapabilities({
				...expandProfile(DEFAULT_DEVELOPMENT_PROFILE),
				source: 'default',
			});
		}
		return deriveCapabilities(fromLegacy(legacy));
	}

	const profileId = development.profile;
	const base =
		profileId !== undefined && isDevelopmentProfile(profileId)
			? expandProfile(profileId)
			: {
					...expandProfile(DEFAULT_DEVELOPMENT_PROFILE),
					// An unrecognised profile name is preserved verbatim so
					// validation can name it back to the operator instead of
					// silently pretending they picked the default.
					profile: profileId ?? 'custom',
				};

	const merged = applyOverrides(base, development);
	return deriveCapabilities({
		...merged,
		version: DEVELOPMENT_POLICY_VERSION,
		source: profileId !== undefined ? 'profile' : 'explicit',
	});
};
