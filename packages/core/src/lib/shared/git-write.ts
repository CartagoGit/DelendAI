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

const ANSI_ESCAPE = String.fromCodePoint(0x1b);
const ANSI_CSI_PATTERN = new RegExp(
	`[${ANSI_ESCAPE}\u009b]\\[[0-?]*[ -/]*[@-~]`,
	'gu',
);
const ANSI_OSC_PATTERN = new RegExp(
	`[${ANSI_ESCAPE}\u009b][\\]()#;?]*(?:${String.fromCodePoint(0x07)}|\\d{1,4}(?:;\\d{0,4})*[\\dA-PR-TZcf-nq-uy=><~])`,
	'gu',
);

export const stripAnsi = (value: string): string =>
	value.replace(ANSI_CSI_PATTERN, '').replace(ANSI_OSC_PATTERN, '');

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
export type {
	IForcePushAuthorizationRecord,
	IPushAuthorization,
} from '../contracts/interfaces/force-push-authorization.interface';
import type {
	IForcePushAuthorizationRecord,
	IPushAuthorization,
} from '../contracts/interfaces/force-push-authorization.interface';

/**
 * Default runner: invoke the real `git` in `cwd` via async `execFile`, so
 * a slow/hanging git never blocks the MCP server's event loop. Never
 * throws: failures come back as `{ ok: false, reason }`.
 */
/**
 * Does this line look like it names a failure?
 *
 * Ordering beats filtering here. The first attempt at this dropped
 * lines that looked decorative, which worked until a hook runner whose
 * output is ALL decoration reduced the reason to its own footer —
 * "git commit failed: summary: (done in 0.02 seconds)" — losing the
 * diagnosis just as thoroughly as reading only stderr had.
 *
 * So nothing is discarded. Lines that carry a failure signal are moved
 * to the front, so the cap trims context rather than the answer, and
 * this stays correct for a runner whose format we have never seen.
 */
const looksLikeFailureLine = (line: string): boolean =>
	/error|failed|failure|fatal|refus|denied|abort|not allowed|✖|✗|×/iu.test(
		line,
	);

/**
 * Cap on a captured git failure reason. Long enough for git's full
 * diagnosis, short enough that one failure cannot flood a log line.
 */
const GIT_FAILURE_REASON_MAX = 600;

export const createGitRunner =
	(cwd: string, timeoutMs = 60_000): IGitRunner =>
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
						// git does NOT put everything on stderr. `git
						// commit` with an empty index writes "nothing to
						// commit, working tree clean" to STDOUT and exits
						// 1, leaving stderr empty. Reading stderr alone
						// then falls through to `err.message`, which is
						// just the command echo —
						// "Command failed: git commit --author=… -m …" —
						// with no reason in it at all.
						//
						// That is not merely unhelpful, it is a live
						// infinite loop: commit-policy classifies
						// "nothing to commit" as a TERMINAL outcome so a
						// slice whose work is already committed stops
						// retrying. The classifier matches on this reason
						// string. With the reason reduced to the command
						// echo it never matches, the event stays pending,
						// and the listener re-emits it about once a second
						// forever (observed in an adopter project on
						// 2026-09-03).
						//
						// So: prefer stderr, fall back to stdout, and only
						// then to the exec error.
						//
						// Keep the WHOLE output, not just its first line.
						// git's diagnosis is frequently not on line one —
						// "nothing to commit" sits under "On branch main"
						// and a summary of untracked paths. Callers match
						// on substrings, so dropping the tail is what
						// broke the classification in the first place.
						// Bounded and flattened to stay one log line.
						const raw = stripAnsi(
							stderr || stdout || err.message || '',
						).trim();
						const lines = raw
							.split('\n')
							.map((line) => line.trim())
							.filter(
								(line) =>
									line.length > 0 &&
									!line.startsWith('Command failed:'),
							);
						const flattened = [
							...lines.filter(looksLikeFailureLine),
							...lines.filter(
								(line) => !looksLikeFailureLine(line),
							),
						].join(' | ');
						reason =
							flattened.length > 0
								? flattened.slice(0, GIT_FAILURE_REASON_MAX)
								: 'git command failed';
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
	/**
	 * Optional `Name <email>` override passed as `git commit --author=`.
	 * When omitted, the commit uses the active git config (the default
	 * most users want — see `commit-author.ts` for the configured
	 * modes). Falsy / whitespace-only values are ignored so a buggy
	 * resolver cannot accidentally produce a commit with no author.
	 */
	readonly authorFlag?: string;
}

/** `git commit -m <message>` (optionally `--amend`, optionally `--author=`). */
export const gitCommit = async (
	run: IGitRunner,
	message: string,
	options: ICommitOptions = {},
): Promise<IGitRunResult> => {
	const trimmed = options.authorFlag?.trim();
	const authorArgs: readonly string[] =
		trimmed !== undefined && trimmed.length > 0
			? [`--author=${trimmed}`]
			: [];
	return run(
		options.amend === true
			? ['commit', '--amend', ...authorArgs, '-m', message]
			: ['commit', ...authorArgs, '-m', message],
	);
};

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
	/**
	 * Branches this push refuses to force into unless `authorization` is
	 * given — see `gitPush`. Core stays project-agnostic: callers MUST
	 * supply their own resolved list, or pass `[]` explicitly to opt out
	 * of branch protection for this push.
	 */
	readonly protectedBranches: readonly string[];
	/** See `IPushAuthorization`. Required to force-push (either mode) past the guards in `gitPush`. */
	readonly authorization?: IPushAuthorization;
}

const hasAuthorization = (
	authorization: IPushAuthorization | undefined,
): authorization is IPushAuthorization =>
	authorization !== undefined &&
	authorization.by.trim().length > 0 &&
	authorization.reason.trim().length > 0;

/**
 * Resolve a `src:dst` refspec / `refs/heads/`-prefixed branch down to its
 * bare destination name, so a protected-branch check compares against
 * what will actually be updated on the remote.
 */
const pushDestinationBranch = (ref: string): string => {
	const colon = ref.indexOf(':');
	const dst = colon >= 0 ? ref.slice(colon + 1) : ref;
	return dst.startsWith('refs/heads/')
		? dst.slice('refs/heads/'.length)
		: dst;
};

/** Resolves the branch a force push would actually land on — `options.branch` when given, otherwise the current branch. */
const resolveForceTargetBranch = async (
	run: IGitRunner,
	branch: string | undefined,
): Promise<string | undefined> => {
	if (branch !== undefined) return pushDestinationBranch(branch);
	const head = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	return head.ok ? head.output.trim() : undefined;
};

const MAX_RECORDED_FORCE_PUSH_AUTHORIZATIONS = 200;
const forcePushAuthorizations: IForcePushAuthorizationRecord[] = [];

const recordForcePushAuthorization = (
	record: IForcePushAuthorizationRecord,
): void => {
	forcePushAuthorizations.push(record);
	if (
		forcePushAuthorizations.length > MAX_RECORDED_FORCE_PUSH_AUTHORIZATIONS
	) {
		forcePushAuthorizations.shift();
	}
};

/** Recent authorized force pushes, oldest first. For introspection/tests. */
export const listForcePushAuthorizations =
	(): readonly IForcePushAuthorizationRecord[] => [
		...forcePushAuthorizations,
	];

/** Test-only: clears the in-memory audit buffer between specs. */
export const clearForcePushAuthorizationsForTests = (): void => {
	forcePushAuthorizations.length = 0;
};

/**
 * `git push [<remote> [<branch>]] [--force-with-lease|--force]`.
 *
 * `force: 'with-lease'` maps to `--force-with-lease` (the safe option —
 * fails if the remote tip moved since the last fetch) and needs no
 * authorization UNLESS the target is in `protectedBranches`. Plain
 * `force: 'true'` maps to `--force` and ALWAYS needs `authorization`,
 * regardless of branch — a caller opting into the unsafe mode is not,
 * by itself, consent for an irreversible rewrite of shared history.
 * `force` omitted/`'false'` pushes without any force flag and is
 * unaffected by either guard.
 *
 * A successful authorized force push is recorded via
 * `listForcePushAuthorizations()` (see above).
 */
export const gitPush = async (
	run: IGitRunner,
	options?: IPushOptions,
): Promise<IGitRunResult> => {
	const resolvedOptions: IPushOptions = options ?? { protectedBranches: [] };
	const force = resolvedOptions.force ?? 'false';
	if (force === 'false') {
		const args = ['push'];
		if (resolvedOptions.remote !== undefined)
			args.push(resolvedOptions.remote);
		if (resolvedOptions.branch !== undefined)
			args.push(resolvedOptions.branch);
		return run(args);
	}

	if (force === 'true' && !hasAuthorization(resolvedOptions.authorization)) {
		return {
			ok: false,
			output: '',
			reason: 'plain --force refused: pass options.authorization { by, reason }, or use force:"with-lease" (fails safely instead of overwriting unseen commits)',
		};
	}

	const protectedBranches = resolvedOptions.protectedBranches;
	let targetBranch: string | undefined;
	if (protectedBranches.length > 0) {
		targetBranch = await resolveForceTargetBranch(
			run,
			resolvedOptions.branch,
		);
		if (
			targetBranch !== undefined &&
			protectedBranches.includes(targetBranch) &&
			!hasAuthorization(resolvedOptions.authorization)
		) {
			return {
				ok: false,
				output: '',
				reason: `force push refused: "${targetBranch}" is a protected branch — pass options.authorization { by, reason } to override`,
			};
		}
	}

	const args = ['push'];
	if (resolvedOptions.remote !== undefined) args.push(resolvedOptions.remote);
	if (resolvedOptions.branch !== undefined) args.push(resolvedOptions.branch);
	args.push(force === 'with-lease' ? '--force-with-lease' : '--force');

	const result = await run(args);
	if (result.ok && hasAuthorization(resolvedOptions.authorization)) {
		recordForcePushAuthorization({
			ts: new Date().toISOString(),
			by: resolvedOptions.authorization.by.trim(),
			reason: resolvedOptions.authorization.reason.trim(),
			branch: targetBranch ?? resolvedOptions.branch,
			forceMode: force,
		});
	}
	return result;
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
	/**
	 * Optional `Name <email>` override passed as `git commit --author=`.
	 * When omitted, the commit uses the active git config. See
	 * `commit-author.ts` for the configurable modes (`git`/`agent`/
	 * `bot`/`named`); `commitAndPush` accepts the already-resolved
	 * value so callers do not have to import the resolver themselves.
	 */
	readonly authorFlag?: string;
	/** When set, also pushes after a successful commit. */
	readonly push?: Omit<IPushOptions, 'protectedBranches'> & {
		readonly protectedBranches?: readonly string[];
	};
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
		...(options.authorFlag !== undefined
			? { authorFlag: options.authorFlag }
			: {}),
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

	const pushResult = await gitPush(run, {
		protectedBranches: [],
		...options.push,
	});
	if (!pushResult.ok) {
		const extras: { hash?: string; reason?: string } = {
			reason: `git push failed: ${pushResult.reason ?? 'unknown'}`,
		};
		if (hash !== undefined) extras.hash = hash;
		return buildResult(true, false, extras);
	}

	return buildResult(true, true, hash !== undefined ? { hash } : {});
};
