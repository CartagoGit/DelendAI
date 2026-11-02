/**
 * validate-branch-rules.ts — the combinations of `branches.rules` that
 * cannot be honoured. Each complaint names the exact key that is wrong.
 */
import { BRANCH_TAKE_IN_MODES } from '../contracts/interfaces/branch-rule.interface';
import type {
	IDevelopmentPolicyViolation,
	IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';
import { branchRuleFor, takeInStrictness } from './branch-rules';
import { policyNamespaces } from './git-guard-namespaces';
import { hasSeparateReleaseBranch } from './release-branch';

const keyOf = (pattern: string): string => `branches.rules.${pattern}`;

export const validateBranchRules = (
	policy: IResolvedDevelopmentPolicy,
	out: IDevelopmentPolicyViolation[],
): void => {
	const { rules, integration, release } = policy.branches;
	const { prefixes } = policyNamespaces(policy);

	for (const rule of rules) {
		if (!BRANCH_TAKE_IN_MODES.includes(rule.takesIn)) {
			out.push({
				rule: 'unknown-strategy',
				path: `${keyOf(rule.pattern)}.takesIn`,
				message: `\`${rule.takesIn}\` is not a recognised value for ${keyOf(rule.pattern)}.takesIn.`,
				remedy: `Use one of: ${BRANCH_TAKE_IN_MODES.join(', ')}.`,
			});
			continue;
		}
		const namespace = prefixes.find((prefix) =>
			rule.pattern.startsWith(prefix),
		);
		if (rule.takesIn === 'direct' && namespace !== undefined) {
			out.push({
				rule: 'direct-branch-in-delendai-namespace',
				path: keyOf(rule.pattern),
				message: `\`${rule.pattern}\` takes in work directly, but it sits inside \`${namespace}\`, a namespace delendai owns for work refs and publications.`,
				remedy: `Declare the direct branch outside \`${namespace}\`, or give this rule the "pull-request" or "merge" mode.`,
			});
		}
	}

	if (!hasSeparateReleaseBranch(policy.branches)) return;
	const integrationRule = branchRuleFor(rules, integration);
	const releaseRule = branchRuleFor(rules, release);
	if (integrationRule === undefined || releaseRule === undefined) return;
	const integrationRank = takeInStrictness(integrationRule.takesIn);
	const releaseRank = takeInStrictness(releaseRule.takesIn);
	if (integrationRank < 0 || releaseRank < 0) return;
	if (releaseRank > integrationRank) {
		out.push({
			rule: 'release-rule-not-looser',
			path: keyOf(releaseRule.pattern),
			message: `The release branch \`${release}\` takes in work by ${releaseRule.takesIn} while the integration branch \`${integration}\` takes it in by ${integrationRule.takesIn}, which makes releasing easier than integrating.`,
			remedy: `Make ${keyOf(releaseRule.pattern)} as strict as ${keyOf(integrationRule.pattern)} (strictest to loosest: ${BRANCH_TAKE_IN_MODES.join(', ')}).`,
		});
	}
};
