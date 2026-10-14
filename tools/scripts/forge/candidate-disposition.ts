/**
 * candidate-disposition.ts — what happens to every open candidate, in one
 * place.
 *
 * The queue moves one candidate at a time, and `queueOrder` leaves red
 * candidates out of it, which is right: a red candidate cannot merge. But
 * nothing else looked at them either, and a candidate can be red for a
 * reason that is not its own. On 2026-09-25 the integration branch carried
 * a test that expired with the calendar; four candidates went red on it,
 * the fix merged, and those four stayed red for hours: out of the queue,
 * so never brought forward, so never run again, so red for good. Nobody
 * had said what should happen to them.
 *
 * This says it, for every candidate. A queued candidate is brought
 * forward as soon as the integration branch changes a file it changes
 * too, so an overlap surfaces while it is fresh instead of on its turn,
 * and one nothing moved under is left alone: merging would change nothing
 * it touches. A red candidate judged against an
 * integration branch that has since moved gets brought forward once, for
 * a fresh verdict. If it is red again after that, it is its author's, and
 * nothing touches it until the author pushes. So a genuinely red
 * candidate costs at most one merge of the integration branch per push of
 * its author, which keeps away the merge-per-merge maze that one-at-a-time
 * removed.
 */
import type {
	ICandidateState,
	ICandidateVerdict,
} from './candidate-disposition.interface';
import { REGENERATION_FIXES_CHECKS } from './candidate-disposition.constant';
import { queueHead } from './queue-order';

export type {
	ICandidateDisposition,
	ICandidateState,
	ICandidateVerdict,
} from './candidate-disposition.interface';

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

/** Every candidate under the publication prefix, oldest first, with what happens to it. */
export const candidateDispositions = (
	candidates: readonly ICandidateState[],
	publicationPrefix: string,
): readonly ICandidateVerdict[] => {
	const head = queueHead(candidates, publicationPrefix);
	return [...candidates]
		.filter((candidate) => candidate.headRef.startsWith(publicationPrefix))
		.sort((a, b) => a.number - b.number)
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
