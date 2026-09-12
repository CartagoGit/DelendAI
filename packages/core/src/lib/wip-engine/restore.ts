/**
 * restore.ts — `restorePathsFromRef`: put a checkpoint's files back into
 * the shared working tree without HEAD, the branch or the index moving.
 *
 * The obvious implementation — check the WIP ref out — is the one thing
 * this engine may never do: the visible checkout belongs to the
 * integration branch and to every other agent working in it. So the
 * restore is done the same way the checkpoint was written: read the ref
 * into a PRIVATE index and `checkout-index` the wanted paths out of it.
 * `.git/index` is never opened, other agents' dirty files are never
 * reverted, and `git status` still reports the same branch afterwards.
 *
 * A restore also REFUSES rather than improvises. Asking for a path the
 * checkpoint never claimed means the caller's model of who owns what is
 * wrong; writing the file anyway would overwrite another agent's live
 * edits with content from a ref that was never authoritative for it.
 */

import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IWipEngineContext } from './checkpoint';
import { gitOutput, resolveRevision, withTemporaryIndex } from './git-command';
import { isWithinScope, readRefScope, validateScopePaths } from './scope';
import type { IWipRestoreRequest, IWipRestoreResult } from './types.interface';

const failed = (reason: string): IWipRestoreResult => ({
	status: 'failed',
	restored: [],
	deleted: [],
	outOfScope: [],
	reason,
});

/**
 * Files the ref's tip actually contains, restricted to its own scope.
 * A checkpoint's tree also holds the whole base, so "is this file in the
 * tree" is NOT the scope question — the recorded scope is.
 */
const refFiles = async (
	run: IGitRunner,
	ref: string,
	scope: readonly string[],
): Promise<ReadonlySet<string>> => {
	if (scope.length === 0) return new Set<string>();
	const listing = await gitOutput(run, [
		'ls-tree',
		'-r',
		'--name-only',
		ref,
		'--',
		...scope,
	]);
	return new Set(
		(listing ?? '')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0),
	);
};

/** Requested paths, resolved to the scope files they select. */
const selectFiles = (
	requested: readonly string[],
	scope: readonly string[],
): {
	readonly files: readonly string[];
	readonly outOfScope: readonly string[];
} => {
	const files = new Set<string>();
	const outOfScope: string[] = [];
	for (const path of requested) {
		const selected = scope.filter(
			(entry) => entry === path || entry.startsWith(`${path}/`),
		);
		if (selected.length === 0 && !isWithinScope(path, scope)) {
			outOfScope.push(path);
			continue;
		}
		for (const entry of selected) files.add(entry);
	}
	return { files: [...files].sort(), outOfScope };
};

const removeIfPresent = async (
	root: string,
	file: string,
): Promise<boolean> => {
	const absolute = join(root, file);
	try {
		await stat(absolute);
	} catch {
		return false;
	}
	await rm(absolute, { force: true });
	return true;
};

/**
 * Restore `request.paths` from `request.ref` into the working tree.
 * Refuses (without writing anything) when a requested path lies outside
 * the scope the checkpoint recorded for itself.
 */
export const restorePathsFromRef = async (
	context: IWipEngineContext,
	request: IWipRestoreRequest,
): Promise<IWipRestoreResult> => {
	const { run, root } = context;
	const { valid, invalid } = validateScopePaths(request.paths);
	if (invalid.length > 0) {
		const detail = invalid
			.map((entry) => `${entry.path} (${entry.reason})`)
			.join(', ');
		return failed(`unrestorable paths: ${detail}`);
	}
	if (valid.length === 0) return failed('no paths requested');

	const tip = await resolveRevision(run, request.ref);
	if (tip === undefined) return failed(`unknown ref: ${request.ref}`);

	const scope = await readRefScope(run, request.ref);
	if (scope.length === 0) {
		return failed(
			`${request.ref} records no scope: it was not written by the WIP engine`,
		);
	}

	const { files, outOfScope } = selectFiles(valid, scope);
	if (outOfScope.length > 0) {
		return {
			status: 'refused',
			restored: [],
			deleted: [],
			outOfScope,
			reason: `outside the scope of ${request.ref}: ${outOfScope.join(', ')}`,
		};
	}

	const present = await refFiles(run, tip, scope);
	const toRestore = files.filter((file) => present.has(file));
	const toDelete = files.filter((file) => !present.has(file));

	return withTemporaryIndex(run, async (indexRun) => {
		if (toRestore.length > 0) {
			const seeded = await indexRun(['read-tree', tip]);
			if (!seeded.ok) {
				return failed(
					`git read-tree failed: ${seeded.reason ?? 'unknown'}`,
				);
			}
			for (const file of toRestore) {
				await mkdir(dirname(join(root, file)), { recursive: true });
			}
			const written = await indexRun([
				'checkout-index',
				'-f',
				'--',
				...toRestore,
			]);
			if (!written.ok) {
				return failed(
					`git checkout-index failed: ${written.reason ?? 'unknown'}`,
				);
			}
		}

		const deleted: string[] = [];
		for (const file of toDelete) {
			if (await removeIfPresent(root, file)) deleted.push(file);
		}
		return {
			status: 'restored',
			restored: toRestore,
			deleted,
			outOfScope: [],
		};
	});
};
