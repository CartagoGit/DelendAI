/**
 * git-operations.ts — the real `IIntegrationGit`, built on the WIP
 * engine's scoped runner.
 *
 * It reuses `wip-engine/git-command.ts` rather than growing a second way
 * to invoke git in this package: that module already owns "never throw,
 * return `{ ok, reason }`", the timeout handling and the gitFailure
 * flattening, and every one of those behaviours is load-bearing for a
 * caller that has to distinguish "the remote rejected the push" from
 * "git is not installed".
 *
 * `pushRef` prefers `--force-with-lease` over `--force`. The difference
 * is the whole point of the CAS: a lease refuses when the remote tip is
 * not what we last saw, so a rebase that raced with another agent's
 * checkpoint fails loudly instead of erasing it.
 */

import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
} from './git-port.interface';

const OK: IGitOpResult = { ok: true, reason: '' };

const gitFailure = (reason: string): IGitOpResult => ({ ok: false, reason });

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
			return result.ok ? OK : gitFailure(result.reason ?? 'fetch failed');
		},
		pushRef: async (request: IPushRefRequest) => {
			const result = await run(pushArguments(request));
			return result.ok ? OK : gitFailure(result.reason ?? 'push failed');
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
				: gitFailure(result.reason ?? 'ref delete refused');
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
		mergeCommit: async (request) => {
			// Plumbing only, in a throwaway index. `git merge` would move
			// HEAD and rewrite files in a tree other agents are editing,
			// which is the one thing this port promises never to do.
			//
			// `read-tree -m --aggressive` resolves what is unambiguous and
			// leaves the rest as conflict stages; `write-tree` refuses an
			// index that still has any, and THAT refusal is the conflict
			// answer. `merge-tree --write-tree` would be cleaner and needs
			// git 2.38; a tool that only works on the newest git is a tool
			// that fails on somebody's laptop.
			const already = await run([
				'merge-base',
				'--is-ancestor',
				request.incoming,
				request.base,
			]);
			if (already.ok) return { kind: 'up-to-date' };

			const index = join(
				tmpdir(),
				`delendai-merge-${String(process.pid)}-${String(Date.now())}.index`,
			);
			// The runner already takes a per-call env, so the throwaway
			// index is scoped to these calls and to nothing else.
			const scoped = (args: readonly string[]): ReturnType<typeof run> =>
				run(args, { GIT_INDEX_FILE: index });
			try {
				const base = await scoped([
					'merge-base',
					request.base,
					request.incoming,
				]);
				if (!base.ok) {
					return {
						kind: 'failed',
						reason: base.reason ?? 'no merge base',
					};
				}
				const read = await scoped([
					'read-tree',
					'-m',
					'--aggressive',
					base.output.trim(),
					request.base,
					request.incoming,
				]);
				if (!read.ok) {
					return { kind: 'conflict', paths: [] };
				}
				const unmerged = await scoped(['ls-files', '--unmerged']);
				const paths = [
					...new Set(
						unmerged.output
							.split('\n')
							.filter((line: string) => line.trim() !== '')
							.map((line: string) => line.split('\t')[1] ?? ''),
					),
				].filter((path) => path !== '');
				if (paths.length > 0) return { kind: 'conflict', paths };

				const tree = await scoped(['write-tree']);
				if (!tree.ok) return { kind: 'conflict', paths: [] };
				const commit = await scoped([
					'commit-tree',
					tree.output.trim(),
					'-p',
					request.base,
					'-p',
					request.incoming,
					'-m',
					request.message,
				]);
				return commit.ok
					? { kind: 'merged', sha: commit.output.trim() }
					: {
							kind: 'failed',
							reason: commit.reason ?? 'commit-tree failed',
						};
			} finally {
				await rm(index, { force: true });
			}
		},
	};
};
