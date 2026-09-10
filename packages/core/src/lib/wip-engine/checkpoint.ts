/**
 * checkpoint.ts — `createOrUpdateWipRef`: persist exactly one agent's
 * paths to a ref, from a shared working tree, without moving HEAD and
 * without touching the repository's index.
 *
 * The sequence is entirely plumbing, and each step is chosen against a
 * specific failure of the porcelain alternative:
 *
 *   read-tree <baseSha>        seed a PRIVATE index from the base, so the
 *                              tree is "base plus my paths" rather than a
 *                              snapshot of a tree other agents are dirtying
 *   update-index --add --remove exactly the expanded scope — the only
 *                              staging call in the engine, and the reason
 *                              `git add .`/`-A` never appears
 *   write-tree                 a tree object; still nothing published
 *   commit-tree                a commit with no notion of HEAD
 *   update-ref                 compare-and-swap the ref into place
 *
 * Every one of those runs with `GIT_INDEX_FILE` pointed at a temporary
 * file (see `git-command.ts`), so a concurrent agent's half-staged work,
 * or a crash in the middle of this function, cannot corrupt `.git/index`.
 *
 * Idempotence is decided on the resulting TREE, not on the commit:
 * an interval checkpoint over an unchanged scope returns `unchanged` and
 * leaves the ref alone, instead of stacking identical commits.
 *
 * The index is seeded from `baseSha`, which makes a checkpoint say
 * "base, plus exactly my paths" — and makes a NARROWER claim than last
 * time silently drop work the ref had already made durable. In the one
 * operation whose purpose is not losing work, "callers should pass the
 * full scope" is not a guarantee, so the engine holds it: a request that
 * would drop previously-checkpointed paths is refused as `scope-narrowed`
 * with those paths named, and releasing a claim requires
 * `allowScopeNarrowing`.
 */

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { createCommit, updateRef } from './commit';
import { gitOutput, resolveRevision, withTemporaryIndex } from './git-command';
import { computePatchDigest, parseObjectListing } from './patch-digest';
import {
	expandScope,
	isWithinScope,
	readRefScope,
	validateScopePaths,
	withScopeTrailers,
} from './scope';
import type {
	IWipCheckpointRequest,
	IWipCheckpointResult,
} from './types.interface';

import type { IWipEngineContext } from './checkpoint.interface';

export type { IWipEngineContext } from './checkpoint.interface';

/**
 * `update-index` takes paths on the command line, so a very large claim
 * has to be split or it will blow the OS argument limit. 200 keeps the
 * command line far below every platform's ceiling.
 */
const STAGE_BATCH = 200;

const failed = (
	ref: string,
	reason: string,
	scope: readonly string[] = [],
): IWipCheckpointResult => ({
	status: 'failed',
	ref,
	commit: '',
	parent: '',
	tree: '',
	patchDigest: '',
	scope,
	dropped: [],
	reason,
});

/**
 * Paths the PREVIOUS checkpoint recorded that this request no longer
 * claims. Comparison is against the raw claim, not its expansion, so a
 * directory claim still covers a file that the checkpoint deleted (absent
 * from disk, absent from the new tree) and does not read as a drop.
 */
const droppedPaths = (
	recorded: readonly string[],
	claimed: readonly string[],
): readonly string[] =>
	recorded.filter((path) => !isWithinScope(path, claimed));

/** Stage exactly `files`, in batches, handling adds, edits and deletions. */
const stageExactly = async (
	indexRun: IGitRunner,
	files: readonly string[],
): Promise<string | undefined> => {
	for (let start = 0; start < files.length; start += STAGE_BATCH) {
		const batch = files.slice(start, start + STAGE_BATCH);
		// `--add` covers new files, `--remove` covers deleted ones, and a
		// modified file needs neither — one call therefore captures all
		// three transitions for the claimed scope and nothing else.
		const result = await indexRun([
			'update-index',
			'--add',
			'--remove',
			'--',
			...batch,
		]);
		if (!result.ok) return result.reason ?? 'git update-index failed';
	}
	return undefined;
};

/** Tree object id of a commit, or `undefined` when it cannot be read. */
const treeOf = async (
	run: IGitRunner,
	commit: string,
): Promise<string | undefined> =>
	gitOutput(run, ['rev-parse', `${commit}^{tree}`]);

/**
 * Build a checkpoint containing ONLY `request.paths` and move `request.ref`
 * onto it. HEAD, the current branch and the real index are untouched, and
 * unrelated dirty files in the shared tree are neither staged nor a reason
 * to refuse.
 */
export const createOrUpdateWipRef = async (
	context: IWipEngineContext,
	request: IWipCheckpointRequest,
): Promise<IWipCheckpointResult> => {
	const { run } = context;
	const { valid, invalid } = validateScopePaths(request.paths);
	if (invalid.length > 0) {
		const detail = invalid
			.map((entry) => `${entry.path} (${entry.reason})`)
			.join(', ');
		return failed(request.ref, `unclaimable paths: ${detail}`);
	}
	if (valid.length === 0) {
		return failed(
			request.ref,
			'no paths claimed: a checkpoint needs a scope',
		);
	}

	const baseSha = await resolveRevision(run, request.baseSha);
	if (baseSha === undefined) {
		return failed(request.ref, `unknown base commit: ${request.baseSha}`);
	}
	const existing = await resolveRevision(run, request.ref);
	const refExisted = existing !== undefined;
	const parentSha = existing ?? baseSha;

	// The temp index is seeded from `baseSha`, so a narrower claim would
	// produce a tree that no longer carries work this ref already made
	// durable — and the caller would be told the checkpoint succeeded.
	// Refuse by default and name the paths at risk; the ref does not move.
	if (refExisted && request.allowScopeNarrowing !== true) {
		const dropped = droppedPaths(
			await readRefScope(run, request.ref),
			valid,
		);
		if (dropped.length > 0) {
			return {
				status: 'scope-narrowed',
				ref: request.ref,
				commit: parentSha,
				parent: parentSha,
				tree: '',
				patchDigest: '',
				scope: valid,
				dropped,
				reason: `refusing to narrow the scope of ${request.ref}: ${dropped.join(', ')} would be dropped from the checkpoint — re-claim them, or pass allowScopeNarrowing to release them deliberately`,
			};
		}
	}

	return withTemporaryIndex(run, async (indexRun) => {
		const seeded = await indexRun(['read-tree', baseSha]);
		if (!seeded.ok) {
			return failed(
				request.ref,
				`git read-tree failed: ${seeded.reason ?? 'unknown'}`,
			);
		}

		const scope = await expandScope(indexRun, context.root, baseSha, valid);
		const stageError = await stageExactly(indexRun, scope);
		if (stageError !== undefined) {
			return failed(
				request.ref,
				`git update-index failed: ${stageError}`,
				scope,
			);
		}

		const listing =
			scope.length === 0
				? ''
				: ((await gitOutput(indexRun, [
						'ls-files',
						'-s',
						'--',
						...scope,
					])) ?? '');
		const patchDigest = computePatchDigest(
			scope,
			parseObjectListing(listing),
		);

		const tree = await gitOutput(indexRun, ['write-tree']);
		if (tree === undefined) {
			return failed(request.ref, 'git write-tree failed', scope);
		}

		if (refExisted) {
			const parentTree = await treeOf(run, parentSha);
			if (parentTree === tree) {
				return {
					status: 'unchanged',
					ref: request.ref,
					commit: parentSha,
					parent: parentSha,
					tree,
					patchDigest,
					scope,
					dropped: [],
				};
			}
		}

		const commit = await createCommit(run, {
			tree,
			parents: [parentSha],
			message: withScopeTrailers(request.message, scope, patchDigest),
			...(request.author !== undefined ? { author: request.author } : {}),
		});
		if (commit === undefined) {
			return failed(request.ref, 'git commit-tree failed', scope);
		}

		const moved = await updateRef(
			run,
			request.ref,
			commit,
			refExisted ? parentSha : undefined,
		);
		if (!moved.ok) {
			return failed(
				request.ref,
				`git update-ref failed: ${moved.reason ?? 'unknown'}`,
				scope,
			);
		}

		return {
			status: 'created',
			ref: request.ref,
			commit,
			parent: parentSha,
			tree,
			patchDigest,
			scope,
			dropped: [],
		};
	});
};
