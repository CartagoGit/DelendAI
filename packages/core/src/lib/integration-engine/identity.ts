/**
 * identity.ts — the deterministic names the integration cycle depends on.
 *
 * Idempotency is not a discipline the callers remember here; it is a
 * property of these two functions. The pull request is looked up by its
 * HEAD BRANCH, and the head branch is a pure function of the work ref, so
 * a second run of the same cycle finds the pull request the first run
 * opened instead of opening another. Nothing in the engine ever invents a
 * name from a clock, a counter or a random id.
 *
 * The repository uid deliberately reproduces the work model's
 * `repositoryUid` form (`github:acme/widgets`) so a row this engine
 * writes and a row the state model wrote key the same way.
 */

import type { IIntegrationRepositoryRef } from './types';

/** `github:acme/widgets` — stable across clones and machines. */
export const integrationRepositoryUid = (
	target: IIntegrationRepositoryRef,
): string => `${target.forge}:${target.owner}/${target.repository}`;

/**
 * The branch a work ref is published under.
 *
 * A WIP ref lives outside `refs/heads/` on purpose — it must never be a
 * checkout target locally. On the forge it has to be a branch, because
 * that is the only thing a pull request can have as a head. Stripping the
 * leading `refs/` keeps the two names obviously the same object
 * (`refs/wip/a/p-s-g1` → `wip/a/p-s-g1`) without ever making the LOCAL
 * ref a branch.
 */
export const candidateBranchName = (workRef: string): string =>
	workRef.replace(/^refs\/(heads\/)?/u, '');

/** Default pull request body: the facts, so a human can audit the merge. */
export const candidateBody = (args: {
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
}): string =>
	[
		`Proposal: ${args.proposalUid}`,
		`Slice: ${args.sliceUid}`,
		`Generation: ${String(args.generation)}`,
		`Base: ${args.baseIntegrationSha}`,
		`Patch digest: ${args.patchDigest}`,
		'',
		'Scope:',
		...args.fileScope.map((path) => `- ${path}`),
	].join('\n');
