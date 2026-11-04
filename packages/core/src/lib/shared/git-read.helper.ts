/**
 * git-read.helper.ts — the one synchronous git read.
 *
 * Thirty modules wrapped `execFileSync('git', …)` themselves, and they
 * disagreed on what a failure returns, whether output is trimmed and how
 * large it may be; all but a handful passed the environment through, so
 * inside a hook an inherited `GIT_DIR` made a read about another worktree
 * answer about the hook's. This read drops what a hook told git when the
 * command runs elsewhere, and answers `undefined` on any failure.
 */
import { execFileSync } from 'node:child_process';

import type {
	GitSpawnObserver,
	IGitReadCache,
	IGitReadOptions,
	IGitSpawn,
} from '../contracts/interfaces/git-read.interface';
import { gitEnvironmentFor } from './hook-free-environment.helper';

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

const observers = new Set<GitSpawnObserver>();
let readCache: IGitReadCache | undefined;

/** Watch every git process the seam starts; the answer stops watching. */
export const observeGitSpawns = (observer: GitSpawnObserver): (() => void) => {
	observers.add(observer);
	return () => {
		observers.delete(observer);
	};
};

/**
 * Remember reads through `cache` until the answer is called, which puts
 * back the cache that was there before.
 */
export const useGitReadCache = (cache: IGitReadCache): (() => void) => {
	const previous = readCache;
	readCache = cache;
	return () => {
		readCache = previous;
	};
};

/**
 * Every git spawn in this package reports here first: the observers count
 * it, and the read cache forgets what it may change.
 */
export const noteGitSpawn = (cwd: string, args: readonly string[]): void => {
	const spawn: IGitSpawn = { cwd, args };
	readCache?.ran(spawn);
	for (const observer of observers) observer(spawn);
};

const spawnRead = (
	cwd: string,
	args: readonly string[],
	options: IGitReadOptions,
): string | undefined => {
	noteGitSpawn(cwd, args);
	try {
		return execFileSync('git', [...args], {
			cwd,
			env: gitEnvironmentFor(cwd),
			encoding: 'utf8',
			maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
			...(options.input === undefined
				? { stdio: ['ignore', 'pipe', 'ignore'] as const }
				: {
						input: options.input,
						stdio: ['pipe', 'pipe', 'ignore'] as const,
					}),
		});
	} catch {
		return undefined;
	}
};

/** A read the cache may answer: one with no input to feed git. */
const cachedRead = (
	cwd: string,
	args: readonly string[],
	options: IGitReadOptions,
): string | undefined => {
	const cache = readCache;
	if (cache === undefined || options.input !== undefined)
		return spawnRead(cwd, args, options);
	const spawn: IGitSpawn = { cwd, args };
	const remembered = cache.recall(spawn);
	if (remembered !== undefined) return remembered.output;
	const output = spawnRead(cwd, args, options);
	cache.remember(spawn, output);
	return output;
};

/** Git's output (trimmed unless `verbatim`), or `undefined` when it failed. */
export const readGit = (
	cwd: string,
	args: readonly string[],
	options: IGitReadOptions = {},
): string | undefined => {
	const output = cachedRead(cwd, args, options);
	if (output === undefined) return undefined;
	return options.verbatim === true ? output : output.trim();
};

/** Read-only git, output untouched (porcelain keeps its columns). */
export const gitVerbatim = (
	cwd: string,
	args: readonly string[],
	options: Omit<IGitReadOptions, 'verbatim'> = {},
): string | undefined => readGit(cwd, args, { ...options, verbatim: true });
