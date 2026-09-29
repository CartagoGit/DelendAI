/**
 * review-claims.service.ts — who is already reviewing which proposal.
 *
 * Reviewers work as a swarm: each takes a proposal, reviews it in its own
 * unit of work and publishes its verdicts. The claim is the unit itself.
 * `work enter --kind=review --proposal=<id> --slice=all` creates the reviewer's work
 * ref and worktree, and only one agent can hold a unit, so no lock
 * store is needed. A published unit still holds the proposal until its
 * pull request merges, because its verdicts are not on the integration
 * branch yet.
 *
 * Without this, every reviewer was handed the same oldest proposals: on
 * 2026-09-26 two reviewers collided entering `f00394-close`, and one of
 * them waited on the other's lock on the same proposal file.
 */
import { compileWorkRefParser } from '@delendai/core/public';

import {
	REVIEW_BATCH_ID,
	REVIEW_CLAIM_TRAILER,
} from '../contracts/constants/review-claims.constant';
import type { IReviewClaimHolder } from '../contracts/interfaces/review-claim-holder.interface';
import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';

/** `value` without slashes at either end; a loop, not a backtracking regex. */
const trimSlashes = (value: string): string => {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === '/') start += 1;
	while (end > start && value[end - 1] === '/') end -= 1;
	return value.slice(start, end);
};

const bare = (prefix: string): string => {
	const trimmed = trimSlashes(
		prefix.replace(/^refs\//u, '').replace(/^heads\//u, ''),
	);
	return trimmed.length === 0 ? '' : `${trimmed}/`;
};

/**
 * The work ref a listed ref stands for: a local or remote-tracking work
 * ref, or a publication ref mapped back (the publisher derives it by
 * swapping the in-progress segment). `undefined` for anything else.
 */
export const workRefFor = (
	refName: string,
	work: string,
	publication: string,
): string | undefined => {
	const logical = refName
		.replace(/^refs\/heads\//u, '')
		.replace(/^refs\/remotes\/[^/]+\//u, '');
	if (work.length > 0 && logical.startsWith(work))
		return `refs/heads/${logical}`;
	if (publication.length > 0 && logical.startsWith(publication)) {
		return `refs/heads/${work}${logical.slice(publication.length)}`;
	}
	return undefined;
};

/**
 * The unit a ref names, `refs/heads/<work ref>`, whether it is read as a
 * local branch, a remote one or its publication: one identity per unit.
 */
export const unitOfRef = (
	refName: string,
	shape: IWorkRefShape,
): string | undefined =>
	workRefFor(
		refName,
		bare(shape.workRefPrefix),
		bare(shape.publicationRefPrefix),
	);

/**
 * The refs whose work the integration branch already holds. A review
 * unit whose verdicts merged has ended: its local ref, a spent publication
 * ref not yet reaped, or a remote-tracking copy nobody pruned would
 * otherwise hold the proposal forever.
 */
const endedRefs = async (
	run: IGitRunner,
	integration: string | undefined,
): Promise<ReadonlySet<string>> => {
	if (integration === undefined || integration.length === 0) {
		return new Set();
	}
	// The local integration branch, and what it tracks: verdicts merge on
	// the remote first, and a local branch not yet brought level would
	// keep a finished review holding its proposal.
	const ended = new Set<string>();
	for (const base of [integration, `${integration}@{upstream}`]) {
		const merged = await run([
			'for-each-ref',
			`--merged=${base}`,
			'--format=%(refname)',
			'refs/heads/',
			'refs/remotes/',
		]);
		if (!merged.ok) continue;
		for (const line of merged.output.split('\n')) ended.add(line.trim());
	}
	return ended;
};

/** Proposal id (lower case) → the review units holding it, and their agents. */
export const reviewClaims = async (
	run: IGitRunner,
	shape: IWorkRefShape,
	integration?: string,
): Promise<ReadonlyMap<string, readonly IReviewClaimHolder[]>> => {
	const claims = new Map<string, IReviewClaimHolder[]>();
	const parser = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
	);
	const work = bare(shape.workRefPrefix);
	if (parser === undefined || work.length === 0) return claims;
	const listed = await run([
		'for-each-ref',
		'--format=%(refname) %(worktreepath)',
		'refs/heads/',
		'refs/remotes/',
	]);
	if (!listed.ok) return claims;
	const ended = await endedRefs(run, integration);
	const publication = bare(shape.publicationRefPrefix);
	for (const line of listed.output.split('\n')) {
		// A ref name holds no space; a worktree path may, so split once.
		const trimmed = line.trim();
		const space = trimmed.indexOf(' ');
		const name = space === -1 ? trimmed : trimmed.slice(0, space);
		const worktree = space === -1 ? '' : trimmed.slice(space + 1);
		// A unit checked out in a worktree is live even before its first
		// commit, when its tip is still the integration branch's.
		if (worktree.length === 0 && ended.has(name)) continue;
		const ref = workRefFor(name, work, publication);
		if (ref === undefined) continue;
		const identity = parser.parse(ref);
		if (
			identity === undefined ||
			identity.agent.length === 0 ||
			// The ref's kind (f00644); a ref written before the shape named
			// its kind has it derived from its old `review`/`close` slice.
			identity.kind !== 'review'
		) {
			continue;
		}
		const held =
			identity.proposal.toLowerCase() === REVIEW_BATCH_ID
				? await batchClaims(run, name, integration)
				: [identity.proposal];
		for (const proposal of held) {
			const key = proposal.toLowerCase();
			const holders = claims.get(key) ?? [];
			if (!holders.some((holder) => holder.unit === ref)) {
				holders.push({ agent: identity.agent, unit: ref });
			}
			claims.set(key, holders);
		}
	}
	return claims;
};

/**
 * The proposals a review batch has claimed: the `Claims:` trailers of the
 * commits it carries beyond the integration branch. A batch reviews many
 * proposals on one branch (f00644), so its name cannot say which; its
 * own commits do, and a claim is made by committing it before reading.
 */
const batchClaims = async (
	run: IGitRunner,
	ref: string,
	integration: string | undefined,
): Promise<readonly string[]> => {
	const range =
		integration === undefined || integration.length === 0
			? ref
			: `${integration}..${ref}`;
	const log = await run([
		'log',
		`--format=%(trailers:key=${REVIEW_CLAIM_TRAILER},valueonly)`,
		range,
	]);
	if (!log.ok) return [];
	return log.output
		.split('\n')
		.flatMap((line) => line.split(','))
		.map((id) => id.trim())
		.filter((id) => /^[a-z]\d{5}$/iu.test(id));
};
