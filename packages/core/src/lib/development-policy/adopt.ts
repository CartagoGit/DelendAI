/**
 * adopt.ts — what development model a project that has never stated one
 * should be given, and why.
 *
 * WHY a project should not have to write this by hand: the model is only
 * worth having if a workspace arrives at it, and every project that has
 * to hand-author seven axes before it gets any benefit will instead get
 * none. Adoption reads what the workspace already is and proposes the
 * block that matches it.
 *
 * WHY it proposes rather than decides silently: the choice changes how
 * work reaches the branch everyone shares, so every part of it comes
 * back with the evidence that produced it. A migration an operator
 * cannot audit is a migration they have to trust.
 *
 * WHY an unknown forge capability means "cannot": a project on a forge
 * we may not administer must not be told it requires checks that nobody
 * can enforce. That is exactly how this repository ended up with a
 * `main` branch requiring a context no workflow produced. Unknown is not
 * permission.
 *
 * WHY the integration branch is the branch the checkout is already on:
 * that is the branch the project is demonstrably working from. It is not
 * inferred from the forge's `default_branch` — the forge's opinion about
 * a default has nothing to do with where this team integrates, and
 * trusting it is the specific mistake the branch contract forbids.
 */

import type {
	IAdoptionBranches,
	IAdoptionEvidence,
	IAdoptionProposal,
} from './adopt.interface';

export type {
	IAdoptionBlock,
	IAdoptionBranches,
	IAdoptionEvidence,
	IAdoptionProposal,
	TForgeKind,
} from './adopt.interface';
export { FORGE_KINDS } from './adopt.interface';

/** Branches conventionally used for releases, most likely first. */
const RELEASE_CANDIDATES = ['main', 'master', 'trunk', 'release'] as const;

const chooseProfile = (
	evidence: IAdoptionEvidence,
	reasons: string[],
): string => {
	if (evidence.agentWorktree === true) {
		reasons.push(
			'kept `worktree-pr`: the project already asked for a worktree per agent, and adoption must not quietly change a decision somebody made.',
		);
		return 'worktree-pr';
	}
	if (evidence.forge === 'github' && evidence.canRequireChecks === true) {
		reasons.push(
			'chose `shared-checkout-pr`: the forge is GitHub and this project can require a check on a pull request, so the forge can certify what lands.',
		);
		return 'shared-checkout-pr';
	}
	reasons.push(
		evidence.canRequireChecks === undefined
			? `chose \`shared-checkout-merge\`: nothing could establish that this project may require checks on a pull request (forge: ${evidence.forge}). Unknown is not permission — the local gate certifies instead, and it becomes mandatory.`
			: `chose \`shared-checkout-merge\`: this project cannot require checks on a pull request (forge: ${evidence.forge}), so the local gate certifies instead and becomes mandatory.`,
	);
	return 'shared-checkout-merge';
};

const chooseBranches = (
	evidence: IAdoptionEvidence,
	reasons: string[],
): IAdoptionBranches => {
	const branches: { integration?: string; release?: string } = {};
	if (evidence.currentBranch !== undefined && evidence.currentBranch !== '') {
		branches.integration = evidence.currentBranch;
		reasons.push(
			`integration branch is \`${evidence.currentBranch}\`: the branch this workspace is already working from. Not the forge's default_branch — the forge's opinion about a default has nothing to do with where this team integrates.`,
		);
	}

	const existing = evidence.existingBranches ?? [];
	const release = RELEASE_CANDIDATES.find(
		(candidate) =>
			existing.includes(candidate) && candidate !== branches.integration,
	);
	if (release !== undefined) {
		branches.release = release;
		reasons.push(
			`release branch is \`${release}\`: it exists and is not the integration branch.`,
		);
	} else if (branches.integration !== undefined) {
		reasons.push(
			'no release branch was named: none of the conventional names exists yet, so the profile default stands and the release boundary is simply unused until a project makes one.',
		);
	}
	return branches;
};

/**
 * Propose the `development` block for this workspace, or nothing at all
 * when the project has already decided.
 */
export const proposeAdoption = (
	evidence: IAdoptionEvidence,
): IAdoptionProposal => {
	if (evidence.hasDevelopmentBlock) {
		return {
			reasons: [
				'left untouched: this project already states a development policy, and adoption never overwrites a decision somebody made.',
			],
		};
	}

	const reasons: string[] = [];
	const profile = chooseProfile(evidence, reasons);
	const branches = chooseBranches(evidence, reasons);

	return {
		block: {
			profile,
			...(Object.keys(branches).length > 0 ? { branches } : {}),
		},
		reasons,
	};
};
