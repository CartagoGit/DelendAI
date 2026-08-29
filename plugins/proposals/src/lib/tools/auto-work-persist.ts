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
 * Safety net: the push to `main` is rejected by default to preserve the
 * "no commit-back loop on main" invariant from `AGENTS.md`. The agent
 * can override `pushTarget` to an explicit branch (e.g. `agent/<name>`).
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
 *     pushTarget: 'origin agent/l109',
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
} from '@mcp-vertex/core/public';

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
const pushWouldHitMain = (pushTarget: string): boolean => {
	const tokens = pushTarget.split(/\s+/u);
	return tokens.some(
		(t) => t === 'main' || t.endsWith('/main') || t.endsWith('\\main'),
	);
};

/**
 * Detect whether `pushTarget` would push to `develop`. `develop` only
 * receives merges through a pull request now — this mirrors
 * `pushWouldHitMain` exactly (same conservative token check, same
 * case-sensitivity rationale) so this engine never silently succeeds
 * at the exact push `commit-policy`'s driver refuses independently.
 */
const pushWouldHitDevelop = (pushTarget: string): boolean => {
	const tokens = pushTarget.split(/\s+/u);
	return tokens.some(
		(t) =>
			t === 'develop' ||
			t.endsWith('/develop') ||
			t.endsWith('\\develop'),
	);
};

/**
 * Resolve which `git` invocation we use. Production: spawn the real
 * binary in `cwd`. Tests: inject via `options.git`.
 */
const resolveGitRunner = (options: IAutoWorkPersistOptions): IGitRunner => {
	if (options.git) return options.git;
	return createGitRunner(options.cwd ?? process.cwd());
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

	// Stage the files explicitly. We never `git add .` because that
	// would silently fold unrelated, unreviewed changes (drift between
	// `agent_lock.files` and the actual diff) into the slice commit.
	// Checked here (rather than left to `commitAndPush`) so the empty-file
	// reason stays this module's own wording ("empty slice").
	if (files.length === 0) {
		return persistResult(false, false, mode, {
			reason: 'no files to commit (empty slice)',
		});
	}

	const template = options.messageTemplate ?? DEFAULT_TEMPLATE;
	const area = inferArea(files);
	const message = renderCommitMessage(template, area, proposalId, sliceId);

	if (options.commitAuthor?.reason) {
		return persistResult(false, false, mode, {
			reason: options.commitAuthor.reason,
		});
	}

	// `mode === 'commit-and-push'` with a `pushTarget` that would hit
	// `main` or `develop` is special-cased BEFORE calling the shared
	// engine: the commit still happens, but the push step is skipped
	// entirely (the engine is never told to push), preserving the exact
	// "refusing to push automatically" reason this module has always
	// reported. `develop` only receives merges through a pull request
	// now, so it gets the same treatment as `main` — this is the same
	// invariant `commit-policy`'s push driver enforces independently
	// when pushing through the plugin tool instead of this helper.
	const pushTarget = options.pushTarget ?? DEFAULT_PUSH_TARGET;
	if (mode === 'commit-and-push' && options.agentWorktreeEnabled !== true) {
		return persistResult(false, false, mode, {
			reason: 'commit-and-push requires agentWorktree to be enabled; use mode "commit" in shared-checkout mode or enable agentWorktree',
		});
	}
	const wouldHitMain =
		mode === 'commit-and-push' && pushWouldHitMain(pushTarget);
	const wouldHitDevelop =
		mode === 'commit-and-push' && pushWouldHitDevelop(pushTarget);
	const pushRefused = wouldHitMain || wouldHitDevelop;
	const [pushRemote, pushBranch] = pushTarget.split(/\s+/u);

	const result = await commitAndPush({
		files,
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
		// Safety net: never push to main or develop automatically. The
		// commit is already done; we just refuse to push and explain why.
		return persistResult(true, false, mode, {
			reason: wouldHitMain
				? 'refusing to push to main automatically'
				: 'refusing to push to develop automatically — open a PR from a wip/* branch instead',
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
