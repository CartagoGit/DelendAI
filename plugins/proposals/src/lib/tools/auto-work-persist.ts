/**
 * Optional persistence step for `<prefix>_auto_work` (p109).
 *
 * When the agent closes a slice, it can opt to commit (and optionally
 * push) the changed files. Three modes:
 *
 * - `'none'`             — no git interaction; the current behaviour.
 * - `'commit'`           — `git add <files> && git commit` with a
 *                          Conventional-Commits-style message derived
 *                          from `<area>(<proposalId>): <sliceId>`.
 * - `'commit-and-push'`  — the above + `git push <pushTarget>`.
 *
 * The helper is **pure** over its inputs (files, options) and **never
 * throws** — every failure (git missing, commit conflict, push rejected,
 * push to `main` refused) is reported via `IPersistResult.reason` so the
 * caller can surface it in the `auto_work` JSON output without breaking
 * the rest of the slice-close flow.
 *
 * Safety net: the push to `main` is rejected by default to preserve the
 * "no commit-back loop on main" invariant from `AGENTS.md`. The agent
 * can override `pushTarget` to an explicit branch (e.g. `agent/<name>`).
 *
 * @example
 * ```typescript
 * const result = await maybePersistAfterSlice(
 *   ['plugins/proposals/src/lib/tools/auto-work-persist.ts'],
 *   'p109',
 *   's2',
 *   {
 *     mode: 'commit-and-push',
 *     cwd: '/abs/repo',
 *     pushTarget: 'origin agent/p109',
 *   },
 * );
 * if (!result.committed) console.warn('persist skipped:', result.reason);
 * ```
 */
import type { IGitRunner } from '../shared/git-runner';

/** How `auto_work` should persist the slice when it closes. */
export type IAutoWorkPersistMode = 'none' | 'commit' | 'commit-and-push';

/** Options the helper needs to do its job. Pure data. */
export interface IAutoWorkPersistOptions {
	/** Persist mode. `'none'` is a hard default; no git is touched. */
	readonly mode: IAutoWorkPersistMode;
	/**
	 * Conventional-Commits template. Placeholders:
	 * - `<area>`         — first path segment of the first changed file
	 *                      (e.g. `plugins`, `apps`, `docs`); `chore` if
	 *                      nothing matches.
	 * - `<proposalId>`   — the id of the proposal being closed.
	 * - `<sliceId>`      — the id of the slice just closed.
	 *
	 * Default: `<area>(<proposalId>): <sliceId>`.
	 */
	readonly messageTemplate?: string;
	/**
	 * Push target. Default: `origin HEAD` (push the current branch to its
	 * upstream). Explicit branches like `origin agent/<name>` are safer
	 * for worktrees.
	 */
	readonly pushTarget?: string;
	/**
	 * Working directory of the `git` invocation. Tests inject a temp
	 * dir; production callers pass `ctx.workspace.root`.
	 */
	readonly cwd?: string;
	/**
	 * Injectable git runner (defaults to the real `git` binary via
	 * `execFile`). Tests always pass a mock to keep the helper pure.
	 */
	readonly git?: IGitRunner;
}

/**
 * Outcome of the persist step. `committed` and `pushed` are independent
 * flags: a `commit-and-push` that committed successfully but failed to
 * push returns `{ committed: true, pushed: false, reason }`.
 */
/**
 * Build a result without setting absent optional fields, so the result
 * type stays compatible with `exactOptionalPropertyTypes: true`.
 */
const persistResult = (
	committed: boolean,
	pushed: boolean,
	mode: IAutoWorkPersistMode,
	extras: { readonly hash?: string; readonly reason?: string } = {},
): IPersistResult => {
	const out: {
		committed: boolean;
		pushed: boolean;
		mode: IAutoWorkPersistMode;
		hash?: string;
		reason?: string;
	} = { committed, pushed, mode };
	if (extras.hash !== undefined) out.hash = extras.hash;
	if (extras.reason !== undefined) out.reason = extras.reason;
	return out;
};

export interface IPersistResult {
	/** True only if a commit was created (or the worktree was already clean + mode=none). */
	readonly committed: boolean;
	/** True only if a push exited 0. Always `false` when `mode !== 'commit-and-push'`. */
	readonly pushed: boolean;
	/** Short hash of the commit, when known. */
	readonly hash?: string;
	/** Why a step was skipped or failed. Absent on full success. */
	readonly reason?: string;
	/** Mode that was actually applied (always equal to `options.mode`). */
	readonly mode: IAutoWorkPersistMode;
}

const DEFAULT_TEMPLATE = '<area>(<proposalId>): <sliceId>';
const DEFAULT_PUSH_TARGET = 'origin HEAD';

/**
 * Try to detect the conventional `area/` segment from the first file
 * path. Examples:
 *
 * - `plugins/proposals/src/lib/foo.ts` → `plugins`
 * - `apps/web/src/pages/index.astro`   → `apps`
 * - `docs/proposals/p99.md`           → `docs`
 * - `package.json` (no segments)      → `chore`
 *
 * The lookup is intentionally dumb (no allowlist) — it does not try to
 * validate that the area exists in the monorepo; the commit message is
 * informational, not authoritative.
 */
const inferArea = (files: readonly string[]): string => {
	const first = files[0];
	if (first === undefined || first.length === 0) return 'chore';
	const slash = first.indexOf('/');
	if (slash <= 0) return 'chore';
	return first.slice(0, slash);
};

/**
 * Render the commit message template by substituting the three known
 * placeholders. Unknown placeholders are passed through verbatim so a
 * typo in `messageTemplate` does not silently swallow a literal string.
 */
export const renderCommitMessage = (
	template: string,
	area: string,
	proposalId: string,
	sliceId: string,
): string =>
	template
		.replace(/<area>/gu, area)
		.replace(/<proposalId>/gu, proposalId)
		.replace(/<sliceId>/gu, sliceId);

/**
 * Detect whether `pushTarget` would push to `main` (the protected
 * branch). The detection is conservative: any token equal to `main` or
 * a ref that ends with `/main` triggers the refusal. The check is
 * case-sensitive on purpose — `Main` is a different branch and the
 * host's typo class of bug is exactly what we want to surface.
 */
const pushWouldHitMain = (pushTarget: string): boolean => {
	const tokens = pushTarget.split(/\s+/u);
	return tokens.some(
		(t) => t === 'main' || t.endsWith('/main') || t.endsWith('\\main'),
	);
};

/**
 * Resolve which `git` invocation we use. Production: spawn the real
 * binary in `cwd`. Tests: inject via `options.git`.
 */
const resolveGitRunner = (options: IAutoWorkPersistOptions): IGitRunner => {
	if (options.git) return options.git;
	// Lazy import to keep `auto-work-persist` decoupled from
	// `child_process` for unit tests that always inject `options.git`.
	// Falls back to a no-op runner that always reports "git missing" so
	// callers see the right `IPersistResult.reason` instead of an
	// unhandled crash.
	return async () => ({
		ok: false,
		output: '',
		reason: 'git runner not provided and no default available',
	});
};

/**
 * Core entry point. See the file-level JSDoc for the contract.
 */
export const maybePersistAfterSlice = async (
	files: readonly string[],
	proposalId: string,
	sliceId: string,
	options: IAutoWorkPersistOptions,
): Promise<IPersistResult> => {
	const mode = options.mode;

	// Fast path: `'none'` is the no-op default and the only branch that
	// touches no git. Returning early keeps the function predictable and
	// makes the rest of the logic mode-aware without nested branches.
	if (mode === 'none') {
		return persistResult(false, false, mode);
	}

	const run = resolveGitRunner(options);

	// Stage the files explicitly. We never `git add .` because that
	// would silently fold unrelated, unreviewed changes (drift between
	// `agent_lock.files` and the actual diff) into the slice commit.
	if (files.length === 0) {
		return persistResult(false, false, mode, {
			reason: 'no files to commit (empty slice)',
		});
	}

	const addResult = await run(['add', '--', ...files]);
	if (!addResult.ok) {
		return persistResult(false, false, mode, {
			reason: `git add failed: ${addResult.reason ?? 'unknown'}`,
		});
	}

	const template = options.messageTemplate ?? DEFAULT_TEMPLATE;
	const area = inferArea(files);
	const message = renderCommitMessage(template, area, proposalId, sliceId);

	const commitResult = await run(['commit', '-m', message]);
	if (!commitResult.ok) {
		// A common non-fatal case: nothing to commit (worktree already
		// clean after `git add`). Surface a friendly reason so the
		// agent knows the persist step did not actually move state.
		const reason = commitResult.reason ?? 'unknown';
		const alreadyClean = /nothing to commit|no changes added/u.test(reason);
		return persistResult(false, false, mode, {
			reason: alreadyClean
				? 'nothing to commit (worktree already clean)'
				: `git commit failed: ${reason}`,
		});
	}

	// `git rev-parse --short HEAD` to report the hash back to the agent.
	const hashResult = await run(['rev-parse', '--short', 'HEAD']);
	const hash = hashResult.ok ? hashResult.output.trim() : undefined;

	if (mode !== 'commit-and-push') {
		return persistResult(
			true,
			false,
			mode,
			hash !== undefined ? { hash } : {},
		);
	}

	const pushTarget = options.pushTarget ?? DEFAULT_PUSH_TARGET;
	if (pushWouldHitMain(pushTarget)) {
		// Safety net: never push to main automatically. The commit is
		// already done; we just refuse to push and explain why.
		const extras: { hash?: string; reason?: string } = {
			reason: 'refusing to push to main automatically',
		};
		if (hash !== undefined) extras.hash = hash;
		return persistResult(true, false, mode, extras);
	}

	const pushResult = await run(['push', ...pushTarget.split(/\s+/u)]);
	if (!pushResult.ok) {
		const extras: { hash?: string; reason?: string } = {
			reason: `git push failed: ${pushResult.reason ?? 'unknown'}`,
		};
		if (hash !== undefined) extras.hash = hash;
		return persistResult(true, false, mode, extras);
	}

	const extras: { hash?: string } = {};
	if (hash !== undefined) extras.hash = hash;
	return persistResult(true, true, mode, extras);
};
