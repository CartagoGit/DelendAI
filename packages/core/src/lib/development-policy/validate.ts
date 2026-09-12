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
