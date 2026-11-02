/**
 * working-state.helper.ts — the invariant every automatic operation is
 * held to: what somebody left uncommitted is still there, byte for byte,
 * afterwards.
 *
 * Automatic operations here (post-merge regeneration, candidate
 * hydration, work publication, namespace maintenance, WIP checkpoints)
 * each grew their own test for this after each one broke it once. This is
 * the one definition of "left as found": every path that differed from
 * HEAD before keeps its bytes and its exact index entry (staged,
 * unstaged or partly staged), and no path that was clean is left dirty.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
	IWorkingPathState,
	IWorkingState,
} from '../contracts/interfaces/working-state.interface';

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

/** Paths that differ from HEAD: modified, staged, deleted or untracked. */
const dirtyPaths = (root: string): readonly string[] =>
	git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
		.split('\0')
		.filter((entry) => entry.length > 3)
		// A rename entry is followed by its source path; both are listed.
		.map((entry) => entry.slice(3))
		.sort();

const indexEntryOf = (root: string, path: string): string | null => {
	const line = git(root, ['ls-files', '--stage', '--', path]).trim();
	if (line.length === 0) return null;
	const [meta] = line.split('\t');
	const [mode, object] = (meta ?? '').split(/\s+/u);
	return mode && object ? `${mode} ${object}` : null;
};

const stateOf = (root: string, path: string): IWorkingPathState => {
	const absolute = join(root, path);
	return {
		path,
		content: existsSync(absolute) ? readFileSync(absolute) : null,
		indexEntry: indexEntryOf(root, path),
	};
};

/** Record what a working tree holds that is not committed. */
export const captureWorkingState = (root: string): IWorkingState => ({
	root,
	paths: dirtyPaths(root).map((path) => stateOf(root, path)),
});

/**
 * How the working tree differs from `before`, in words; empty when every
 * uncommitted path is exactly as it was and nothing clean became dirty.
 */
export const workingStateChanges = (
	before: IWorkingState,
): readonly string[] => {
	const changes: string[] = [];
	const dirtyNow = new Set(dirtyPaths(before.root));
	for (const was of before.paths) {
		// Still on disk and in the index as it was, but no longer differing
		// from HEAD: somebody's change went into a commit it did not make
		// (or was discarded). Content and index alone cannot see that.
		if (!dirtyNow.has(was.path)) {
			changes.push(
				`${was.path}: its uncommitted change was committed or discarded`,
			);
			continue;
		}
		const now = stateOf(before.root, was.path);
		if (
			(was.content === null) !== (now.content === null) ||
			(was.content !== null &&
				now.content !== null &&
				!was.content.equals(now.content))
		) {
			changes.push(`${was.path}: its uncommitted content changed`);
		}
		if (was.indexEntry !== now.indexEntry) {
			changes.push(
				`${was.path}: its index entry changed (${String(was.indexEntry)} → ${String(now.indexEntry)})`,
			);
		}
	}
	const known = new Set(before.paths.map((entry) => entry.path));
	for (const path of dirtyNow) {
		if (!known.has(path)) changes.push(`${path}: was clean, is now dirty`);
	}
	return changes;
};
