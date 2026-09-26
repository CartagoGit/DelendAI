/**
 * review-claims.service.ts — who is already reviewing which proposal.
 *
 * Reviewers work as a swarm: each takes a proposal, reviews it in its own
 * unit of work and publishes its verdicts. The claim is the unit itself.
 * `work enter --proposal=<id> --slice=review` creates the reviewer's work
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

import { REVIEW_UNIT_SLICES } from '../contracts/constants/review-claims.constant';
import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';

const bare = (prefix: string): string => {
	const trimmed = prefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '')
		.replace(/^\/+|\/+$/gu, '');
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

/** Proposal id (lower case) → the agents holding a review unit on it. */
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

export const reviewClaims = async (
	run: IGitRunner,
	shape: IWorkRefShape,
	integration?: string,
): Promise<ReadonlyMap<string, readonly string[]>> => {
	const claims = new Map<string, string[]>();
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
			!REVIEW_UNIT_SLICES.has(identity.slice.toLowerCase())
		) {
			continue;
		}
		const key = identity.proposal.toLowerCase();
		const agents = claims.get(key) ?? [];
		if (!agents.includes(identity.agent)) agents.push(identity.agent);
		claims.set(key, agents);
	}
	return claims;
};
