/**
 * validate.ts — rejects policy combinations that cannot be honoured.
 *
 * Not every combination of orthogonal axes is meaningful. A shared
 * working tree with no claims is a data race; a wip-ref model that
 * integrates directly has nowhere for its certification to happen. The
 * spec is explicit that such a policy must fail startup with a concrete
 * diagnostic rather than have the runtime improvise, so every rule here
 * carries the remedy alongside the complaint.
 *
 * Unknown strategy strings land here too: `resolve.ts` deliberately does
 * not throw on them, so that a typo is reported as "you wrote X, valid
 * values are Y" instead of a stack trace from deep inside a merge.
 */

import {
	CHECKPOINT_STRATEGIES,
	COORDINATION_STRATEGIES,
	GOVERNANCE_STRATEGIES,
	INTEGRATION_STRATEGIES,
	MERGE_METHODS,
	PERSISTENCE_STRATEGIES,
	RECOVERY_STRATEGIES,
	WORKSPACE_STRATEGIES,
	type IDevelopmentPolicyViolation,
	type IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';
import { DEVELOPMENT_PROFILES } from './profiles';
import { persistenceRouteKind } from './resolve';
import { validateCombinations } from './validate-combinations';

const oneOf = (
	path: string,
	value: string,
	allowed: readonly string[],
	out: IDevelopmentPolicyViolation[],
): void => {
	if (allowed.includes(value)) return;
	out.push({
		rule: 'unknown-strategy',
		path,
		message: `\`${value}\` is not a recognised value for ${path}.`,
		remedy: `Use one of: ${allowed.join(', ')}.`,
	});
};

/** Vocabulary checks — every axis value must be a value we implement. */
const validateVocabulary = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	oneOf(
		'workspace.strategy',
		policy.workspace.strategy,
		WORKSPACE_STRATEGIES,
		out,
	);
	oneOf(
		'persistence.strategy',
		policy.persistence.strategy,
		PERSISTENCE_STRATEGIES,
		out,
	);
	oneOf(
		'checkpoint.strategy',
		policy.checkpoint.strategy,
		CHECKPOINT_STRATEGIES,
		out,
	);
	oneOf(
		'integration.strategy',
		policy.integration.strategy,
		INTEGRATION_STRATEGIES,
		out,
	);
	oneOf(
		'coordination.strategy',
		policy.coordination.strategy,
		COORDINATION_STRATEGIES,
		out,
	);
	oneOf(
		'recovery.strategy',
		policy.recovery.strategy,
		RECOVERY_STRATEGIES,
		out,
	);
	oneOf(
		'governance.strategy',
		policy.governance.strategy,
		GOVERNANCE_STRATEGIES,
		out,
	);
	oneOf(
		'integration.mergeMethod',
		policy.integration.mergeMethod,
		MERGE_METHODS,
		out,
	);

	if (
		policy.profile !== 'custom' &&
		!(DEVELOPMENT_PROFILES as readonly string[]).includes(policy.profile)
	) {
		out.push({
			rule: 'unknown-profile',
			path: 'development.profile',
			message: `\`${policy.profile}\` is not a known profile.`,
			remedy: `Use one of: ${DEVELOPMENT_PROFILES.join(', ')} — or omit \`profile\` and write the axes directly.`,
		});
	}
};

/** Branch identities must be usable and distinct. */
const validateBranches = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	const { integration, release, workRefTemplate } = policy.branches;

	if (integration.length === 0) {
		out.push({
			rule: 'integration-branch-required',
			path: 'branches.integration',
			message: 'No integration branch is configured.',
			remedy: 'Set `development.branches.integration` (e.g. "develop"). Do not rely on the forge default branch.',
		});
	}

	if (integration.length > 0 && integration === release) {
		out.push({
			rule: 'release-must-differ',
			path: 'branches.release',
			message: `The integration and release branches are both \`${integration}\`.`,
			remedy: 'Give the release branch its own name so it can carry a stricter policy than the branch agents integrate into.',
		});
	}

	if (policy.persistence.usesWipRefs) {
		if (workRefTemplate.length === 0) {
			out.push({
				rule: 'work-ref-template-required',
				path: 'branches.workRefTemplate',
				message:
					'The wip-ref persistence strategy needs a template to name each unit of work.',
				remedy: 'Set `development.branches.workRefTemplate`, e.g. "wip/${agent}/${proposal}-${slice}-g${generation}".',
			});
		} else if (!workRefTemplate.includes('${generation}')) {
			out.push({
				rule: 'work-ref-template-needs-generation',
				path: 'branches.workRefTemplate',
				message:
					'The work-ref template has no `${generation}` placeholder, so successive checkpoints of one slice would collide on the same ref.',
				remedy: 'Add `${generation}` to the template — a slice integrates as several generations, not as one long-lived branch.',
			});
		}
	}
};

/** Legacy worktree persistence has no commit-policy route in the new model. */
const validateLegacyCompatibility = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	if (
		policy.source !== 'legacy-compat' ||
		!policy.workspace.agentWorktrees ||
		policy.persistence.strategy !== 'branch'
	) {
		return;
	}

	out.push({
		rule: 'legacy-worktree-persistence-unsupported',
		path: 'agentWorktree',
		message:
			'The legacy `agentWorktree` setting selects branch persistence, but commit-policy cannot persist that route.',
		remedy: 'Replace the legacy settings with an explicit `development` block, such as the `worktree-pr` profile, and let the worktree host publish each agent branch.',
	});
};

/**
 * Returns every violation, most structural first. An empty array means
 * the policy is coherent and the runtime may start against it.
 */
export const validateDevelopmentPolicy = (
	policy: IResolvedDevelopmentPolicy,
): readonly IDevelopmentPolicyViolation[] => {
	const violations: IDevelopmentPolicyViolation[] = [];
	validateVocabulary(policy, violations);
	// Vocabulary errors make the cross-axis rules meaningless — a typo'd
	// strategy would produce a cascade of confusing follow-on complaints,
	// so the operator is asked to fix the spelling first.
	if (violations.length > 0) return violations;
	validateBranches(policy, violations);
	validateLegacyCompatibility(policy, violations);
	validateCombinations(policy, violations);
	return violations;
};

/**
 * Violations that need BOTH the policy and a plugin's own settings.
 *
 * WHY IT LIVES HERE and not in the plugin: a contradiction between the
 * policy and a plugin config is the same class of error as an
 * incoherent policy, and `assemble.ts` already refuses to start against
 * one of those with a concrete remedy. Putting the check anywhere else
 * means writing the semantics of the policy a second time — which is
 * the bug it exists to catch.
 *
 * The specific case is measured, not hypothetical: this repository
 * declared `shared-checkout-pr` and, in the same file, named the
 * integration branch as commit-policy's push target. Both settings were
 * valid, the pair was the opposite of the profile, and the plugin won
 * because nothing compared them.
 */
export const validatePolicyAlignment = (
	policy: IResolvedDevelopmentPolicy,
	commitPolicyOptions: Record<string, unknown> | undefined,
): readonly IDevelopmentPolicyViolation[] => {
	// NOT an early return any more: a policy that permits a direct
	// integration commit always has a route, so the x00540 rule below
	// cannot fire for it — but the push-target rule still must not, and
	// the two conditions are no longer the same one.
	if (policy.persistence.allowsDirectIntegrationCommit) return [];
	const violations: IDevelopmentPolicyViolation[] = [];

	// x00540. `agentWorktree: true` resolves to `strategy: 'branch'`,
	// whose derived flags are `allowsDirectIntegrationCommit: false` and
	// `usesWipRefs: false` — exactly the pair commit-policy has no route
	// for. The config was still declaring `commit.enabled: true`, so the
	// system started clean and then refused to persist ONE SLICE AT A
	// TIME, leaving the work uncommitted each time. `auto-work.e2e` sat
	// waiting for a remote ref that could never arrive.
	//
	// The refusal itself was correct and well worded. Its TIMING was the
	// defect: a contradiction that is decidable at startup must not be
	// discovered per unit of work, because by then the work exists and
	// the operator has to reconstruct what happened to it.
	//
	// Deliberately NOT auto-migrated to `worktree-pr`. That would be a
	// silent change to WHERE work lands — through the forge instead of a
	// direct push — and no combination of these two settings asked for
	// that. The owner can choose it; this refuses to choose it for them.
	const commitEnabled = (
		commitPolicyOptions?.commit as
			| { readonly enabled?: unknown }
			| undefined
	)?.enabled;
	if (commitEnabled === true && persistenceRouteKind(policy) === 'none') {
		violations.push({
			rule: 'commit-policy-has-no-persistence-route',
			path: 'plugins.commit-policy.options.commit.enabled',
			message: `\`${policy.profile}\` (persistence.strategy=${policy.persistence.strategy}) neither permits a direct commit to \`${policy.branches.integration}\` nor uses WIP refs, so commit-policy has no path to persist a checkpoint — but this config asks it to persist one. Every slice will finish with its work uncommitted, and it will say so once per slice instead of once at startup.`,
			remedy: `Persist through the worktree host and set \`plugins.commit-policy.options.commit.enabled\` to false, or choose a profile whose persistence strategy is \`direct-commit\` or \`wip-ref\` (\`shared-checkout-pr\` is the default).`,
		});
	}

	const push = commitPolicyOptions?.push;
	if (typeof push !== 'object' || push === null) return violations;
	const branch = (push as { readonly branch?: unknown }).branch;
	if (branch !== policy.branches.integration) return violations;
	return [
		...violations,
		{
			rule: 'push-target-contradicts-policy',
			path: 'plugins.commit-policy.options.push.branch',
			message: `\`${policy.profile}\` reaches \`${policy.branches.integration}\` through the forge and never by a direct push, but this config names \`${policy.branches.integration}\` as the push target. The push can never succeed, and the setting says the opposite of the profile.`,
			remedy: 'Remove `push.branch`. The development policy decides where work goes; that setting only exists to override a policy that permits it.',
		},
	];
};
