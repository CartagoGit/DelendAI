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
export const reviewClaims = async (
	run: IGitRunner,
	shape: IWorkRefShape,
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
		'--format=%(refname)',
		'refs/heads/',
		'refs/remotes/',
	]);
	if (!listed.ok) return claims;
	const publication = bare(shape.publicationRefPrefix);
	for (const line of listed.output.split('\n')) {
		const ref = workRefFor(line.trim(), work, publication);
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
