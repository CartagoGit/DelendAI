/**
 * readiness.ts — whether a pull request is ready, in what order the ready
 * ones move, and what happens to each open candidate.
 *
 * The queue moves one candidate at a time, and `queueOrder` leaves red
 * candidates out of it, which is right: a red candidate cannot merge. But
 * nothing else looked at them either, and a candidate can be red for a
 * reason that is not its own (on 2026-09-25 the integration branch
 * carried a test that expired with the calendar, and four candidates
 * stayed red for hours). `candidateDispositions` says, for every
 * candidate, what happens to it: a queued one is brought forward as soon
 * as the integration branch changes a file it changes too; a red one
 * judged against a branch that has since moved is brought forward once for
 * a fresh verdict; red again, it is its author's; an author who is gone
 * leaves it `orphaned`, which anyone may adopt.
 */
import { REGENERATION_FIXES_CHECKS } from './readiness.constant';
import type {
	ICandidateState,
	ICandidateVerdict,
	IPullRequestChecks,
	IQueueCandidateFacts,
} from './readiness.interface';
import { underPublication } from './namespaces.helper';

/**
 * Whether a pull request is ready to land: not a draft, every required
 * check green on its head (a missing or pending one is not green), and no
 * label that blocks it.
 */
export const pullRequestReady = (facts: IPullRequestChecks): boolean =>
	!facts.draft &&
	facts.required.every((name) =>
		facts.checks.some(
			(check) => check.name === name && check.conclusion === 'success',
		),
	) &&
	!facts.labels.some((label) => facts.blockingLabels.includes(label));

/** One position rule for every ordering of candidates: urgent first, then oldest. */
export const byQueuePosition = (
	a: Pick<IQueueCandidateFacts, 'number' | 'urgent'>,
	b: Pick<IQueueCandidateFacts, 'number' | 'urgent'>,
): number =>
	Number(b.urgent !== undefined) - Number(a.urgent !== undefined) ||
	a.number - b.number;

/**
 * The queue itself: the pull requests this model produced that are ready
 * (not drafts) and not red (they would never merge), urgent ones first
 * (`work deliver --urgent`), then oldest first.
 * Conflicting ones keep their place: a conflict confined to derived
 * files is resolved by the machine that brings candidates forward.
 */
export const queueOrder = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string | readonly string[],
): readonly IQueueCandidateFacts[] =>
	[...candidates]
		.filter(
			(candidate) =>
				underPublication(candidate.headRef, publicationPrefix) &&
				!candidate.draft &&
				!candidate.red,
		)
		.sort(byQueuePosition);

/**
 * The candidate that moves next: the oldest one in the queue that is not
 * conflicting — the forge cannot merge a conflicting one. `undefined`
 * when none is.
 */
export const queueHead = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string | readonly string[],
): IQueueCandidateFacts | undefined =>
	queueOrder(candidates, publicationPrefix).find(
		(candidate) => !candidate.conflicting,
	);

/**
 * Whether regenerating the derived files is what this red candidate
 * needs: every failing check is one a stale derived file fails, at least
 * one of them names the drift itself (not only the aggregate), and the
 * candidate was not regenerated already. Red again after a regeneration,
 * it is its author's, so nothing loops.
 */
const regenerationFixes = (candidate: ICandidateState): boolean => {
	const failing = candidate.failing ?? [];
	return (
		!candidate.headIsRegeneration &&
		failing.some((name) => REGENERATION_FIXES_CHECKS.drift.has(name)) &&
		failing.every(
			(name) =>
				REGENERATION_FIXES_CHECKS.drift.has(name) ||
				REGENERATION_FIXES_CHECKS.aggregates.has(name),
		)
	);
};

/** Every candidate under the publication prefix, urgent first, then oldest, with what happens to it. */
export const candidateDispositions = (
	candidates: readonly ICandidateState[],
	publicationPrefix: string | readonly string[],
): readonly ICandidateVerdict[] => {
	const head = queueHead(candidates, publicationPrefix);
	return [...candidates]
		.filter((candidate) =>
			underPublication(candidate.headRef, publicationPrefix),
		)
		.sort(byQueuePosition)
		.map((candidate): ICandidateVerdict => {
			const base = {
				number: candidate.number,
				headRef: candidate.headRef,
			};
			if (candidate.draft) {
				return {
					...base,
					disposition: 'draft',
					why: 'a draft is not ready',
				};
			}
			if (candidate.red && regenerationFixes(candidate)) {
				return {
					...base,
					disposition: 'regenerate',
					why: `red only on ${(candidate.failing ?? []).join(', ')}, which a stale derived file fails; its derived files are regenerated once`,
				};
			}
			if (candidate.red) {
				return candidate.behind && !candidate.headIsIntegrationMerge
					? {
							...base,
							disposition: 'refresh-for-verdict',
							why: 'red against an integration branch that has moved since; brought forward once for a fresh verdict',
						}
					: candidate.authorGone !== undefined
						? {
								...base,
								disposition: 'orphaned',
								why: `red, and its author is gone (${candidate.authorGone}); brought forward a bounded number of times, and anyone may adopt it`,
							}
						: {
								...base,
								disposition: 'author',
								why: candidate.behind
									? 'red again after being brought forward; its author pushes next'
									: 'red against the current integration branch; its author pushes next',
							};
			}
			if (candidate.number === head?.number) {
				return {
					...base,
					disposition: 'moves-next',
					why: 'the head of the queue',
				};
			}
			if (candidate.behind && candidate.overlapping.length > 0) {
				return {
					...base,
					disposition: 'refresh-for-overlap',
					why: `the integration branch changed files it changes too (${candidate.overlapping.slice(0, 3).join(', ')}${candidate.overlapping.length > 3 ? ', …' : ''}); brought forward now`,
				};
			}
			return {
				...base,
				disposition: 'queued',
				why: candidate.conflicting
					? 'waiting its turn; a conflict in derived files is resolved when it comes'
					: 'waiting its turn',
			};
		});
};

/** The orphaned candidates, for the hydrator's bounded rescue. */
export const orphanedCandidates = (
	verdicts: readonly ICandidateVerdict[],
): readonly string[] =>
	verdicts
		.filter((verdict) => verdict.disposition === 'orphaned')
		.map((verdict) => verdict.headRef);

/**
 * The candidates an agent brings forward itself: its own publications the
 * queue hands back to their author ("red again after being brought
 * forward; its author pushes next"). Nothing else asked the author, so
 * they waited for an owner machine that might be off.
 */
export const authorsOwn = (
	verdicts: readonly ICandidateVerdict[],
	publicationPrefix: string | readonly string[],
	agent: string,
): readonly string[] =>
	verdicts
		.filter(
			(verdict) =>
				verdict.disposition === 'author' &&
				underPublication(
					verdict.headRef,
					publicationPrefix,
					`${agent}/`,
				),
		)
		.map((verdict) => verdict.headRef);

/**
 * The candidates the hydrator brings forward this pass besides the head:
 * red ones owed a fresh verdict, and queued ones something moved under.
 */
export const toBringForward = (
	verdicts: readonly ICandidateVerdict[],
): readonly string[] =>
	verdicts
		.filter(
			(verdict) =>
				verdict.disposition === 'refresh-for-verdict' ||
				verdict.disposition === 'regenerate' ||
				verdict.disposition === 'refresh-for-overlap',
		)
		.map((verdict) => verdict.headRef);
