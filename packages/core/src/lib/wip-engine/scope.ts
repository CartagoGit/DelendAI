/**
 * scope.ts — turns a claim ("I own `src/foo/` and `docs/bar.md`") into the
 * concrete file list a checkpoint may contain, and records that list on
 * the commit so a later reader can tell what the checkpoint was ALLOWED
 * to touch.
 *
 * Two problems live here, and both are why `git add .` is banned:
 *
 *  1. A claimed directory is not a file list. `git update-index` takes
 *     paths, not pathspecs, so a directory claim has to be expanded — and
 *     expanded from BOTH sides, the working tree and the base tree, or a
 *     file the agent deleted (present in the base, absent on disk) never
 *     makes it into the expansion and the deletion is silently dropped.
 *  2. A checkpoint's scope has to survive the process that wrote it.
 *     Recovering an abandoned unit of work means answering "which paths
 *     were this agent's?" from the ref alone, so the scope is written into
 *     the commit message as trailers rather than kept in memory or in a
 *     side table that can disagree with the commit.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { gitOutput } from './git-command';

import type { IInvalidScopePath, IScopeValidation } from './scope.interface';
import { SCOPE_TRAILER, DIGEST_TRAILER } from './scope.constant';

export type {
	IInvalidScopePath,
	IScopeValidation,
} from './scope.interface';
export {
	SCOPE_TRAILER,
	DIGEST_TRAILER,
} from './scope.constant';

const normalizePath = (path: string): string =>
	path.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '');

/**
 * Reject anything that could reach outside the repository before it is
 * ever handed to git. An engine whose whole promise is "only these paths"
 * must not be the component that follows `../../etc` out of the tree.
 */
export const validateScopePaths = (
	paths: readonly string[],
): IScopeValidation => {
	const valid: string[] = [];
	const invalid: IInvalidScopePath[] = [];
	for (const raw of paths) {
		const path = normalizePath(raw.trim());
		if (path.length === 0) {
			invalid.push({ path: raw, reason: 'empty path' });
		} else if (path.startsWith('/') || /^[A-Za-z]:/u.test(path)) {
			invalid.push({
				path: raw,
				reason: 'absolute paths are not claimable',
			});
		} else if (
			path === '..' ||
			path.startsWith('../') ||
			path.includes('/../')
		) {
			invalid.push({
				path: raw,
				reason: 'path escapes the repository root',
			});
		} else if (path === '.git' || path.startsWith('.git/')) {
			invalid.push({
				path: raw,
				reason: 'the git directory is never claimable',
			});
		} else if (!valid.includes(path)) {
			valid.push(path);
		}
	}
	return { valid, invalid };
};

/** Files on disk under `path` (or `path` itself when it is a file). */
const worktreeFiles = async (
	root: string,
	path: string,
): Promise<readonly string[]> => {
	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(join(root, path));
	} catch {
		return [];
	}
	if (!stats.isDirectory()) return [path];
	const found: string[] = [];
	const entries = await readdir(join(root, path), { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === '.git') continue;
		const child = `${path}/${entry.name}`;
		if (entry.isDirectory())
			found.push(...(await worktreeFiles(root, child)));
		else found.push(child);
	}
	return found;
};

/**
 * Expand claimed paths to the concrete files a checkpoint may stage: the
 * union of what exists on disk and what the base tree already tracks, so
 * additions, modifications and deletions are all covered by one list.
 */
export const expandScope = async (
	run: IGitRunner,
	root: string,
	baseSha: string,
	paths: readonly string[],
): Promise<readonly string[]> => {
	const files = new Set<string>();
	for (const path of paths) {
		for (const file of await worktreeFiles(root, path)) files.add(file);
	}
	const tracked = await gitOutput(run, [
		'ls-tree',
		'-r',
		'--name-only',
		baseSha,
		'--',
		...paths,
	]);
	for (const line of (tracked ?? '').split('\n')) {
		const file = line.trim();
		if (file.length > 0) files.add(file);
	}
	return [...files].sort();
};

/**
 * Append the scope and digest trailers to a commit message. Kept separate
 * from message composition: callers own their prose, the engine owns the
 * machine-readable tail.
 */
export const withScopeTrailers = (
	message: string,
	scope: readonly string[],
	digest: string,
): string => {
	const body = message.trimEnd();
	const trailers = [
		...[...scope].sort().map((path) => `${SCOPE_TRAILER}: ${path}`),
		`${DIGEST_TRAILER}: ${digest}`,
	];
	return `${body}\n\n${trailers.join('\n')}\n`;
};

/** Scope recorded on a commit message, sorted. Empty when none is recorded. */
export const parseScopeTrailers = (message: string): readonly string[] => {
	const scope = new Set<string>();
	for (const line of message.split('\n')) {
		const match = /^Delendai-Wip-Scope:\s*(.+)$/u.exec(line.trim());
		if (match?.[1] !== undefined) scope.add(match[1].trim());
	}
	return [...scope].sort();
};

/** Digest recorded on a commit message, or `undefined` when absent. */
export const parseDigestTrailer = (message: string): string | undefined => {
	for (const line of message.split('\n').reverse()) {
		const match = /^Delendai-Wip-Digest:\s*([0-9a-f]{64})$/u.exec(
			line.trim(),
		);
		if (match?.[1] !== undefined) return match[1];
	}
	return undefined;
};

/** The scope a ref's tip records, read from the ref alone. */
export const readRefScope = async (
	run: IGitRunner,
	ref: string,
): Promise<readonly string[]> => {
	const message = await gitOutput(run, ['log', '-1', '--format=%B', ref]);
	return message === undefined ? [] : parseScopeTrailers(message);
};

/** True when `path` is the claimed path itself or lives underneath it. */
export const isWithinScope = (
	path: string,
	scope: readonly string[],
): boolean =>
	scope.some((claimed) => path === claimed || path.startsWith(`${claimed}/`));
