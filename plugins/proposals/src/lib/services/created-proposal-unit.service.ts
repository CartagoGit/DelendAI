/**
 * created-proposal-unit.service.ts — what a unit says about itself once the
 * proposal it was entered for has an id.
 *
 * A unit entered for `new` is renamed by core when the id exists. The
 * agent works in that unit until it publishes, so the result of the create
 * has to say the name it now has: the old one no longer resolves.
 */
import {
	adoptProposalId,
	type IResolvedDevelopmentPolicy,
	type IUnitAdoption,
} from '@delendai/core/public';
import type { ICreatedProposalUnit } from '../contracts/interfaces/created-proposal-unit.interface';

const describe = (adoption: IUnitAdoption): ICreatedProposalUnit => {
	if (adoption.status === 'kept') {
		return adoption.branch === undefined
			? {}
			: { unitBranch: adoption.branch };
	}
	if (adoption.status === 'refused') {
		return {
			unitBranch: adoption.branch,
			note: `The unit keeps the name ${adoption.branch} because it could not be renamed after the new proposal: ${adoption.reason}`,
		};
	}
	const forge =
		adoption.forge === 'left'
			? ` The old name could not be removed from the remote; delete ${adoption.from} there by hand.`
			: '';
	return {
		unitBranch: adoption.to,
		unitRenamedFrom: adoption.from,
		note: `The unit was renamed after the proposal: ${adoption.from} is now ${adoption.to} (same commit, same worktree). Publish it with the proposal's id.${forge}`,
	};
};

/** Rename the unit at `root` after `id` when it was entered for `new`. */
export const adoptCreatedProposalUnit = async (input: {
	readonly root: string;
	readonly id: string;
	readonly policy: IResolvedDevelopmentPolicy | undefined;
}): Promise<ICreatedProposalUnit> => {
	if (input.policy === undefined) return {};
	return describe(
		await adoptProposalId({
			cwd: input.root,
			proposal: input.id,
			policy: input.policy,
		}),
	);
};
