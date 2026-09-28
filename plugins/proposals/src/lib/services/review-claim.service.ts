/**
 * review-claim.service.ts — a review unit takes a proposal, one way.
 *
 * `review_claim` claims before reading, and a verdict recorded in a review
 * unit claims what it judges: a reviewer that skipped the claim still
 * holds the proposal it wrote a verdict on, and a verdict on a proposal
 * another unit holds is refused. Before this, two units of one model
 * could approve and reopen the same proposal, and their pull requests
 * then disagreed about where it lives.
 *
 * The claim is an empty commit carrying the `Claims` trailer. It is made
 * with `--only` and no paths, so nothing a call had staged rides along in
 * it; the verdict's own writes are committed after the call.
 */
import { compileWorkRefParser } from '@delendai/core/public';

import { REVIEW_CLAIM_TRAILER } from '../contracts/constants/review-claims.constant';
import type {
	IReviewClaimOutcome,
	IVerdictClaimRefusal,
} from '../contracts/interfaces/review-claim-outcome.interface';
import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import { reviewClaims, unitOfRef } from './review-claims.service';

/** The unit this checkout is on, and whether it is a review unit. */
const currentUnit = async (
	run: IGitRunner,
	shape: IWorkRefShape,
): Promise<{ readonly unit?: string; readonly review: boolean }> => {
	const branch = await run(['symbolic-ref', '-q', 'HEAD']);
	if (!branch.ok) return { review: false };
	const unit = unitOfRef(branch.output.trim(), shape);
	if (unit === undefined) return { review: false };
	const identity = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
	)?.parse(unit);
	return { unit, review: identity?.kind === 'review' };
};

/** True when the checkout the call runs in is a review unit. */
export const inReviewUnit = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
): Promise<boolean> =>
	shape !== undefined && (await currentUnit(run, shape)).review;

/**
 * Claim `proposalId` in the checkout's unit: refused while any other unit
 * holds it, a no-op when this one does.
 */
export const claimForReview = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
	proposalId: string,
	integration: string,
): Promise<IReviewClaimOutcome> => {
	const id = proposalId.toLowerCase();
	if (shape !== undefined) {
		const { unit } = await currentUnit(run, shape);
		const by = [
			...new Set(
				((await reviewClaims(run, shape, integration)).get(id) ?? [])
					.filter((holder) => holder.unit !== unit)
					.map((holder) => holder.agent),
			),
		];
		if (by.length > 0) return { kind: 'held', by };
	}
	const own = await run([
		'log',
		`--format=%(trailers:key=${REVIEW_CLAIM_TRAILER},valueonly)`,
		'HEAD',
		'--not',
		integration,
		'--',
	]);
	if (
		own.ok &&
		own.output.split('\n').some((line) => line.trim().toLowerCase() === id)
	) {
		return { kind: 'already-claimed' };
	}
	const committed = await run([
		'commit',
		'--only',
		'--allow-empty',
		'-q',
		'-m',
		`chore(review): claim ${proposalId}`,
		'--trailer',
		`${REVIEW_CLAIM_TRAILER}: ${proposalId}`,
	]);
	if (!committed.ok) {
		return { kind: 'failed', reason: committed.reason ?? 'git refused' };
	}
	const head = await run(['rev-parse', 'HEAD']);
	return {
		kind: 'claimed',
		...(head.ok ? { commit: head.output.trim() } : {}),
	};
};

/**
 * A verdict in a review unit claims what it judges. `undefined` when the
 * verdict may go on (claimed now, already held here, or not written in a
 * review unit at all); otherwise why not, and what to do instead.
 */
export const verdictClaimRefusal = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
	proposalId: string,
	integration: string,
	namespacePrefix: string,
): Promise<IVerdictClaimRefusal | undefined> => {
	if (!(await inReviewUnit(run, shape))) return undefined;
	const outcome = await claimForReview(run, shape, proposalId, integration);
	if (outcome.kind === 'held') {
		return {
			reason: `${proposalId} is held by another review unit (${outcome.by.join(', ')}); a verdict here would contradict theirs.`,
			nextAction: `Leave it to them, and take the next proposal ${namespacePrefix}_review_queue offers you.`,
		};
	}
	if (outcome.kind === 'failed') {
		return {
			reason: `Could not claim ${proposalId} before recording the verdict: ${outcome.reason}.`,
			nextAction: `Claim it with ${namespacePrefix}_review_claim in your review unit, then record the verdict.`,
		};
	}
	return undefined;
};
