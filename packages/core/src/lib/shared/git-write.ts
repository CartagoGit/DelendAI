/**
 * Write-side git primitives, shared by any plugin that needs to stage,
 * commit or push (`@mcp-vertex/git`'s `git_commit`/`git_push`,
 * `@mcp-vertex/proposals`' `auto_work` persist step). This module knows
 * ONLY about git — no proposals/slice vocabulary, no plugin-specific
 * message templates. Callers compose the commit message themselves and
 * pass it in.
 *
 * Lives in `packages/core` (not a plugin) because git write access is a
 * cross-cutting capability multiple plugins need, and the core stays the
 * single place that can be audited for "what touches the filesystem/git
 * outside a plugin's own sandbox" (AGENTS.md R1 — write tools break a
 * read-only posture, so the engine is centralised instead of duplicated).
 */
import { execFile } from 'node:child_process';

// The git-runner contract is single-sourced (f00065 slice F). Re-exported here
// so existing importers of `git-write` keep their import path unchanged.
export type {
	IGitRunResult,
	IGitRunner,
} from '../contracts/interfaces/git-runner.interface';
import type {
	IGitRunResult,
	IGitRunner,
} from '../contracts/interfaces/git-runner.interface';

/**
 * Default runner: invoke the real `git` in `cwd` via async `execFile`, so
 * a slow/hanging git never blocks the MCP server's event loop. Never
 * throws: failures come back as `{ ok: false, reason }`.
 */
export const createGitRunner =
	(cwd: string, timeoutMs = 15_000): IGitRunner =>
	(args) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					timeout: timeoutMs,
					maxBuffer: 8 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ ok: true, output: stdout });
						return;
					}
					const err = error as NodeJS.ErrnoException & {
						killed?: boolean;
						signal?: string;
					};
					let reason: string;
					if (err.code === 'ENOENT') {
						reason = 'git is not installed or not on PATH';
					} else if (err.killed || err.signal === 'SIGTERM') {
						reason = `git timed out after ${timeoutMs}ms`;
					} else {
						reason =
							(stderr || err.message || 'git command failed')
								.trim()
								.split('\n')[0] ?? 'git command failed';
					}
					resolve({ ok: false, output: '', reason });
				},
			);
		});

// ---------------------------------------------------------------------------
// Low-level steps — each wraps exactly one git subcommand.
// ---------------------------------------------------------------------------

/** `git add -- <files>`. Never `git add .` — callers always pass an explicit list. */
export const gitAdd = async (
	run: IGitRunner,
	files: readonly string[],
): Promise<IGitRunResult> => run(['add', '--', ...files]);

export interface ICommitOptions {
	/** When true, runs `git commit --amend` instead of a plain commit. */
	readonly amend?: boolean;
}

/** `git commit -m <message>` (optionally `--amend`). */
export const gitCommit = async (
	run: IGitRunner,
	message: string,
	options: ICommitOptions = {},
): Promise<IGitRunResult> =>
	run(
		options.amend === true
			? ['commit', '--amend', '-m', message]
			: ['commit', '-m', message],
	);

/** `git rev-parse --short HEAD`. Returns `undefined` when the lookup fails. */
export const gitHeadShortHash = async (
	run: IGitRunner,
): Promise<string | undefined> => {
	const result = await run(['rev-parse', '--short', 'HEAD']);
	return result.ok ? result.output.trim() : undefined;
};

/** Author name of the last commit (`%an`), or `undefined` when unknown. */
export const gitLastCommitAuthor = async (
	run: IGitRunner,
): Promise<string | undefined> => {
	const result = await run(['log', '-1', '--pretty=format:%an']);
	const trimmed = result.output.trim();
	return result.ok && trimmed.length > 0 ? trimmed : undefined;
};

export type IPushForceMode = 'with-lease' | 'true' | 'false';

export interface IPushOptions {
	readonly remote?: string;
	readonly branch?: string;
	readonly force?: IPushForceMode;
}

/**
 * `git push [<remote> [<branch>]] [--force-with-lease|--force]`.
 * `force: 'with-lease'` maps to `--force-with-lease` (the safe option —
 * fails if the remote tip moved since the last fetch); `force: 'true'`
 * maps to plain `--force` and is NEVER the default — a caller must opt
 * in explicitly. `force` omitted/`'false'` pushes without any force flag.
 */
export const gitPush = async (
	run: IGitRunner,
	options: IPushOptions = {},
): Promise<IGitRunResult> => {
	const args = ['push'];
	if (options.remote !== undefined) args.push(options.remote);
	if (options.branch !== undefined) args.push(options.branch);
	if (options.force === 'with-lease') args.push('--force-with-lease');
	else if (options.force === 'true') args.push('--force');
	return run(args);
};

// ---------------------------------------------------------------------------
// Composite engine — stage + commit (+ push), used by both `git_commit`/
// `git_push` and `proposals`' `auto_work` persist step. Pure over its
// inputs and NEVER throws: every failure is reported via `reason` so a
// caller surfaces it without breaking the rest of its own flow.
// ---------------------------------------------------------------------------

export interface ICommitAndPushOptions {
	/** Files to stage. Required and non-empty unless `skipAdd` is set. */
	readonly files?: readonly string[];
	/** Skip `git add` entirely (the caller staged files itself, or amends with no new changes). */
	readonly skipAdd?: boolean;
	readonly message: string;
	readonly amend?: boolean;
	/** When set, also pushes after a successful commit. */
	readonly push?: IPushOptions;
	readonly git: IGitRunner;
}

export interface ICommitAndPushResult {
	readonly committed: boolean;
	readonly pushed: boolean;
	readonly hash?: string;
	readonly reason?: string;
}

const buildResult = (
	committed: boolean,
	pushed: boolean,
	extras: { readonly hash?: string; readonly reason?: string } = {},
): ICommitAndPushResult => {
	const out: {
		committed: boolean;
		pushed: boolean;
		hash?: string;
		reason?: string;
	} = { committed, pushed };
	if (extras.hash !== undefined) out.hash = extras.hash;
	if (extras.reason !== undefined) out.reason = extras.reason;
	return out;
};

/**
 * Stage (optional) + commit (+ optionally push). The shared engine
 * behind `git_commit`/`git_push` (write-side git plugin tools) and
 * `proposals`' `auto_work` persist step. Callers own message
 * composition, conventional-commit validation and any "protected
 * branch"/"amend ownership" policy — this function only runs git.
 */
export const commitAndPush = async (
	options: ICommitAndPushOptions,
): Promise<ICommitAndPushResult> => {
	const run = options.git;

	if (options.skipAdd !== true) {
		const files = options.files ?? [];
		if (files.length === 0) {
			return buildResult(false, false, {
				reason: 'no files to commit (empty file list)',
			});
		}
		const addResult = await gitAdd(run, files);
		if (!addResult.ok) {
			return buildResult(false, false, {
				reason: `git add failed: ${addResult.reason ?? 'unknown'}`,
			});
		}
	}

	const commitResult = await gitCommit(run, options.message, {
		...(options.amend !== undefined ? { amend: options.amend } : {}),
	});
	if (!commitResult.ok) {
		const reason = commitResult.reason ?? 'unknown';
		const alreadyClean = /nothing to commit|no changes added/u.test(reason);
		return buildResult(false, false, {
			reason: alreadyClean
				? 'nothing to commit (worktree already clean)'
				: `git commit failed: ${reason}`,
		});
	}

	const hash = await gitHeadShortHash(run);

	if (options.push === undefined) {
		return buildResult(true, false, hash !== undefined ? { hash } : {});
	}

	const pushResult = await gitPush(run, options.push);
	if (!pushResult.ok) {
		const extras: { hash?: string; reason?: string } = {
			reason: `git push failed: ${pushResult.reason ?? 'unknown'}`,
		};
		if (hash !== undefined) extras.hash = hash;
		return buildResult(true, false, extras);
	}

	return buildResult(true, true, hash !== undefined ? { hash } : {});
};
