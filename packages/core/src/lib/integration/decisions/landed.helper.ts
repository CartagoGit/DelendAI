/**
 * landed.ts — whether work has landed, and what becomes of a work ref.
 *
 * Whether a work ref stays on the forge, is taken off it, is reaped with
 * its worktree, or is put back was decided in three places: the checkout
 * publisher withdrew a ref as soon as its work landed, the ref maintenance
 * reaped it, and the queue's doctor required it while its proposal was in
 * progress. The first two undid what the third asked for: one unit's ref
 * was deleted and pushed back 46 times in thirteen hours. Every
 * component that acts on a work ref, and the doctor that judges them,
 * reads this rule instead of its own.
 */
import type {
	IWorkRefFacts,
	IWorkRefVerdict,
} from '../../contracts/interfaces/work-ref-lifecycle.interface';
import { ABANDONED_UNIT_SILENCE_SECONDS } from '../../work-units/unit-lease.constant';

/**
 * Whether a ref's unit has been silent past abandonment. Unknown silence
 * is not abandonment.
 */
const abandoned = (facts: Pick<IWorkRefFacts, 'silentSeconds'>): boolean =>
	(facts.silentSeconds ?? 0) > ABANDONED_UNIT_SILENCE_SECONDS;

/**
 * Whether the ref's proposal is open, as far as this ref is concerned.
 * A ref whose work has landed is behind the integration branch, so the
 * integration branch's reading is the newer one: a landed tip that still
 * says "in progress" is history, and keeping the ref for it kept refs of
 * proposals long closed. A ref with work of its own is ahead, and its
 * tip says where its proposal stands too (a unit that moved it to in
 * progress before that move landed).
 *
 * A landed ref whose unit has been silent past abandonment no longer
 * holds an open proposal open: a proposal several agents work on (a
 * multi-reviewer audit) stays in progress for days, and every reviewer
 * that had finished kept a live ref until the last one did.
 */
export const workRefProposalOpen = (
	facts: Pick<
		IWorkRefFacts,
		'landed' | 'openAtTip' | 'openOnIntegration' | 'silentSeconds'
	>,
): boolean =>
	(facts.openOnIntegration && !(facts.landed && abandoned(facts))) ||
	(!facts.landed && facts.openAtTip);

/**
 * Whether a ref's work has landed: the one reading every caller of the
 * rule uses for `landed`. A ref sitting exactly at the integration tip
 * has nothing of its own yet (an agent just entered), so it has not
 * landed; a ref the integration branch contains has; and one that adds no
 * file counts as landed only when it carries no meaning of its own (a
 * forward sync, empty-commit claims), which only containment settles.
 */
export const workRefLanded = (facts: {
	readonly atIntegrationTip: boolean;
	readonly contained: boolean;
	readonly changesNothing: boolean;
	readonly meaningInCommits: boolean;
}): boolean =>
	!facts.atIntegrationTip &&
	(facts.contained || (!facts.meaningInCommits && facts.changesNothing));

/** Whether the verdict puts the ref back on the forge. */
export const putsBack = (
	verdict: IWorkRefVerdict,
): verdict is IWorkRefVerdict & { readonly fate: 'restore' } =>
	verdict.fate === 'restore';

/** Whether the verdict takes the ref off the forge. */
export const takesOff = (verdict: IWorkRefVerdict): boolean =>
	verdict.fate === 'withdraw' || verdict.fate === 'reap';

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
	const why = facts.openOnIntegration
		? 'its work landed and its unit has been silent past abandonment while its proposal stays open for others'
		: 'its work landed and its proposal is not in progress';
	return facts.worktree === 'in-use'
		? {
				fate: 'withdraw',
				reason: `${why}: the forge copy goes, the checkout in use stays`,
			}
		: {
				fate: 'reap',
				reason: `${why}: the unit ends, with its clean worktree`,
			};
};

/**
 * Of `git rev-list --parents <base>..<sha>`, the parents that must be in
 * the base for `sha` to carry nothing of its own, or `undefined` when a
 * commit beyond the base is not a merge (it is work). One reading for
 * every caller, whichever way it asks git about ancestry.
 */
export const parentsOutsideMerges = (
	listing: string,
): readonly string[] | undefined => {
	const lines = listing.split('\n').filter((line) => line.length > 0);
	const beyond = new Set(lines.map((line) => line.split(' ')[0] ?? ''));
	const outside = new Set<string>();
	for (const line of lines) {
		const [, ...parents] = line.split(' ');
		if (parents.length < 2) return undefined;
		for (const parent of parents) {
			if (!beyond.has(parent)) outside.add(parent);
		}
	}
	return [...outside];
};

/**
 * Whether a pull request has landed: the forge merged it, or its head is
 * already contained in the integration branch.
 */
export const pullRequestLanded = (facts: {
	readonly merged: boolean;
	readonly headContained: boolean;
}): boolean => facts.merged || facts.headContained;
