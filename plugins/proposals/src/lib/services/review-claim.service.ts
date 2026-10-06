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

import {
	CLAIM_TRAILERS_FORMAT,
	REVIEW_CLAIM_TRAILER,
	REVIEW_PACK_SIZE,
	REVIEW_RELEASE_TRAILER,
} from '../contracts/constants/review-claims.constant';
import type {
	IReviewClaimOutcome,
	IVerdictClaimRefusal,
} from '../contracts/interfaces/review-claim-outcome.interface';
import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import {
	heldFromTrailers,
	reviewClaims,
	unitOfRef,
} from './review-claims.service';
import { releaseReview, reserveReview } from './review-reservation.service';

/** What a reviewer with a full pack does next. */
export const publishPackStep = (namespacePrefix: string): string =>
	`Publish the pack as its pull request: the \`work\` tool { action: "publish", kind: "review", proposal: "batch", slice: "all", agent } (or \`delendai review finish\`). Then enter a new review unit and ask ${namespacePrefix}_review_queue for the next proposal.`;

/** The unit this checkout is on, and whether it is a review unit. */
const currentUnit = async (
	run: IGitRunner,
	shape: IWorkRefShape,
): Promise<{
	readonly unit?: string;
	readonly review: boolean;
	readonly agent?: string;
}> => {
	const branch = await run(['symbolic-ref', '-q', 'HEAD']);
	if (!branch.ok) return { review: false };
	const unit = unitOfRef(branch.output.trim(), shape);
	if (unit === undefined) return { review: false };
	const identity = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
	)?.parse(unit);
	return {
		unit,
		review: identity?.kind === 'review',
		...(identity?.agent === undefined ? {} : { agent: identity.agent }),
	};
};

/**
 * The agent the checkout's review unit is named after, or `undefined`
 * outside a review unit. A pack is one reviewer's: a verdict in it is
 * signed by that reviewer.
 */
export const reviewUnitAgent = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
): Promise<string | undefined> => {
	if (shape === undefined) return undefined;
	const unit = await currentUnit(run, shape);
	return unit.review ? unit.agent : undefined;
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
		CLAIM_TRAILERS_FORMAT,
		'HEAD',
		'--not',
		integration,
		'--',
	]);
	const held = new Set(own.ok ? heldFromTrailers(own.output) : []);
	if (held.has(id)) return { kind: 'already-claimed' };
	if (held.size >= REVIEW_PACK_SIZE) {
		return { kind: 'pack-full', size: REVIEW_PACK_SIZE };
	}
	// The forge decides between two reviewers claiming at once: each one's
	// claim commit has reached nobody else yet (E15).
	if (shape !== undefined) {
		const { unit } = await currentUnit(run, shape);
		if (unit !== undefined) {
			const reservation = await reserveReview(run, proposalId, {
				unit,
				agent:
					compileWorkRefParser(
						shape.workRefTemplate,
						shape.workRefPrefix,
					)?.parse(unit)?.agent ?? '',
			});
			if (reservation.kind === 'taken') {
				return {
					kind: 'held',
					by: [reservation.agent || reservation.unit],
				};
			}
		}
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
 * verdict may go on (claimed now, already held here, or in a project
 * that has no work refs); otherwise why not, and what to do instead.
 */
export const verdictClaimRefusal = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
	proposalId: string,
	integration: string,
	namespacePrefix: string,
	/** `claim: false` checks where the verdict is written and claims nothing. */
	options: { readonly claim?: boolean } = {},
): Promise<IVerdictClaimRefusal | undefined> => {
	if (!(await inReviewUnit(run, shape))) {
		// A project with no work refs has no unit to write in. One that has
		// them keeps every verdict in its reviewer's unit: written anywhere
		// else, it sits in a tree other agents are editing, is committed by
		// whoever commits there next, and reaches no pull request.
		return shape === undefined || shape.workRefTemplate.length === 0
			? undefined
			: {
					reason: `A verdict on ${proposalId} is recorded in the reviewer's own review unit, and this checkout is not one.`,
					nextAction: `Enter your review unit — the \`work\` tool { action: "enter", kind: "review", proposal: "batch", slice: "all", agent } (or \`delendai review next --agent=<you>\`) — and pass the worktree it gives you as \`checkout\`. Nothing was written here.`,
				};
	}
	if (options.claim === false) return undefined;
	const outcome = await claimForReview(run, shape, proposalId, integration);
	if (outcome.kind === 'held') {
		return {
			reason: `${proposalId} is held by another review unit (${outcome.by.join(', ')}); a verdict here would contradict theirs.`,
			nextAction: `Leave it to them, and take the next proposal ${namespacePrefix}_review_queue offers you.`,
		};
	}
	if (outcome.kind === 'pack-full') {
		return {
			reason: `Your review unit already holds a full pack (${String(outcome.size)} proposals), and ${proposalId} is not one of them.`,
			nextAction: publishPackStep(namespacePrefix),
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

/**
 * Give `proposalId` back from the checkout's review unit: a commit that
 * says so, and the forge's reservation with it. For a reviewer that could
 * not inspect or run what it claimed: it has no verdict to record, and a
 * verdict recorded anyway sent finished work back to its implementer.
 */
export const releaseClaim = async (
	run: IGitRunner,
	shape: IWorkRefShape | undefined,
	proposalId: string,
	integration: string,
	why: string,
): Promise<
	| { readonly kind: 'released'; readonly commit?: string }
	| { readonly kind: 'not-held' }
	| { readonly kind: 'failed'; readonly reason: string }
> => {
	if (shape === undefined) return { kind: 'not-held' };
	const { unit, review } = await currentUnit(run, shape);
	if (unit === undefined || !review) return { kind: 'not-held' };
	const own = await run([
		'log',
		CLAIM_TRAILERS_FORMAT,
		'HEAD',
		'--not',
		integration,
		'--',
	]);
	const held = own.ok ? heldFromTrailers(own.output) : [];
	if (!held.includes(proposalId.toLowerCase())) return { kind: 'not-held' };
	const committed = await run([
		'commit',
		'--only',
		'--allow-empty',
		'-q',
		'-m',
		`chore(review): release ${proposalId}\n\n${why}`,
		'--trailer',
		`${REVIEW_RELEASE_TRAILER}: ${proposalId}`,
	]);
	if (!committed.ok) {
		return { kind: 'failed', reason: committed.reason ?? 'git refused' };
	}
	await releaseReview(run, proposalId, {
		unit,
		agent:
			compileWorkRefParser(
				shape.workRefTemplate,
				shape.workRefPrefix,
			)?.parse(unit)?.agent ?? '',
	});
	const head = await run(['rev-parse', 'HEAD']);
	return {
		kind: 'released',
		...(head.ok ? { commit: head.output.trim() } : {}),
	};
};
