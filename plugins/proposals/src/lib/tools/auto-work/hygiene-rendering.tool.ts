import { isAgentBranchName } from '../../locks/lock-paths';
import { workBranchPrefixes } from '../../shared/branch-namespaces';
import { createGitRunner } from '../../shared/git-runner';
import {
	runBranchStatusEngine,
	type IBranchStatusResult,
} from '../../shared/branch-status-engine';
import {
	runBranchGcEngine,
	type IGcPlanEntry,
} from '../../shared/branch-gc-engine';
import { runSwarmHygieneEngine } from '../../shared/swarm-hygiene-engine';
import type {
	IRescueCandidate,
	ISmokeResidualBranch,
} from '../../contracts/interfaces/swarm-hygiene.interface';
import {
	runStashSnapshot,
	type IStashEntry,
} from '../../shared/stash-snapshot';
import type { IHygieneFrontHook } from '../../contracts/interfaces/auto-work-tool.interface';

/**
 * f00078 S1: read the current branch name in 2 git calls. Returns
 * the branch (or `HEAD` for detached) and a `isAgentBranch` boolean.
 * Used by the `needs-worktree` gate. Fail-soft: any error returns
 * `{ ok: false }` and the gate is skipped.
 */
export const readCurrentBranchForWorktreeGate = async (
	workspaceRoot: string,
): Promise<
	{ ok: true; branch: string; isAgentBranch: boolean } | { ok: false }
> => {
	if (workspaceRoot.length === 0) return { ok: false };
	try {
		const run = createGitRunner(workspaceRoot);
		const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
		if (!result.ok) return { ok: false };
		const branch = result.output.trim();
		// Detached HEAD (or in a brand-new repo with no commits) reports
		// 'HEAD' — never an agent branch, always blocked.
		return {
			ok: true,
			branch: branch.length === 0 ? 'HEAD' : branch,
			isAgentBranch: isAgentBranchName(
				branch,
				await workBranchPrefixes(workspaceRoot),
			),
		};
	} catch {
		return { ok: false };
	}
};

/**
 * f00073: build a list of warnings from the branch + worktree snapshot.
 * Empty array on failure or when nothing is wrong — never blocks the
 * plan. Mirrors the "fail soft" contract used elsewhere in
 * `auto-work.tool.ts` (the loop detector, etc.).
 */
export const collectBranchStatusWarnings = async (
	workspaceRoot: string,
): Promise<string[]> => {
	try {
		const snapshot = await runBranchStatusEngine({
			run: createGitRunner(workspaceRoot),
			workspaceRoot,
		});
		return snapshot.ok ? branchStatusWarningsFor(snapshot) : [];
	} catch {
		return [];
	}
};

/** The warnings a branch + worktree snapshot raises, against its base. */
export const branchStatusWarningsFor = (
	snapshot: Pick<
		IBranchStatusResult,
		| 'baseBranch'
		| 'branches'
		| 'worktrees'
		| 'mainCheckoutBranch'
		| 'mainCheckoutDrift'
	>,
): string[] => {
	const base = snapshot.baseBranch;
	const warnings: string[] = [];
	if (snapshot.mainCheckoutDrift) {
		warnings.push(
			`main checkout is on \`${snapshot.mainCheckoutBranch}\` instead of \`${base}\` — an agent switched the shared checkout. Switch it back with: git switch ${base}`,
		);
	}
	for (const wt of snapshot.worktrees) {
		if (wt.dirtyFiles > 0 || wt.untrackedFiles > 0) {
			warnings.push(
				`worktree ${wt.path} (${wt.branch}): ${wt.dirtyFiles} dirty + ${wt.untrackedFiles} untracked (${wt.ageLabel})`,
			);
		}
		if (wt.outOfCache) {
			warnings.push(
				`worktree ${wt.path} lives outside the canonical cache dir (AGENTS.md violation)`,
			);
		}
	}
	for (const branch of snapshot.branches) {
		if (branch.behind > 0) {
			warnings.push(
				`branch ${branch.name} is ${branch.behind} commit(s) behind ${base}`,
			);
		}
		if (branch.ahead > 0 && !branch.mergedIntoBase) {
			warnings.push(
				`branch ${branch.name} has ${branch.ahead} unmerged commit(s) ahead of ${base}`,
			);
		}
	}
	return warnings;
};

/**
 * f00075 S1: when the f00073 warnings are non-empty, also surface a
 * short GC dry-run summary so the orchestrator can decide whether to
 * call `branch_gc({ dryRun: false })`. Always fire-and-forget; never
 * blocks. Capped at 3 lines so the plan stays cheap.
 */
export const collectBranchHygieneHints = async (
	workspaceRoot: string,
	prefix: string,
): Promise<string[] | undefined> => {
	if (workspaceRoot.length === 0) return undefined;
	try {
		const result = await runBranchGcEngine({
			run: createGitRunner(workspaceRoot),
			workspaceRoot,
			dryRun: true,
		});
		return result.ok ? branchHygieneHintsFor(result, prefix) : undefined;
	} catch {
		return undefined;
	}
};

/** The GC dry-run summary: a count, the first three, and the call. */
export const branchHygieneHintsFor = (
	result: {
		readonly removed: readonly IGcPlanEntry[];
		readonly summary: { readonly dryRunRemovedCount: number };
	},
	prefix: string,
): string[] | undefined => {
	const eligible = result.removed.slice(0, 3);
	if (eligible.length === 0) return undefined;
	return [
		`branch_gc dry-run: ${result.summary.dryRunRemovedCount} worktree(s) eligible`,
		...eligible.map(
			(entry) =>
				`  · ${entry.path} (${entry.branch}) — ${entry.reason}, ${entry.dirtyFiles} dirty / ${entry.untrackedFiles} untracked, age ${entry.ageLabel}`,
		),
		`  run ${prefix}_branch_gc { dryRun: false, force: false } to actually remove (unmerged branches are always safe).`,
	];
};

const emptyHygieneFrontHook: IHygieneFrontHook = {
	executionMode: 'normal',
	hygieneBlockers: [],
	hygieneActions: [],
	hygieneWarnings: [],
	rescueCandidates: [],
	smokeResiduals: [],
	gcEligibleCount: 0,
	outOfCacheCount: 0,
	stashes: [],
};

/**
 * Build the strict-mode `blockers` lines from rescue candidates. One
 * line per candidate — short enough to stay cheap, structured enough
 * to point the operator at the right `cherryPickHint` (rendered via
 * `rescueCandidates[]` on the response payload, not duplicated here).
 */
export const rescueBlockersFor = (
	rescueCandidates: readonly IRescueCandidate[],
): string[] => {
	if (rescueCandidates.length === 0) return [];
	const blockers: string[] = [
		`${rescueCandidates.length} rescue candidate(s) ahead of develop and not merged — cherry-pick to develop or merge before starting new work`,
	];
	for (const r of rescueCandidates) {
		blockers.push(
			`  · ${r.branch} is ahead by ${r.ahead} commit(s) on ${r.worktreePath.length > 0 ? r.worktreePath : '(no worktree)'}`,
		);
	}
	return blockers;
};

/**
 * R-2026-08-31: smoke-residual lines are surfaced as **warnings**, not
 * blockers. They are rescue-candidate lookalikes (single-commit recent
 * or authored by the reserved `smoke-tester` identity) that the swarm
 * left behind; the auto_work cascade must proceed so the operator can
 * decide whether to delete them.
 */
export const smokeResidualWarningsFor = (
	smokeResiduals: readonly ISmokeResidualBranch[],
	prefix: string,
): string[] => {
	if (smokeResiduals.length === 0) return [];
	return [
		`${smokeResiduals.length} smoke-residual branch(es) detected (excluded from rescue-candidate block): delete with \`git branch -D <branch>\` or run \`${prefix}_branch_gc { dryRun: false }\` once older than the GC threshold.`,
	];
};

/**
 * Build the strict-mode `blockers` lines from the stash list. One
 * line per stash, capped at 5 to keep the plan cheap. The full
 * `stashes[]` array rides on the response so the operator can render
 * the dates and refs from the structured payload.
 */
const stashBlockersFor = (stashes: readonly IStashEntry[]): string[] => {
	if (stashes.length === 0) return [];
	const lines: string[] = [
		`${stashes.length} stash(es) present — pop + commit, apply, or drop before starting new work`,
	];
	for (const stash of stashes.slice(0, 5)) {
		const branchLabel = stash.branch ?? '(detached HEAD)';
		lines.push(`  · ${stash.ref} on ${branchLabel}: ${stash.message}`);
	}
	if (stashes.length > 5) {
		lines.push(
			`  · ...and ${stashes.length - 5} more (see stashes[] on the response)`,
		);
	}
	return lines;
};

/**
 * Build the GC dry-run summary lines. One-line summary plus the top 3
 * paths so the orchestrator can decide whether to escalate to
 * `proposals_branch_gc { dryRun: false }`. The full list of entries
 * already rides on `swarm_hygiene.gcEligible` — we don't duplicate
 * it here, just summarise.
 */
export const gcActionsFor = (
	gcEligible: readonly { readonly path: string; readonly branch: string }[],
	prefix: string,
): string[] => {
	if (gcEligible.length === 0) return [];
	const top = gcEligible.slice(0, 3);
	const lines: string[] = [
		`branch_gc dry-run would remove ${gcEligible.length} worktree(s) (review and run ${prefix}_branch_gc { dryRun: false } or pass forceHygieneBypass:true)`,
	];
	for (const entry of top) {
		lines.push(`  · ${entry.path} (${entry.branch})`);
	}
	if (gcEligible.length > 3) {
		lines.push(
			`  · ...and ${gcEligible.length - 3} more (see swarm_hygiene.gcEligible)`,
		);
	}
	return lines;
};

/**
 * Build the out-of-cache warning lines. One summary line — the full
 * list rides on `swarm_hygiene.outOfCache`.
 */
export const outOfCacheWarningsFor = (
	outOfCache: readonly { readonly path: string }[],
): string[] => {
	if (outOfCache.length === 0) return [];
	return [
		`${outOfCache.length} worktree(s) outside the canonical cache dir (AGENTS.md violation) — review and remove manually (see swarm_hygiene.outOfCache)`,
	];
};

/**
 * f00075 S4: front-hook that runs BEFORE slice selection. Returns the
 * computed `executionMode` plus the arrays that the plan surfaces.
 *
 * Decision matrix (per the proposal):
 *
 * | Snapshot state                | executionMode      | Effect on auto_work |
 * |-------------------------------|--------------------|---------------------|
 * | rescueCandidates.length > 0   | `'blocked'`        | Returns `{ ok: false, reason: 'hygiene-blocked', ... }` |
 * | stashes.length > 0            | `'blocked'`        | Same envelope.      |
 * | gcEligible.length > 0 (only)  | `'confirm-required'` | Plan proceeds with hygieneActions. |
 * | outOfCache.length > 0 (only)  | `'warning'`        | Plan proceeds with hygieneWarnings. |
 * | otherwise                     | `'normal'`         | Plan proceeds unchanged. |
 *
 * `forceBypass` skips the entire check and returns the empty
 * `IHygieneFrontHook`. The caller can still surface the bypass
 * decision via `executionMode: 'normal'` (no special "bypassed"
 * sentinel — the input echo already proves the intent).
 *
 * Idempotent and side-effect free: only runs read-only git commands
 * (`branch_status`, `branch_gc --dry-run`, `stash list`).
 */
export const collectHygieneFrontHook = async (
	workspaceRoot: string,
	forceBypass: boolean,
	prefix: string,
): Promise<IHygieneFrontHook> => {
	if (forceBypass) return emptyHygieneFrontHook;
	if (workspaceRoot.length === 0) return emptyHygieneFrontHook;
	try {
		const run = createGitRunner(workspaceRoot);
		const [hygiene, stashes] = await Promise.all([
			runSwarmHygieneEngine({ run, workspaceRoot }),
			runStashSnapshot({ run, workspaceRoot }),
		]);
		const rescueCandidates = hygiene.ok ? hygiene.rescueCandidates : [];
		const smokeResiduals = hygiene.ok ? hygiene.smokeResiduals : [];
		const gcEligible = hygiene.ok ? hygiene.gcEligible : [];
		const outOfCache = hygiene.ok ? hygiene.outOfCache : [];

		// R-2026-08-31: smoke-residuals do NOT count as rescue-candidate
		// blockers. They are surfaced on the response so the operator
		// can prune them, but they never gate the cascade.
		const rescueBlocked = rescueCandidates.length > 0;
		const stashBlocked = stashes.length > 0;
		const executionMode: IHygieneFrontHook['executionMode'] =
			rescueBlocked || stashBlocked
				? 'blocked'
				: gcEligible.length > 0
					? 'confirm-required'
					: 'normal';

		const hygieneBlockers = [
			...rescueBlockersFor(rescueCandidates),
			...stashBlockersFor(stashes),
		];
		const hygieneActions = gcActionsFor(gcEligible, prefix);
		const hygieneWarnings = [
			...outOfCacheWarningsFor(outOfCache),
			...smokeResidualWarningsFor(smokeResiduals, prefix),
		];

		return {
			executionMode,
			hygieneBlockers,
			hygieneActions,
			hygieneWarnings,
			rescueCandidates,
			smokeResiduals,
			gcEligibleCount: gcEligible.length,
			outOfCacheCount: outOfCache.length,
			stashes,
		};
	} catch {
		// Fail-soft: never let the front-hook kill the plan. If git
		// misbehaves, surface it as a warning and let the orchestrator
		// decide whether to retry or bypass.
		return emptyHygieneFrontHook;
	}
};
