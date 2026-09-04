/**
 * Optional persistence step for `<prefix>_auto_work` (l109).
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
 * Safety net: pushes are refused only when the configured target matches
 * the effective protected-branch policy (default: `main` / `master`).
 * Explicit non-protected targets such as `origin develop` are honored.
 *
 * @example
 * ```typescript
 * const result = await maybePersistAfterSlice(
 *   ['plugins/proposals/src/lib/tools/auto-work-persist.ts'],
 *   'l109',
 *   's2',
 *   {
 *     mode: 'commit-and-push',
 *     cwd: '/abs/repo',
 *     pushTarget: 'origin develop',
 *   },
 * );
 * if (!result.committed) console.warn('persist skipped:', result.reason);
 * ```
 */
import {
	commitAndPush,
	type FindingSeverity,
	type IFinding,
	type IFindingCounts,
	type ICommitAuthorResolution,
} from '@delendai/core/public';

import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { assessStaleAcceptance } from '../services/checkpoint-advisory-stale-acceptance.service';
import type { ISliceAcceptanceEvidence } from '../services/slice-acceptance-evidence.service';

export interface IQualityProbeResult {
	readonly ok: boolean;
	readonly severities: IFindingCounts;
	readonly worst: FindingSeverity | 'none';
	readonly findings: readonly IFinding[];
}

export interface IQualityProbeDeps {
	readonly runQuality?: () => Promise<IQualityProbeResult>;
}

export const shouldBlockCloseSliceOnQuality = (
	result: IQualityProbeResult,
): boolean =>
	result.ok === false &&
	(result.worst === 'critical' || result.worst === 'high');

/** How `auto_work` should persist the slice when it closes. */
export type IAutoWorkPersistMode = 'none' | 'commit' | 'commit-and-push';

/** Options the helper needs to do its job. Pure data. */
export interface IAutoWorkPersistOptions {
	/** Persist mode. `'none'` is a hard default; no git is touched. */
	readonly mode: IAutoWorkPersistMode;
	/** Host-scoped worktree capability resolved at boot. */
	readonly agentWorktreeEnabled?: boolean;
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
	/** Branches refused by the host's effective commit policy. */
	readonly protectedBranches?: readonly string[];
	/** Include every dirty workspace path when the host explicitly allows it. */
	readonly allowForeignChanges?: boolean;
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
	/** f00082: resolved commit-author policy. */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
	/**
	 * f00156 S7: optional slice-acceptance evidence. Push is refused only
	 * when required validation is objectively stale. Commit is never
	 * hard-blocked by this field.
	 */
	readonly acceptanceEvidence?: ISliceAcceptanceEvidence;
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
const MISSING_CWD_REASON = 'git runner requires an explicit workspace cwd';

/**
 * Try to detect the conventional `area/` segment from the first file
 * path. Examples:
 *
 * - `plugins/proposals/src/lib/foo.ts` → `plugins`
 * - `apps/web/src/pages/index.astro`   → `apps`
 * - `docs/mcp-vertex/proposals/l99.md`           → `docs`
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
const pushWouldHitProtectedBranch = (
	pushTarget: string,
	protectedBranches: readonly string[],
): string | undefined => {
	const tokens = pushTarget.split(/\s+/u);
	return protectedBranches.find((branch) =>
		tokens.some(
			(token) =>
				token === branch ||
				token.endsWith(`/${branch}`) ||
				token.endsWith(`\\${branch}`) ||
				token.endsWith(`:${branch}`) ||
				token.endsWith(`:/${branch}`),
		),
	);
};

/**
 * Resolve which `git` invocation we use. Production: spawn the real
 * binary in `cwd`. Tests: inject via `options.git`.
 */
const resolveGitRunner = (options: IAutoWorkPersistOptions): IGitRunner => {
	if (options.git) return options.git;
	if (options.cwd !== undefined) return createGitRunner(options.cwd);
	return async () => ({
		ok: false,
		output: '',
		reason: MISSING_CWD_REASON,
	});
};

const readDirtyPaths = async (run: IGitRunner): Promise<readonly string[]> => {
	const result = await run([
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
	]);
	if (!result.ok) return [];
	return result.output
		.split('\n')
		.map((line) => line.slice(3).trim())
		.filter((path) => path.length > 0)
		.map((path) => {
			const renameSeparator = path.indexOf(' -> ');
			return renameSeparator >= 0
				? path.slice(renameSeparator + 4)
				: path;
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

	if (mode === 'commit-and-push' && options.acceptanceEvidence) {
		const blocked = assessStaleAcceptance(
			options.acceptanceEvidence,
			'push',
		);
		if (blocked?.severity === 'block') {
			return persistResult(false, false, mode, {
				reason: blocked.reason,
			});
		}
	}

	const run = resolveGitRunner(options);
	const filesToPersist = options.allowForeignChanges
		? await readDirtyPaths(run)
		: files;

	// Stage the files explicitly. We never `git add .` because that
	// would silently fold unrelated, unreviewed changes (drift between
	// `agent_lock.files` and the actual diff) into the slice commit.
	// Checked here (rather than left to `commitAndPush`) so the empty-file
	// reason stays this module's own wording ("empty slice").
	if (filesToPersist.length === 0) {
		return persistResult(false, false, mode, {
			reason: 'no files to commit (empty slice)',
		});
	}

	const template = options.messageTemplate ?? DEFAULT_TEMPLATE;
	const area = inferArea(filesToPersist);
	const message = renderCommitMessage(template, area, proposalId, sliceId);

	if (options.commitAuthor?.reason) {
		return persistResult(false, false, mode, {
			reason: options.commitAuthor.reason,
		});
	}

	// A target is refused only when it matches the effective host policy.
	const pushTarget = options.pushTarget ?? DEFAULT_PUSH_TARGET;
	const protectedBranches = options.protectedBranches ?? ['main', 'master'];
	const protectedBranch = pushWouldHitProtectedBranch(
		pushTarget,
		protectedBranches,
	);
	const pushRefused =
		mode === 'commit-and-push' && protectedBranch !== undefined;
	const [pushRemote, pushBranch] = pushTarget.split(/\s+/u);

	const result = await commitAndPush({
		files: filesToPersist,
		message,
		git: run,
		...(options.commitAuthor?.authorFlag
			? { authorFlag: options.commitAuthor.authorFlag }
			: {}),
		...(mode === 'commit-and-push' && !pushRefused
			? {
					push: {
						...(pushRemote !== undefined
							? { remote: pushRemote }
							: {}),
						...(pushBranch !== undefined
							? { branch: pushBranch }
							: {}),
					},
				}
			: {}),
	});

	if (!result.committed) {
		return persistResult(false, false, mode, {
			...(result.reason !== undefined ? { reason: result.reason } : {}),
		});
	}

	if (mode === 'commit-and-push' && pushRefused) {
		// Safety net: the effective host policy wins over persistence.
		return persistResult(true, false, mode, {
			reason: `refusing to push to ${protectedBranch} automatically`,
			...(result.hash !== undefined ? { hash: result.hash } : {}),
		});
	}

	if (mode === 'commit-and-push' && result.pushed !== true) {
		return persistResult(true, false, mode, {
			reason:
				result.reason ??
				'commit completed but push was not confirmed; persistence is incomplete',
			...(result.hash !== undefined ? { hash: result.hash } : {}),
		});
	}

	return persistResult(true, mode === 'commit-and-push', mode, {
		...(result.hash !== undefined ? { hash: result.hash } : {}),
		...(result.reason !== undefined ? { reason: result.reason } : {}),
	});
};
