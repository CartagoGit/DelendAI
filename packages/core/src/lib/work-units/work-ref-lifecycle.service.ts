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
import type { IWorkRefFacts } from '../contracts/interfaces/work-ref-lifecycle.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { workRefFate } from '../integration/decisions/landed.helper';
import { readGit } from '../shared/git-read.helper';
import { proposalInProgress } from './publication-target.service';
import { MILLISECONDS_PER_SECOND } from './unit-lease.constant';

/**
 * Seconds since `committedAt` (a commit time in epoch seconds, as git's
 * `%ct` prints it), or `undefined` when it could not be read.
 */
export const silenceSince = (
	committedAt: string | undefined,
	now: number = Date.now(),
): number | undefined => {
	const seconds = Number.parseInt((committedAt ?? '').trim(), 10);
	return Number.isNaN(seconds)
		? undefined
		: Math.max(0, Math.floor(now / MILLISECONDS_PER_SECOND) - seconds);
};

/**
 * The integration branch the rule reads, wherever the caller stands: the
 * forge's copy when the clone has it, else the local branch. The checkout
 * publisher read the local branch and the ref maintenance the forge's, so
 * one lagging behind the other gave them two readings of one ref.
 */
export const workRefIntegrationRef = (
	remote: string,
	integration: string,
	remoteKnown: boolean,
): string =>
	remoteKnown
		? `refs/remotes/${remote}/${integration}`
		: `refs/heads/${integration}`;

/**
 * Where the ref's proposal stands, at the ref's tip and on the
 * integration branch, read from a clone at `root`.
 */
export const workRefOpenness = (
	root: string,
	proposal: string,
	tip: string,
	integration: string,
): Pick<IWorkRefFacts, 'openAtTip' | 'openOnIntegration' | 'silentSeconds'> => {
	const silentSeconds = silenceSince(
		readGit(root, ['log', '-1', '--format=%ct', tip]),
	);
	return {
		openAtTip: proposalInProgress(root, proposal, tip),
		openOnIntegration: proposalInProgress(root, proposal, integration),
		...(silentSeconds === undefined ? {} : { silentSeconds }),
	};
};

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
