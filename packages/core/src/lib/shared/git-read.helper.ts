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
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile, execFileSync } from 'node:child_process';

import type {
	GitSpawnObserver,
	IGitReadCache,
	IGitReadOptions,
	IGitSpawn,
} from '../contracts/interfaces/git-read.interface';
import { gitEnvironmentFor } from './hook-free-environment.helper';

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

const observers = new Set<GitSpawnObserver>();
const readCache = new AsyncLocalStorage<IGitReadCache>();

/** Watch every git process the seam starts; the answer stops watching. */
export const observeGitSpawns = (observer: GitSpawnObserver): (() => void) => {
	observers.add(observer);
	return () => {
		observers.delete(observer);
	};
};

/**
 * Run `body` with its git reads answered through `cache`. The cache
 * belongs to that call and what it awaits: two invocations running at
 * once in one server never see each other's, and none outlives its call.
 */
export const withGitReadCache = <T>(cache: IGitReadCache, body: () => T): T =>
	readCache.run(cache, body);

/**
 * Every git spawn in this package reports here first: the observers count
 * it, and the read cache forgets what it may change.
 */
export const noteGitSpawn = (cwd: string, args: readonly string[]): void => {
	const spawn: IGitSpawn = { cwd, args };
	readCache.getStore()?.ran(spawn);
	for (const observer of observers) observer(spawn);
};

/**
 * A git command started without waiting has finished: what it wrote is
 * now visible, so the read cache forgets again what a read taken while
 * it ran may have remembered. Observers are not told twice.
 */
export const noteGitSettled = (cwd: string, args: readonly string[]): void => {
	readCache.getStore()?.ran({ cwd, args });
};

/**
 * A process that is not git ran (a proof, an install, a shell command):
 * it may have run git itself, so the read cache forgets what it holds.
 */
export const forgetGitReads = (): void => {
	readCache.getStore()?.ran({ cwd: '', args: [] });
};

/**
 * `execFileSync` for a module that runs git itself (its own environment,
 * its own error handling): the spawn is reported like every other.
 */
export const execGitFileSync: typeof execFileSync = ((
	file: string,
	args: readonly string[],
	options: { readonly cwd?: string | URL | undefined },
) => {
	const cwd = options?.cwd === undefined ? '' : String(options.cwd);
	noteGitSpawn(cwd, args);
	try {
		return execFileSync(file, args, options);
	} finally {
		noteGitSettled(cwd, args);
	}
}) as typeof execFileSync;

/** `execFile` (callback form) for a module that runs git itself. */
export const execGitFile: typeof execFile = ((
	file: string,
	args: readonly string[],
	options: { readonly cwd?: string | URL | undefined },
	callback: (...result: unknown[]) => void,
) => {
	const cwd = options?.cwd === undefined ? '' : String(options.cwd);
	noteGitSpawn(cwd, args);
	return execFile(file, args, options, (...result: unknown[]) => {
		noteGitSettled(cwd, args);
		callback(...result);
	});
}) as typeof execFile;

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
	const cache = readCache.getStore();
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
