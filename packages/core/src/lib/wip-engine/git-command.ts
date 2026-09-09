/**
 * git-command.ts — the one place the WIP engine is allowed to talk to git,
 * and the reason the engine can promise "your `.git/index` is never
 * touched".
 *
 * `packages/core/src/lib/shared/git-write.ts` already owns the shared
 * runner contract (`IGitRunner`) and the porcelain steps, but its runner
 * cannot set environment variables — and the entire exact-scope guarantee
 * of this engine rests on ONE environment variable, `GIT_INDEX_FILE`.
 * With it pointed at a throwaway file, `read-tree`/`update-index`/
 * `write-tree` build a tree out of a private staging area, so a
 * checkpoint can never stage a foreign agent's dirty file and can never
 * leave the user's real index half-staged if it fails halfway.
 *
 * So this module adds exactly one capability on top of the shared
 * contract — an env-aware runner — and hands back a plain `IGitRunner`
 * bound to a temporary index (`withIndexFile`), which every other file in
 * this directory consumes. Nothing here knows about WIP refs.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
	IGitRunResult,
	IGitRunner,
} from '../contracts/interfaces/git-runner.interface';
import { stripAnsi } from '../shared/git-write';

/** Extra environment applied to a single git invocation. */
export type IGitEnvironment = Readonly<Record<string, string>>;

/**
 * A runner that also accepts per-invocation environment. Deliberately a
 * superset of `IGitRunner` (the env argument is optional) so a scoped
 * runner can be passed anywhere the shared contract is expected.
 */
export type IScopedGitRunner = (
	args: readonly string[],
	env?: IGitEnvironment,
) => Promise<IGitRunResult>;

/** Cap on a captured failure reason — one log line, never a flood. */
const FAILURE_REASON_MAX = 600;

const describeFailure = (
	error: NodeJS.ErrnoException & { killed?: boolean; signal?: string },
	stdout: string,
	stderr: string,
	timeoutMs: number,
): string => {
	if (error.code === 'ENOENT') return 'git is not installed or not on PATH';
	if (error.killed === true || error.signal === 'SIGTERM')
		return `git timed out after ${timeoutMs}ms`;
	const raw = stripAnsi(
		[stderr, stdout].filter(Boolean).join('\n') || error.message || '',
	).trim();
	const flattened = raw
		.split('\n')
		.map((line) => line.trim())
		.filter(
			(line) => line.length > 0 && !line.startsWith('Command failed:'),
		)
		.join(' | ');
	return flattened.length > 0
		? flattened.slice(0, FAILURE_REASON_MAX)
		: 'git command failed';
};

/**
 * Invoke the real `git` in `cwd`, optionally with extra environment.
 * Never throws — failures come back as `{ ok: false, reason }`, matching
 * the shared runner's contract so callers stay uniform.
 */
export const createScopedGitRunner =
	(cwd: string, timeoutMs = 60_000): IScopedGitRunner =>
	(args, env) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					timeout: timeoutMs,
					maxBuffer: 8 * 1024 * 1024,
					env:
						env === undefined
							? process.env
							: { ...process.env, ...env },
				},
				(error, stdout, stderr) => {
					if (error === null) {
						resolve({ ok: true, output: stdout });
						return;
					}
					resolve({
						ok: false,
						output: stdout,
						reason: describeFailure(
							error as NodeJS.ErrnoException,
							stdout,
							stderr,
							timeoutMs,
						),
					});
				},
			);
		});

/**
 * Bind a scoped runner to a temporary index file. The result is a plain
 * `IGitRunner`: every command it runs sees `GIT_INDEX_FILE`, so index
 * plumbing operates on the throwaway file and the repository's real
 * `.git/index` is never opened for writing.
 */
export const withIndexFile =
	(run: IScopedGitRunner, indexFile: string): IGitRunner =>
	(args) =>
		run(args, { GIT_INDEX_FILE: indexFile });

/**
 * Run `body` with a private, empty index file that is deleted afterwards
 * even when `body` throws. Cleanup is best-effort: a leftover file in the
 * OS temp directory is harmless, whereas a throw from cleanup would mask
 * the caller's real error.
 */
export const withTemporaryIndex = async <T>(
	run: IScopedGitRunner,
	body: (indexRun: IGitRunner, indexFile: string) => Promise<T>,
): Promise<T> => {
	const dir = mkdtempSync(join(tmpdir(), 'delendai-wip-index-'));
	const indexFile = join(dir, 'index');
	try {
		return await body(withIndexFile(run, indexFile), indexFile);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

/** Trimmed stdout of a git command, or `undefined` when it failed. */
export const gitOutput = async (
	run: IGitRunner,
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output.trim() : undefined;
};

/** Resolve a revision to a full object id, or `undefined` when unknown. */
export const resolveRevision = async (
	run: IGitRunner,
	revision: string,
): Promise<string | undefined> => {
	const sha = await gitOutput(run, [
		'rev-parse',
		'--verify',
		`${revision}^{}`,
	]);
	return sha !== undefined && /^[0-9a-f]{40}$/u.test(sha) ? sha : undefined;
};

/** Absolute path of the working tree root, or `undefined` outside a repo. */
export const resolveWorktreeRoot = async (
	run: IGitRunner,
): Promise<string | undefined> =>
	gitOutput(run, ['rev-parse', '--show-toplevel']);
