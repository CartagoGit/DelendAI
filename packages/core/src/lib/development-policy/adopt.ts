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
 * ## Why the forge is evidence only for `init`
 *
 * An earlier version read the remote and `gh`'s admin permission, and gave
 * a GitHub project `shared-checkout-pr` while `work` on the very same
 * project resolved `shared-checkout-merge`: the same repository was
 * described differently depending on which ran first, and the file was
 * rewritten to the one nobody had been told about. The default profile is
 * `shared-checkout-merge` precisely because it asks nothing of the forge
 * (see `DEFAULT_DEVELOPMENT_PROFILE`), so a forge probe has nothing left
 * to decide — and a network call at startup to decide nothing is cost
 * without benefit. `delendai init` is different: it is the person's own
 * act of declaring a model, may read the forge, prints what it chose and
 * why, and what it writes is then the declared policy.
 *
 * ## Why legacy fields are not migrated
 *
 * `agentWorktree` and the commit-policy options are a decision somebody
 * made, and the resolver honours them as `legacy-compat`. Rewriting them
 * into a block would change what they mean, so they stay as written until
 * the operator chooses a new model.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { IAdoptionEvidence, IAdoptionProposal } from './adopt.interface';

export type {
	IAdoptionBlock,
	IAdoptionEvidence,
	IAdoptionProposal,
	IForgeKind,
} from './adopt.interface';
export { FORGE_KINDS } from './adopt.interface';

/**
 * The model `delendai init` declares for a project whose forge can
 * certify a pull request. Init is the person's explicit act of
 * declaring a policy, so it — and only it — may read the forge.
 */
const INIT_PULL_REQUEST_PROFILE = 'shared-checkout-pr';

const initChoice = (evidence: IAdoptionEvidence | undefined): boolean =>
	evidence?.forge === 'github' && evidence.canRequireChecks === true;

/**
 * The block that records `policy` in the configuration file, or nothing
 * when the policy is not one delendai adopted.
 *
 * With no `evidence` (server start) the block is exactly the policy
 * already resolved. With evidence (`delendai init`, an explicit act of
 * declaring) a GitHub project that can require checks is offered the
 * pull-request model instead, and the reasons say so.
 */
export const proposeAdoption = (
	policy: IResolvedDevelopmentPolicy,
	evidence?: IAdoptionEvidence,
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
	const pullRequest = initChoice(evidence);
	const profile = pullRequest ? INIT_PULL_REQUEST_PROFILE : policy.profile;
	return {
		block: {
			profile,
			branches: { integration, release },
		},
		reasons: [
			pullRequest
				? `chose \`${profile}\`: the forge is GitHub and this project can require a check on a pull request, so the forge can certify what lands.`
				: `chose \`${profile}\`: the built-in default, which asks nothing of the forge — the local gate certifies work before it lands.`,
			`integration branch is \`${integration}\`: resolved exactly as \`delendai work\` resolves it — the project's stable default branch when the checkout names one, never the forge's opinion.`,
			release === integration
				? `release branch is \`${release}\`: none was named, so the project integrates and releases on one branch.`
				: `release branch is \`${release}\`: separate from the integration branch.`,
		],
	};
};
