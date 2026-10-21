/**
 * taken-proposal-id.service.ts — a unit that creates a proposal does not
 * take an id the proposal set or another agent already holds.
 *
 * `work enter --kind=create --proposal=<id>` took any id. The proposal id
 * allocator reads every worktree, every ref and a
 * counter shared by the clone, and reserves the id on the forge; entering
 * a create unit with an id picked by hand skipped all of it. On
 * 2026-10-20 that handed f00769 to two agents and later f00776 to an
 * agent while develop already held it.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { proposalFileAt } from './publication-target.service';
import { integrationBase, readGit, refused } from './work-unit-shared.service';

const CREATE_KIND = 'create';

/**
 * A refusal when a create unit names an id that is taken: a proposal with
 * that id is on the integration branch, or another agent has a unit for
 * it. `undefined` for any other kind, and for the agent's own units.
 */
export const takenProposalId = (
	root: string,
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
): IWorkUnitResult | undefined => {
	if (scalarArg(args, 'kind') !== CREATE_KIND) return undefined;
	const base = integrationBase(root, policy);
	const landed =
		base === undefined ? undefined : proposalFileAt(root, proposal, base);
	// Units and publications, here and on the forge (`refs/remotes/…`).
	const namespaces = [
		policy.branches.workRefPrefix.replace(/^heads\//u, ''),
		policy.branches.publicationRefPrefix,
	];
	const others = (
		readGit(root, ['for-each-ref', '--format=%(refname)']) ?? ''
	)
		.split('\n')
		.filter(
			(ref) =>
				ref.includes(`/${proposal}-`) &&
				namespaces.some((namespace) => ref.includes(`/${namespace}`)) &&
				!ref.includes(`/${agent}/`),
		);
	if (landed === undefined && others.length === 0) return undefined;
	return refused(
		landed === undefined
			? `${proposal} is already taken: ${others[0] ?? ''} is another agent's unit for it.`
			: `${proposal} already exists on ${policy.branches.integration} (${landed}).`,
		'Let the id be allocated (the proposal tools hand out one free across every worktree and ref), then enter it; or enter the existing proposal with --kind=implement.',
	);
};
