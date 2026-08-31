/**
 * Pure engine for the `<prefix>_swarm_hygiene` tool (f00075 S2).
 *
 * Composes the three queries the orchestrator needs in one read-only
 * payload:
 *
 *   1. `rescueCandidates` — `ahead > 0 && mergedIntoBase === false`
 *      branches with unique commits that have not reached
 *      `baseBranch`. Each carries a `cherryPickHint` (copy-pasteable
 *      command) and a `diffStat` summary (read-only — the orchestrator
 *      or human decides whether to execute).
 *
 *   2. `gcEligible` — the dry-run plan from `branch_gc` (after the
 *      S0 fix). Lets the orchestrator preview exactly what would be
 *      removed in `branch_gc({ dryRun: false })` without firing it.
 *
 *   3. `outOfCache` — worktrees whose path lives outside the canonical
 *      cache dir. Always surface, never auto-remove.
 *
 * Pure over (workspaceRoot, options, IGitRunner): no filesystem
 * outside of git, never throws.
 */
import type { IGitRunner } from './git-runner';
import { runBranchGcEngine } from './branch-gc-engine';
import { runBranchStatusEngine } from './branch-status-engine';
import type { IPendingIntegrationEntry } from '../contracts/interfaces/pending-integration.interface';
import type {
	INonConformingBranch,
	IOutOfCacheWorktree,
	IRescueCandidate,
	ISmokeResidualBranch,
	IStaleUnmergedWorktree,
	ISwarmHygieneOutcome,
} from '../contracts/interfaces/swarm-hygiene.interface';

export interface ISwarmHygieneEngineOptions {
	readonly run: IGitRunner;
	readonly workspaceRoot: string;
	readonly baseBranch?: string;
	readonly staleMinutes?: number;
	readonly force?: boolean;
	readonly agentPrefix?: string;
	readonly now?: number;
	/**
	 * Truncation caps so the tool stays cheap. Default 20 rescue
	 * candidates, 20 GC entries, 20 out-of-cache.
	 */
	readonly maxRescueCandidates?: number;
	readonly maxGcEligible?: number;
	readonly maxOutOfCache?: number;
	/**
	 * f00091 S2: read the recorded pending-integration entries. Injected
	 * so the engine stays pure over I/O (production wires the
	 * `pending-integration-store`; tests pass a literal list). Omitted →
	 * no pending list (byte-identical to pre-f00091 output shape aside
	 * from the empty array + zero count).
	 */
	readonly readPendingIntegration?: () => Promise<
		readonly IPendingIntegrationEntry[]
	>;
	/**
	 * f00091 S2: prune entries whose branch is already integrated
	 * (`mergedIntoBase`). The engine computes the merged set from the
	 * snapshot and calls this so the on-disk list self-heals. Read-only
	 * over git; the only write is the store prune. Omitted → no prune
	 * (still filters the in-memory list it returns).
	 */
	readonly pruneIntegrated?: (
		integratedBranches: ReadonlySet<string>,
	) => Promise<void>;
	/**
	 * f00091 S4b: a worktree whose branch is unmerged AND `behind` base
	 * by more than this many commits is reported as `staleUnmerged`.
	 * Default 50. Zero disables the check.
	 */
	readonly staleBehindThreshold?: number;
	readonly maxPendingIntegration?: number;
	readonly maxNonConforming?: number;
	readonly maxStaleUnmerged?: number;
}

const DEFAULT_MAX_RESCUE = 20;
const DEFAULT_MAX_GC = 20;
const DEFAULT_MAX_OUT = 20;
const DEFAULT_MAX_PENDING = 50;
const DEFAULT_MAX_NON_CONFORMING = 50;
const DEFAULT_MAX_STALE_UNMERGED = 50;
const DEFAULT_STALE_BEHIND_THRESHOLD = 50;

/** Protected base branches that never count as "non-conforming". */
const PROTECTED_BASE_BRANCHES: ReadonlySet<string> = new Set([
	'main',
	'master',
	'develop',
]);

/** Produce a short diff-stat line via `git diff --shortstat`. */
const diffStatFor = async (
	run: IGitRunner,
	wtPath: string,
	baseBranch: string,
	branch: string,
): Promise<string> => {
	const result = await run([
		'-C',
		wtPath,
		'diff',
		'--shortstat',
		`${baseBranch}...${branch}`,
	]);
	if (!result.ok) return '';
	return result.output.trim();
};

/** Compose a copy-pasteable cherry-pick hint with the real worktree
 *  path. Falls back to a single-line `git log` review hint when the
 *  branch is not owned by a worktree (caller can still inspect the
 *  diff before committing to a strategy). */
const cherryPickHintFor = (
	branch: string,
	baseBranch: string,
	worktreePath: string,
): string => {
	if (worktreePath.length === 0) {
		return `git log ${baseBranch}..${branch}  # review the missing commits`;
	}
	return [
		`cd ${worktreePath} && \\`,
		`  git log ${baseBranch}..${branch}  # review the missing commits`,
		`  git -C ${worktreePath} fetch . ${branch}:${branch}  # (if not local)`,
		`  git -C ${worktreePath} checkout ${baseBranch} && \\`,
		`  git -C ${worktreePath} cherry-pick ${branch}~..${branch}`,
	].join(' && ');
};

/**
 * Core entry point. Snapshot the workspace, classify branches into
 * rescue / gc / out-of-cache buckets, then return a structured
 * payload. Never throws.
 */
export const runSwarmHygieneEngine = async (
	options: ISwarmHygieneEngineOptions,
): Promise<ISwarmHygieneOutcome> => {
	const baseBranch = options.baseBranch ?? 'develop';
	const maxRescue = options.maxRescueCandidates ?? DEFAULT_MAX_RESCUE;
	const maxGc = options.maxGcEligible ?? DEFAULT_MAX_GC;
	const maxOut = options.maxOutOfCache ?? DEFAULT_MAX_OUT;
	const maxPending = options.maxPendingIntegration ?? DEFAULT_MAX_PENDING;
	const maxNonConforming =
		options.maxNonConforming ?? DEFAULT_MAX_NON_CONFORMING;
	const maxStaleUnmerged =
		options.maxStaleUnmerged ?? DEFAULT_MAX_STALE_UNMERGED;
	const staleBehindThreshold =
		options.staleBehindThreshold ?? DEFAULT_STALE_BEHIND_THRESHOLD;
	const agentPrefix = options.agentPrefix ?? 'agent/';

	const snapshot = await runBranchStatusEngine({
		run: options.run,
		workspaceRoot: options.workspaceRoot,
		baseBranch,
		...(options.agentPrefix !== undefined
			? { agentPrefix: options.agentPrefix }
			: {}),
		...(options.now !== undefined ? { now: options.now } : {}),
	});
	if (!snapshot.ok) {
		return { ok: false, reason: snapshot.reason, baseBranch };
	}

	// R-2026-08-31: split rescue candidates by liveness. Smoke-residual
	// branches (reserved `smoke-tester` author OR single-commit recent
	// with a non-real author) used to block `auto_work` permanently —
	// the in-tree smoke harness creates them, leaves them behind, and
	// the orchestrator never had a way to distinguish them from a real
	// agent that walked away from its worktree. We now classify them
	// into `smokeResiduals[]` and exclude them from `rescueCandidates[]`,
	// so the auto_work front-hook only refuses the cascade when there
	// is genuinely unmerged human work at risk.
	const classifyRescue = async (
		b: (typeof snapshot.branches)[number],
	): Promise<
		| { kind: 'live'; branch: typeof b }
		| {
				kind: 'smoke';
				reason: ISmokeResidualBranch['reason'];
				branch: typeof b;
				authorEmail: string;
				head: string;
		  }
	> => {
		if (b.ahead <= 0 || b.mergedIntoBase)
			return { kind: 'live', branch: b };
		const headResult = await options.run([
			'log',
			'-1',
			'--format=%H|%ae',
			b.name,
		]);
		if (!headResult.ok) {
			// Cannot read author → treat as live so we err on the safe
			// side (don't drop real work on the floor).
			return { kind: 'live', branch: b };
		}
		const trimmed = headResult.output.trim();
		const pipe = trimmed.indexOf('|');
		if (pipe < 0) return { kind: 'live', branch: b };
		const head = trimmed.slice(0, pipe).trim();
		const authorEmail = trimmed.slice(pipe + 1).trim();
		const normalizedEmail = authorEmail.toLowerCase();
		if (normalizedEmail === 'smoke@local') {
			return {
				kind: 'smoke',
				reason: 'smoke-author',
				branch: b,
				authorEmail,
				head,
			};
		}
		if (
			b.ahead === 1 &&
			b.lastCommitMinutesAgo >= 0 &&
			b.lastCommitMinutesAgo <= 60
		) {
			// Single-commit branch younger than 1h. Almost always a
			// smoke artifact, but a real agent doing a fast one-shot
			// is also possible. We surface it as `smoke-residual` so
			// the operator can decide; the auto_work front-hook
			// ignores these.
			return {
				kind: 'smoke',
				reason: 'single-commit-recent',
				branch: b,
				authorEmail,
				head,
			};
		}
		return { kind: 'live', branch: b };
	};

	const classified = await Promise.all(
		snapshot.branches
			.filter((b) => b.ahead > 0 && !b.mergedIntoBase)
			.map(classifyRescue),
	);
	const liveBranches = classified.filter((c) => c.kind === 'live');
	const smokeResidualCandidates = classified.filter(
		(c) => c.kind === 'smoke',
	);

	const rescueCandidates: IRescueCandidate[] = [];
	for (const entry of liveBranches.slice(0, maxRescue)) {
		if (entry.kind !== 'live') continue;
		const branch = entry.branch;
		const wtPath =
			branch.worktreePath.length > 0
				? branch.worktreePath
				: options.workspaceRoot;
		const diffStat = await diffStatFor(
			options.run,
			wtPath,
			baseBranch,
			branch.name,
		);
		rescueCandidates.push({
			branch: branch.name,
			ahead: branch.ahead,
			behind: branch.behind,
			lastCommitMinutesAgo: branch.lastCommitMinutesAgo,
			worktreePath: branch.worktreePath,
			diffStat,
			cherryPickHint: cherryPickHintFor(
				branch.name,
				baseBranch,
				branch.worktreePath,
			),
		});
	}

	const smokeResiduals: ISmokeResidualBranch[] = [];
	for (const entry of smokeResidualCandidates.slice(0, maxRescue)) {
		if (entry.kind !== 'smoke') continue;
		smokeResiduals.push({
			branch: entry.branch.name,
			ahead: entry.branch.ahead,
			behind: entry.branch.behind,
			lastCommitMinutesAgo: entry.branch.lastCommitMinutesAgo,
			authorEmail: entry.authorEmail,
			head: entry.head,
			reason: entry.reason,
		});
	}

	// GC eligibility: reuse `runBranchGcEngine({ dryRun: true })` so
	// the S0 fix applies (resolves branch from each worktree).
	const gcResult = await runBranchGcEngine({
		run: options.run,
		workspaceRoot: options.workspaceRoot,
		baseBranch,
		dryRun: true,
		...(options.staleMinutes !== undefined
			? { staleMinutes: options.staleMinutes }
			: {}),
		...(options.force !== undefined ? { force: options.force } : {}),
		...(options.agentPrefix !== undefined
			? { agentPrefix: options.agentPrefix }
			: {}),
		...(options.now !== undefined ? { now: options.now } : {}),
	});
	const gcEligible =
		gcResult.ok && 'removed' in gcResult
			? gcResult.removed.slice(0, maxGc)
			: [];

	// Out-of-cache worktrees: any worktree whose path is outside the
	// canonical cache dir. Always flagged, never auto-removed.
	const outOfCache: IOutOfCacheWorktree[] = [];
	for (const wt of snapshot.worktrees) {
		if (!wt.outOfCache) continue;
		const branchEntry = snapshot.branches.find((b) => b.name === wt.branch);
		outOfCache.push({
			path: wt.path,
			branch: wt.branch,
			head: wt.head,
			lastCommitMinutesAgo: branchEntry?.lastCommitMinutesAgo ?? -1,
		});
		if (outOfCache.length >= maxOut) break;
	}

	// f00091 S4: inspect EVERY worktree (not just `agent/*` branches) so
	// the swarm's off-convention branches become visible. `snapshot.branches`
	// only carries `agent/*`; worktree branches outside the prefix (the
	// `feat/*`, `claude/*` the m3 incident created) have no ahead/behind
	// there, so we compute those on demand via `git`.
	const nonConformingBranches: INonConformingBranch[] = [];
	const staleUnmerged: IStaleUnmergedWorktree[] = [];
	for (const wt of snapshot.worktrees) {
		if (wt.branch.length === 0) continue; // detached: nothing to converge
		if (PROTECTED_BASE_BRANCHES.has(wt.branch)) continue;
		if (wt.branch === baseBranch) continue;

		const conforms =
			agentPrefix.length === 0 || wt.branch.startsWith(agentPrefix);
		if (!conforms && nonConformingBranches.length < maxNonConforming) {
			nonConformingBranches.push({
				path: wt.path,
				branch: wt.branch,
				head: wt.head,
				reason: 'non-agent-prefix',
			});
		}

		// S4b: a worktree whose branch is unmerged AND far behind base.
		// Prefer the already-computed snapshot entry (agent/* branches);
		// otherwise query git for the non-conforming branch.
		if (
			staleBehindThreshold > 0 &&
			staleUnmerged.length < maxStaleUnmerged
		) {
			const known = snapshot.branches.find((b) => b.name === wt.branch);
			const stats = known
				? {
						ahead: known.ahead,
						behind: known.behind,
						mergedIntoBase: known.mergedIntoBase,
						lastCommitMinutesAgo: known.lastCommitMinutesAgo,
					}
				: await branchStatsFor(options.run, wt.branch, baseBranch);
			if (!stats.mergedIntoBase && stats.behind > staleBehindThreshold) {
				staleUnmerged.push({
					path: wt.path,
					branch: wt.branch,
					ahead: stats.ahead,
					behind: stats.behind,
					lastCommitMinutesAgo: stats.lastCommitMinutesAgo,
				});
			}
		}
	}

	// f00091 S2: pending-integration list. Prune any entry whose branch
	// has already merged into base (self-healing), then surface the rest.
	// The prune is the only write and it is registry bookkeeping — never
	// a git mutation.
	const mergedBranches = new Set(
		snapshot.branches.filter((b) => b.mergedIntoBase).map((b) => b.name),
	);
	let pendingIntegration: readonly IPendingIntegrationEntry[] = [];
	if (options.readPendingIntegration !== undefined) {
		const recorded = await options.readPendingIntegration();
		pendingIntegration = recorded
			.filter((e) => !mergedBranches.has(e.branch))
			.slice(0, maxPending);
		if (
			options.pruneIntegrated !== undefined &&
			recorded.some((e) => mergedBranches.has(e.branch))
		) {
			await options.pruneIntegrated(mergedBranches);
		}
	}

	const generatedAt = new Date(options.now ?? Date.now()).toISOString();
	return {
		ok: true,
		baseBranch,
		generatedAt,
		rescueCandidates,
		gcEligible,
		smokeResiduals,
		outOfCache: outOfCache.slice(0, maxOut),
		mainCheckoutBranch: snapshot.mainCheckoutBranch,
		mainCheckoutDrift: snapshot.mainCheckoutDrift,
		pendingIntegration,
		nonConformingBranches,
		staleUnmerged,
		summary: {
			rescueCandidatesCount: rescueCandidates.length,
			gcEligibleCount: gcEligible.length,
			outOfCacheCount: outOfCache.length,
			pendingIntegrationCount: pendingIntegration.length,
			nonConformingBranchesCount: nonConformingBranches.length,
			staleUnmergedCount: staleUnmerged.length,
			smokeResidualsCount: smokeResiduals.length,
		},
	};
};

/**
 * f00091 S4b: compute ahead/behind/merged/age for a worktree branch that
 * is NOT in the `agent/*` snapshot (a non-conforming branch). Read-only
 * over git; every failure degrades to a conservative default so the
 * engine never throws and never falsely flags a branch as stale.
 */
const branchStatsFor = async (
	run: IGitRunner,
	branch: string,
	base: string,
): Promise<{
	ahead: number;
	behind: number;
	mergedIntoBase: boolean;
	lastCommitMinutesAgo: number;
}> => {
	const abResult = await run([
		'rev-list',
		'--left-right',
		'--count',
		`${base}...${branch}`,
	]);
	let ahead = 0;
	let behind = 0;
	if (abResult.ok) {
		const parts = abResult.output.trim().split(/\s+/u);
		behind = Number.parseInt(parts[0] ?? '0', 10);
		ahead = Number.parseInt(parts[1] ?? '0', 10);
		if (!Number.isFinite(behind)) behind = 0;
		if (!Number.isFinite(ahead)) ahead = 0;
	}
	// Merged = tip reachable from base AND no unique commits (ahead === 0).
	// Mirrors branch-status-engine's two-check rule so both agree.
	const mergedListResult = await run([
		'branch',
		'--list',
		'--merged',
		base,
		branch,
	]);
	const branchMerged =
		mergedListResult.ok &&
		mergedListResult.output
			.split('\n')
			.map((line) => line.trim().replace(/^\*\s*/u, ''))
			.some((line) => line === branch);
	const mergedIntoBase = branchMerged && ahead === 0;

	let lastCommitMinutesAgo = -1;
	const logResult = await run(['log', '-1', '--format=%ct', branch]);
	if (logResult.ok) {
		const ts = Number.parseInt(logResult.output.trim(), 10);
		if (Number.isFinite(ts)) {
			lastCommitMinutesAgo = Math.max(
				0,
				Math.round((Date.now() / 1000 - ts) / 60),
			);
		}
	}
	return { ahead, behind, mergedIntoBase, lastCommitMinutesAgo };
};
