/**
 * review-reservation.service.ts — one reviewer holds a proposal, and the
 * forge is where that is decided.
 *
 * A claim was a commit in the reviewer's own unit. Two reviewers claiming
 * the same proposal in the same minute each saw no claim but their own,
 * because the other's commit had reached nobody yet: twelve proposals of
 * one run were claimed twice, judged twice, and their pull requests
 * disagreed about where the proposal lived.
 *
 * So a claim is first a ref on the forge, created by a push that only one
 * of two can win. The commit it points at names the holder's unit, so two
 * instances of one model are two holders. It holds for a few hours and is
 * renewed by its holder; after that another reviewer may take it over, so
 * a reviewer that went away keeps nothing.
 */
import { randomUUID } from 'node:crypto';

import {
	REVIEW_RESERVATION_NAMESPACE,
	REVIEW_RESERVATION_SECONDS,
} from '../contracts/constants/review-reservation.constant';
import type {
	IReviewReservation,
	IReviewReservationHolder,
} from '../contracts/interfaces/review-reservation.interface';
import type { IGitRunner } from '../shared/git-runner';

/** The holder a reservation commit names, and when it was made. */
const holderOf = (
	message: string,
): { readonly unit: string; readonly agent: string } => ({
	unit: /^Unit: (?<unit>.+)$/mu.exec(message)?.groups?.unit ?? '',
	agent: /^Agent: (?<agent>.+)$/mu.exec(message)?.groups?.agent ?? '',
});

/**
 * Reserve `proposalId` for `holder` on the forge. Reserved when the ref
 * was created, when this unit already held it, or when its holder let it
 * lapse; taken when another unit holds it now.
 */
export const reserveReview = async (
	run: IGitRunner,
	proposalId: string,
	holder: IReviewReservationHolder,
	now: number = Math.floor(Date.now() / 1000),
): Promise<IReviewReservation> => {
	const url = await run(['remote', 'get-url', 'origin']);
	const tree = await run(['rev-parse', 'HEAD^{tree}']);
	if (!url.ok || !tree.ok) return { kind: 'unavailable' };
	const remote = url.output.trim();
	const ref = `${REVIEW_RESERVATION_NAMESPACE}${proposalId.toLowerCase()}`;
	// A commit of its own each time: two units pushing the same object to
	// one ref would both be told "up to date".
	const commit = await run([
		'-c',
		'user.name=delendai',
		'-c',
		'user.email=delendai@localhost',
		'commit-tree',
		tree.output.trim(),
		'-m',
		`review claim ${proposalId} ${randomUUID()}\n\nUnit: ${holder.unit}\nAgent: ${holder.agent}`,
	]);
	if (!commit.ok) return { kind: 'unavailable' };
	const mine = commit.output.trim();
	// `send-pack`, not `push`: a bookkeeping ref, not work to be gated.
	if ((await run(['send-pack', remote, `${mine}:${ref}`])).ok) {
		return { kind: 'reserved' };
	}
	const held = await run(['ls-remote', remote, ref]);
	const current = held.ok ? (held.output.split('\t')[0] ?? '').trim() : '';
	if (current.length === 0) return { kind: 'unavailable' };
	if (!(await run(['fetch', '--quiet', remote, ref])).ok) {
		return { kind: 'unavailable' };
	}
	const shown = await run(['log', '-1', '--format=%ct%n%B', current]);
	if (!shown.ok) return { kind: 'unavailable' };
	const [stamp = '0', ...body] = shown.output.split('\n');
	const theirs = holderOf(body.join('\n'));
	const lapsed = now - Number(stamp) > REVIEW_RESERVATION_SECONDS;
	if (theirs.unit !== holder.unit && !lapsed) {
		return { kind: 'taken', ...theirs };
	}
	// Ours to renew, or theirs and lapsed: replace exactly what we read, so
	// a third unit doing the same at this moment makes one of us lose.
	const replaced = await run([
		'-c',
		'core.hooksPath=/dev/null',
		'push',
		'--quiet',
		`--force-with-lease=${ref}:${current}`,
		remote,
		`${mine}:${ref}`,
	]);
	return replaced.ok
		? { kind: 'reserved' }
		: { kind: 'taken', unit: theirs.unit, agent: theirs.agent };
};

/** Give a reservation back: the proposal is free for the next reviewer. */
export const releaseReview = async (
	run: IGitRunner,
	proposalId: string,
	holder: IReviewReservationHolder,
): Promise<boolean> => {
	const url = await run(['remote', 'get-url', 'origin']);
	if (!url.ok) return false;
	const remote = url.output.trim();
	const ref = `${REVIEW_RESERVATION_NAMESPACE}${proposalId.toLowerCase()}`;
	const held = await run(['ls-remote', remote, ref]);
	const current = held.ok ? (held.output.split('\t')[0] ?? '').trim() : '';
	if (current.length === 0) return false;
	if (!(await run(['fetch', '--quiet', remote, ref])).ok) return false;
	const shown = await run(['log', '-1', '--format=%B', current]);
	if (!shown.ok || holderOf(shown.output).unit !== holder.unit) return false;
	return (
		await run([
			'-c',
			'core.hooksPath=/dev/null',
			'push',
			'--quiet',
			`--force-with-lease=${ref}:${current}`,
			remote,
			`:${ref}`,
		])
	).ok;
};
