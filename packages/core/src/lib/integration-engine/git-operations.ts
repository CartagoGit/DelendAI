/**
 * git-operations.ts — the real `IIntegrationGit`, built on the WIP
 * engine's scoped runner.
 *
 * It reuses `wip-engine/git-command.ts` rather than growing a second way
 * to invoke git in this package: that module already owns "never throw,
 * return `{ ok, reason }`", the timeout handling and the failure
 * flattening, and every one of those behaviours is load-bearing for a
 * caller that has to distinguish "the remote rejected the push" from
 * "git is not installed".
 *
 * `pushRef` prefers `--force-with-lease` over `--force`. The difference
 * is the whole point of the CAS: a lease refuses when the remote tip is
 * not what we last saw, so a rebase that raced with another agent's
 * checkpoint fails loudly instead of erasing it.
 */

import {
	createScopedGitRunner,
	resolveRevision as resolveGitRevision,
	resolveWorktreeRoot,
} from '../wip-engine/git-command';
import type {
	IDeleteRefRequest,
	IGitOpResult,
	IIntegrationGit,
	IPushRefRequest,
} from './git-port';

const OK: IGitOpResult = { ok: true, reason: '' };

const failure = (reason: string): IGitOpResult => ({ ok: false, reason });

/** Refspec for a push, honouring the lease when one was supplied. */
const pushArguments = (request: IPushRefRequest): readonly string[] => {
	const spec = `${request.localRef}:refs/heads/${request.branch}`;
	if (request.expectedRemoteSha !== undefined) {
		return [
			'push',
			`--force-with-lease=refs/heads/${request.branch}:${request.expectedRemoteSha}`,
			request.remote,
			spec,
		];
	}
	return request.force
		? ['push', '--force', request.remote, spec]
		: ['push', request.remote, spec];
};

/**
 * Bind the git port to the repository containing `cwd`. Returns
 * `undefined` outside a working tree — a caller that cannot reach git
 * must find that out here, not halfway through a merge.
 */
export const createIntegrationGit = async (
	cwd: string,
	timeoutMs?: number,
): Promise<IIntegrationGit | undefined> => {
	const probe = createScopedGitRunner(cwd, timeoutMs);
	const root = await resolveWorktreeRoot(probe);
	if (root === undefined || root.length === 0) return undefined;
	const run = createScopedGitRunner(root, timeoutMs);

	return {
		root,
		resolveRevision: (revision) => resolveGitRevision(run, revision),
		fetch: async (remote, refspec) => {
			const result = await run(['fetch', '--quiet', remote, refspec]);
			return result.ok ? OK : failure(result.reason ?? 'fetch failed');
		},
		pushRef: async (request: IPushRefRequest) => {
			const result = await run(pushArguments(request));
			return result.ok ? OK : failure(result.reason ?? 'push failed');
		},
		deleteRef: async (request: IDeleteRefRequest) => {
			const result = await run([
				'update-ref',
				'-d',
				request.ref,
				request.expectedSha,
			]);
			return result.ok
				? OK
				: failure(result.reason ?? 'ref delete refused');
		},
		isAncestor: async (ancestor, descendant) => {
			const result = await run([
				'merge-base',
				'--is-ancestor',
				ancestor,
				descendant,
			]);
			return result.ok;
		},
	};
};
