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

import {
	REVIEW_BATCH_ID,
	CLAIM_TRAILERS_FORMAT,
} from '../contracts/constants/review-claims.constant';
import type { IReviewClaimHolder } from '../contracts/interfaces/review-claim-holder.interface';
import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import {
	compileOwnedWorkRefParser,
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	shortName,
} from '@delendai/core/cli';

/** `value` without slashes at either end; a loop, not a backtracking regex. */
const trimSlashes = (value: string): string => {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === '/') start += 1;
	while (end > start && value[end - 1] === '/') end -= 1;
	return value.slice(start, end);
};

const bare = (prefix: string): string => {
	const trimmed = trimSlashes(shortName(prefix));
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
 * The branch settings of a shape in the form core's owned-namespace readers
 * take: a shape that names no namespaces owns only its current prefixes.
 */
export const ownedBranchesOf = (shape: IWorkRefShape) => ({
	namespacePrefix: shape.namespacePrefix ?? '',
	formerNamespacePrefixes: shape.formerNamespacePrefixes ?? [],
	workRefTemplate: shape.workRefTemplate,
	workRefPrefix: shape.workRefPrefix,
	publicationRefPrefix: shape.publicationRefPrefix,
	workRefVisibility:
		shape.workRefVisibility ??
		(/^(?:refs\/)?heads\//u.test(shape.workRefPrefix)
			? ('visible' as const)
			: ('hidden' as const)),
});

/** A parser over every namespace the shape owns, current and former. */
export const ownedParserOf = (
	shape: IWorkRefShape,
	options?: Parameters<typeof compileOwnedWorkRefParser>[1],
) => compileOwnedWorkRefParser(ownedBranchesOf(shape), options);

/** The work and publication prefix of each owned namespace, in step. */
export const ownedPrefixPairs = (
	shape: IWorkRefShape,
): readonly { readonly work: string; readonly publication: string }[] => {
	const branches = ownedBranchesOf(shape);
	const publications = ownedPublicationRefPrefixes(branches);
	return ownedWorkRefPrefixes(branches).map((work, at) => ({
		work: bare(work),
		publication: bare(publications[at] ?? ''),
	}));
};

/**
 * The work ref a listed ref stands for in whichever owned namespace holds
 * it: a unit under a former namespace is read like a current one (f00808).
 */
export const ownedWorkRefFor = (
	refName: string,
	shape: IWorkRefShape,
): string | undefined => {
	for (const { work, publication } of ownedPrefixPairs(shape)) {
		const found = workRefFor(refName, work, publication);
		if (found !== undefined) return found;
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
): string | undefined => ownedWorkRefFor(refName, shape);

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
	/** Whether the unit at a ref still holds what it claimed; all do when absent. */
	holding?: (ref: string) => boolean,
): Promise<ReadonlyMap<string, readonly IReviewClaimHolder[]>> => {
	const claims = new Map<string, IReviewClaimHolder[]>();
	const parser = ownedParserOf(shape);
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
	for (const line of listed.output.split('\n')) {
		// A ref name holds no space; a worktree path may, so split once.
		const trimmed = line.trim();
		const space = trimmed.indexOf(' ');
		const name = space === -1 ? trimmed : trimmed.slice(0, space);
		const worktree = space === -1 ? '' : trimmed.slice(space + 1);
		// A unit checked out in a worktree is live even before its first
		// commit, when its tip is still the integration branch's.
		if (worktree.length === 0 && ended.has(name)) continue;
		// A unit whose holder has gone quiet holds nothing; its work stays.
		if (holding !== undefined && !holding(name)) continue;
		const ref = ownedWorkRefFor(name, shape);
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
 * The proposals a unit still holds, from its commits newest first: each
 * line is one commit's `Claims` ids, a tab, and its `Releases` ids. The
 * newest word about a proposal decides, so a claim given back and taken
 * again is held.
 */
export const heldFromTrailers = (log: string): readonly string[] => {
	const decided = new Map<string, boolean>();
	const idsOf = (field: string): readonly string[] =>
		field
			.split(',')
			.map((id) => id.trim().toLowerCase())
			.filter((id) => /^[a-z]\d{5}$/u.test(id));
	for (const line of log.split('\n')) {
		const [claims = '', releases = ''] = line.split('\t');
		for (const id of idsOf(releases)) {
			if (!decided.has(id)) decided.set(id, false);
		}
		for (const id of idsOf(claims)) {
			if (!decided.has(id)) decided.set(id, true);
		}
	}
	return [...decided].filter(([, held]) => held).map(([id]) => id);
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
	const log = await run(['log', CLAIM_TRAILERS_FORMAT, range]);
	return log.ok ? heldFromTrailers(log.output) : [];
};
