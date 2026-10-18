/**
 * work-ref-lifecycle.service.ts — the one rule for a work ref's life.
 *
 * Whether a work ref stays on the forge, is taken off it, is reaped with
 * its worktree, or is put back was decided in three places: the checkout
 * publisher withdrew a ref as soon as its work landed, the ref maintenance
 * reaped it, and the queue's doctor required it while its proposal was in
 * progress. The first two undid what the third asked for: one unit's ref
 * was deleted and pushed back 46 times in thirteen hours, and the
 * integration branch's queue went red on the units it had taken. Every
 * component that acts on a work ref, and the doctor that judges them,
 * reads this rule instead of its own.
 */
import type {
	IWorkRefFacts,
	IWorkRefVerdict,
} from '../contracts/interfaces/work-ref-lifecycle.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { proposalInProgress } from './publication-target.service';

/**
 * Whether the ref's proposal is open, as far as this ref is concerned.
 * A ref whose work has landed is behind the integration branch, so the
 * integration branch's reading is the newer one: a landed tip that still
 * says "in progress" is history, and keeping the ref for it kept refs of
 * proposals long closed. A ref with work of its own is ahead, and its
 * tip says where its proposal stands too (a unit that moved it to in
 * progress before that move landed).
 */
export const workRefProposalOpen = (
	facts: Pick<IWorkRefFacts, 'landed' | 'openAtTip' | 'openOnIntegration'>,
): boolean => facts.openOnIntegration || (!facts.landed && facts.openAtTip);

/** What to do with a work ref, from what is known about it. */
export const workRefFate = (facts: IWorkRefFacts): IWorkRefVerdict => {
	if (workRefProposalOpen(facts)) {
		return facts.onForge
			? {
					fate: 'keep',
					reason: 'its proposal is in progress: the ref is the unit the forge shows for it',
				}
			: {
					fate: 'restore',
					reason: 'its proposal is in progress and the forge lost its unit: the ref goes back',
				};
	}
	if (!facts.landed) {
		return {
			fate: 'keep',
			reason: 'it holds work the integration branch lacks',
		};
	}
	return facts.worktree === 'in-use'
		? {
				fate: 'withdraw',
				reason: 'its work landed and its proposal is not in progress: the forge copy goes, the checkout in use stays',
			}
		: {
				fate: 'reap',
				reason: 'its work landed and its proposal is not in progress: the unit ends, with its clean worktree',
			};
};

/**
 * Where the ref's proposal stands, at the ref's tip and on the
 * integration branch, read from a clone at `root`.
 */
export const workRefOpenness = (
	root: string,
	proposal: string,
	tip: string,
	integration: string,
): Pick<IWorkRefFacts, 'openAtTip' | 'openOnIntegration'> => ({
	openAtTip: proposalInProgress(root, proposal, tip),
	openOnIntegration: proposalInProgress(root, proposal, integration),
});

/**
 * Whether the rule keeps a forge work ref whose work has landed, read
 * from the forge's copies of it and of the integration branch: the
 * doctor's hanging-ref check excuses exactly the refs the rule keeps.
 */
export const landedForgeRefKept = (
	root: string,
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	remote: string,
	integration: string,
	ref: string,
): boolean => {
	const proposal = workUnitIdentityOf(policy, ref)?.proposal;
	return (
		proposal !== undefined &&
		workRefFate({
			landed: true,
			onForge: true,
			worktree: 'none',
			...workRefOpenness(
				root,
				proposal,
				`refs/remotes/${remote}/${ref}`,
				`refs/remotes/${remote}/${integration}`,
			),
		}).fate === 'keep'
	);
};
