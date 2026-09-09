/**
 * rebase.ts — `rebaseWipOntoNewBase`: replay a checkpoint onto a newer
 * integration commit without a working tree, without HEAD, and without
 * `git rebase`.
 *
 * This is the operation recovery depends on. Work parked on a WIP ref
 * ages: by the time somebody resumes it, integration has moved on, and
 * the ref has to be re-expressed against the new base before it can be
 * judged, tested or merged. `git rebase` would do it by checking the ref
 * out and replaying commits through the working tree — impossible here,
 * because the checkout belongs to the integration branch and to every
 * other agent editing it.
 *
 * So the replay is a three-way tree merge into a temporary index
 * (`read-tree -m --aggressive`), with the entries git leaves unmerged
 * handed to `merge-resolve.ts` for a blob-level text merge. What comes
 * out is a tree, which becomes a commit parented on the new base, which
 * becomes the ref's new tip.
 *
 * A conflict is a RESULT, never a throw and never an auto-resolution:
 * the ref keeps pointing at the old checkpoint (nothing is lost), and the
 * conflicting paths are named so a human or another agent can decide.
 */

import { createCommit, updateRef } from './commit';
import type { IWipEngineContext } from './checkpoint';
import { gitOutput, resolveRevision, withTemporaryIndex } from './git-command';
import { resolveUnmergedPaths } from './merge-resolve';
import { computePatchDigest, parseObjectListing } from './patch-digest';
import { parseScopeTrailers, withScopeTrailers } from './scope';
import type { IWipRebaseRequest, IWipRebaseResult } from './types';

const failed = (ref: string, reason: string): IWipRebaseResult => ({
	status: 'failed',
	ref,
	commit: '',
	tree: '',
	patchDigest: '',
	conflicts: [],
	reason,
});

/** Drop the engine's own trailers so a replay does not accumulate them. */
const stripTrailers = (message: string): string =>
	message
		.split('\n')
		.filter((line) => !/^Delendai-Wip-(Scope|Digest):/u.test(line.trim()))
		.join('\n')
		.trimEnd();

/** Digest of a commit's recorded scope, read straight from its tree. */
const digestOfScope = async (
	run: IWipEngineContext['run'],
	commit: string,
	scope: readonly string[],
): Promise<string> => {
	const listing =
		(await gitOutput(run, ['ls-tree', '-r', commit, '--', ...scope])) ?? '';
	return computePatchDigest(scope, parseObjectListing(listing));
};

/**
 * Replay `ref` from `oldBase` onto `newBase`. On success the ref points at
 * a new commit whose only parent is `newBase`; on conflict the ref is left
 * exactly where it was and the conflicting paths are reported.
 */
export const rebaseWipOntoNewBase = async (
	context: IWipEngineContext,
	request: IWipRebaseRequest,
): Promise<IWipRebaseResult> => {
	const { run } = context;
	const tip = await resolveRevision(run, request.ref);
	if (tip === undefined)
		return failed(request.ref, `unknown ref: ${request.ref}`);
	const oldBase = await resolveRevision(run, request.oldBase);
	if (oldBase === undefined) {
		return failed(request.ref, `unknown old base: ${request.oldBase}`);
	}
	const newBase = await resolveRevision(run, request.newBase);
	if (newBase === undefined) {
		return failed(request.ref, `unknown new base: ${request.newBase}`);
	}

	const message = await gitOutput(run, ['log', '-1', '--format=%B', tip]);
	if (message === undefined) {
		return failed(request.ref, `cannot read the commit message of ${tip}`);
	}
	const scope = parseScopeTrailers(message);
	if (scope.length === 0) {
		return failed(
			request.ref,
			`${request.ref} records no scope: it was not written by the WIP engine`,
		);
	}

	if (oldBase === newBase) {
		const tree =
			(await gitOutput(run, ['rev-parse', `${tip}^{tree}`])) ?? '';
		return {
			status: 'unchanged',
			ref: request.ref,
			commit: tip,
			tree,
			patchDigest: await digestOfScope(run, tip, scope),
			conflicts: [],
		};
	}

	return withTemporaryIndex(run, async (indexRun) => {
		const merged = await indexRun([
			'read-tree',
			'-m',
			'--aggressive',
			oldBase,
			newBase,
			tip,
		]);
		if (!merged.ok) {
			return failed(
				request.ref,
				`git read-tree -m failed: ${merged.reason ?? 'unknown'}`,
			);
		}

		const resolution = await resolveUnmergedPaths(run, indexRun);
		if (resolution.conflicts.length > 0) {
			return {
				status: 'RECOVERY_CONFLICT',
				ref: request.ref,
				commit: '',
				tree: '',
				patchDigest: '',
				conflicts: resolution.conflicts,
				reason: `cannot replay ${request.ref} onto ${newBase}: ${resolution.conflicts.join(', ')}`,
			};
		}
		if (resolution.reason !== undefined) {
			return failed(request.ref, resolution.reason);
		}

		const listing =
			(await gitOutput(indexRun, ['ls-files', '-s', '--', ...scope])) ??
			'';
		const patchDigest = computePatchDigest(
			scope,
			parseObjectListing(listing),
		);

		const tree = await gitOutput(indexRun, ['write-tree']);
		if (tree === undefined)
			return failed(request.ref, 'git write-tree failed');

		const commit = await createCommit(run, {
			tree,
			parents: [newBase],
			message: withScopeTrailers(
				stripTrailers(request.message ?? message),
				scope,
				patchDigest,
			),
			...(request.author !== undefined ? { author: request.author } : {}),
		});
		if (commit === undefined) {
			return failed(request.ref, 'git commit-tree failed');
		}

		const moved = await updateRef(run, request.ref, commit, tip);
		if (!moved.ok) {
			return failed(
				request.ref,
				`git update-ref failed: ${moved.reason ?? 'unknown'}`,
			);
		}

		return {
			status: 'rebased',
			ref: request.ref,
			commit,
			tree,
			patchDigest,
			conflicts: [],
		};
	});
};
