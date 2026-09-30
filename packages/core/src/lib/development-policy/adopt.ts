/**
 * adopt.ts — the `development` block a project that never stated one is
 * given, derived from the policy it is ALREADY working under.
 *
 * ## One rule, one path
 *
 * Adoption does not choose a model. `resolveEffectivePolicy` does, for
 * every reader of the workspace (the guard, `delendai work`, the served
 * instructions), and this module only writes that answer down. So what
 * lands in the configuration file is, by construction, what was already
 * being enforced and described — the file is never a second opinion.
 *
 * ## Why the forge is not evidence
 *
 * An earlier version read the remote and `gh`'s admin permission, and gave
 * a GitHub project `shared-checkout-pr` while `work` on the very same
 * project resolved `shared-checkout-merge`: the same repository was
 * described differently depending on which ran first, and the file was
 * rewritten to the one nobody had been told about. The default profile is
 * `shared-checkout-merge` precisely because it asks nothing of the forge
 * (see `DEFAULT_DEVELOPMENT_PROFILE`), so a forge probe has nothing left
 * to decide — and a network call at startup to decide nothing is cost
 * without benefit. A project that wants pull requests declares them.
 *
 * ## Why legacy fields are not migrated
 *
 * `agentWorktree` and the commit-policy options are a decision somebody
 * made, and the resolver honours them as `legacy-compat`. Rewriting them
 * into a block would change what they mean, so they stay as written until
 * the operator chooses a new model.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { IAdoptionProposal } from './adopt.interface';

export type { IAdoptionBlock, IAdoptionProposal } from './adopt.interface';

/**
 * The block that records `policy` in the configuration file, or nothing
 * when the policy is not one delendai adopted.
 */
export const proposeAdoption = (
	policy: IResolvedDevelopmentPolicy,
): IAdoptionProposal => {
	if (policy.source === 'legacy-compat') {
		return {
			reasons: [
				'left untouched: the legacy `agentWorktree` / commit-policy fields are a decision somebody made and are honoured as written; choose a model by adding a `development` block.',
			],
		};
	}
	if (policy.source !== 'default') {
		return {
			reasons: [
				'left untouched: this project already states a development policy, and adoption never overwrites a decision somebody made.',
			],
		};
	}
	const { integration, release } = policy.branches;
	return {
		block: {
			profile: policy.profile,
			branches: { integration, release },
		},
		reasons: [
			`chose \`${policy.profile}\`: the built-in default, which asks nothing of the forge — the local gate certifies work before it lands.`,
			`integration branch is \`${integration}\`: resolved exactly as \`delendai work\` resolves it — the project's stable default branch when the checkout names one, never the forge's opinion.`,
			release === integration
				? `release branch is \`${release}\`: none was named, so the project integrates and releases on one branch.`
				: `release branch is \`${release}\`: separate from the integration branch.`,
		],
	};
};
