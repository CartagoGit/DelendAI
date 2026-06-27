/**
 * Pure engine for the `<prefix>_branch_status` tool (f00073).
 *
 * Inspects every `agent/*` local branch + every `git worktree` in the
 * workspace and returns a compact snapshot the swarm (or the
 * orchestrator) can use to answer "what is everyone else doing right
 * now?" without grep:
 *
 *   - per-branch:  ahead/behind counts vs `develop`, last-commit age,
 *                  merged flag, worktreePath (if any).
 *   - per-worktree: dirty + untracked file counts, out-of-cache flag.
 *   - aggregate:    summary counts (branches, worktrees, orphans,
 *                   outOfCache, dirty, untracked).
 *
 * The engine is pure over its inputs:
 *   - takes an `IGitRunner` (production = real `git`, tests = stub).
 *   - never touches the filesystem except through `git` (so a slow
 *     network or a dead SSH remote cannot stall the MCP event loop).
 *   - never throws: every failure comes back as `{ ok: false, reason }`
 *     so the caller can surface it without breaking the rest of the
 *     snapshot.
 *
 * Mirrors the contract of `agent-worktree-engine.ts` (pure, async,
 * `IGitRunner`-only) so the tool wrapper stays a thin façade.
 */
import { join, relative, resolve } from 'node:path';

import type { IGitRunner } from './git-runner';

/** Result type for one branch (always local, agent/* by default). */
export interface IBranchStatusEntry {
	/** Local branch name without `refs/heads/` (e.g. `agent/orion`). */
	readonly name: string;
	/** Short SHA of the branch tip. Empty when the branch has no commits. */
	readonly head: string;
	/** Commits in this branch not in `baseBranch` (`git rev-list --count`). */
	readonly ahead: number;
	/** Commits in `baseBranch` not in this branch. */
	readonly behind: number;
	/** True when the branch tip is reachable from `baseBranch` (already merged). */
	readonly mergedIntoBase: boolean;
	/** Last commit age, in minutes since `now`. -1 when unknown. */
	readonly lastCommitMinutesAgo: number;
	/** Absolute path of the worktree that owns this branch, or empty string. */
	readonly worktreePath: string;
}

/** Result type for one worktree entry. */
export interface IWorktreeStatusEntry {
	/** Absolute path of the worktree on disk. */
	readonly path: string;
	/** Short SHA of the worktree HEAD. */
	readonly head: string;
	/** Branch checked out in the worktree (empty when detached). */
	readonly branch: string;
	/** `true` when `path` is outside `<cacheDir>/mcp-vertex/.worktrees/`. */
	readonly outOfCache: boolean;
	/** `git status --porcelain` row count (modified + deleted + staged). */
	readonly dirtyFiles: number;
	/** Files in `git status --porcelain` whose first column is `??`. */
	readonly untrackedFiles: number;
	/** Short label like "5d", "12h", "30m", or "0m" for fresh worktrees. */
	readonly ageLabel: string;
}

/** Aggregate counters the orchestrator can surface in one line. */
export interface IBranchStatusSummary {
	readonly totalBranches: number;
	readonly totalWorktrees: number;
	readonly mergedCount: number;
	readonly aheadOfBaseCount: number;
	readonly behindBaseCount: number;
	readonly dirtyWorktrees: number;
	readonly untrackedWorktrees: number;
	readonly outOfCacheWorktrees: number;
}

export interface IBranchStatusResult {
	readonly ok: true;
	readonly baseBranch: string;
	readonly branches: readonly IBranchStatusEntry[];
	readonly worktrees: readonly IWorktreeStatusEntry[];
	readonly summary: IBranchStatusSummary;
	/** `now` echoed back so the caller can spot stale snapshots. ISO-8601. */
	readonly generatedAt: string;
}

export interface IBranchStatusFailure {
	readonly ok: false;
	readonly reason: string;
	readonly baseBranch?: string;
}

export type IBranchStatusOutcome = IBranchStatusResult | IBranchStatusFailure;

export interface IBranchStatusEngineOptions {
	/** Async git runner; production = `createGitRunner(workspaceRoot)`. */
	readonly run: IGitRunner;
	/** Absolute repo root (`git rev-parse --show-toplevel` result). */
	readonly workspaceRoot: string;
	/**
	 * Branch used as the "base" for ahead/behind + merged checks.
	 * Default: `develop`. Hosts can override for trunk-based flows.
	 */
	readonly baseBranch?: string;
	/**
	 * Prefix that identifies "agent" branches. Default `agent/`. Only
	 * branches whose name starts with this prefix appear in
	 * `branches[]`. Pass `""` to include every local branch.
	 */
	readonly agentPrefix?: string;
	/**
	 * Absolute path of the canonical worktrees directory. A worktree
	 * whose `path` does not live under here is flagged
	 * `outOfCache: true` (AGENTS.md invariant violation).
	 * Default: `<workspaceRoot>/.cache/mcp-vertex/.worktrees`.
	 */
	readonly canonicalWorktreesDir?: string;
	/**
	 * `now` (ms since epoch). Tests inject a fixed instant; production
	 * callers omit this and the engine reads `Date.now()` once.
	 */
	readonly now?: number;
}

const AGE_LABEL_BUCKETS: ReadonlyArray<readonly [number, string]> = [
	[60, 'm'],
	[60 * 60, 'h'],
	[60 * 60 * 24, 'd'],
];

const ageLabelFor = (minutes: number): string => {
	if (minutes < 0) return '?';
	if (minutes < 1) return '0m';
	for (const [unit, suffix] of AGE_LABEL_BUCKETS) {
		if (minutes < unit)
			return `${Math.max(1, Math.round(minutes / (unit / 60)))}${suffix}`;
	}
	return `${Math.round(minutes / (60 * 24))}d`;
};

/** Parse `git branch --list` into an array of short branch names. */
export const parseBranchList = (raw: string): readonly string[] =>
	raw
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('*'))
		.map((line) => (line.startsWith('(HEAD detached at ') ? '' : line))
		.filter((line) => line.length > 0);

/** Parse `git status --porcelain` into (dirty, untracked) counts. */
export const parseStatusPorcelain = (
	raw: string,
): { dirty: number; untracked: number } => {
	let dirty = 0;
	let untracked = 0;
	for (const line of raw.split('\n')) {
		if (line.length < 2) continue;
		const xy = line.slice(0, 2);
		if (xy === '??') {
			untracked++;
		} else {
			dirty++;
		}
	}
	return { dirty, untracked };
};

const countLines = (raw: string): number => {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return 0;
	return trimmed.split('\n').length;
};

const commitMinutesAgo = async (
	run: IGitRunner,
	branch: string,
	now: number,
): Promise<number> => {
	const result = await run(['log', '-1', '--format=%ct', branch]);
	if (!result.ok) return -1;
	const trimmed = result.output.trim();
	const ts = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(ts)) return -1;
	return Math.max(0, Math.round((now / 1000 - ts) / 60));
};

const shortHead = async (run: IGitRunner, ref: string): Promise<string> => {
	const result = await run(['rev-parse', '--short', ref]);
	return result.ok ? result.output.trim().slice(0, 7) : '';
};

const aheadBehind = async (
	run: IGitRunner,
	branch: string,
	base: string,
): Promise<{ ahead: number; behind: number }> => {
	const result = await run([
		'rev-list',
		'--left-right',
		'--count',
		`${base}...${branch}`,
	]);
	if (!result.ok) return { ahead: 0, behind: 0 };
	const parts = result.output.trim().split(/\s+/u);
	if (parts.length < 2) return { ahead: 0, behind: 0 };
	const behind = Number.parseInt(parts[0] ?? '0', 10);
	const ahead = Number.parseInt(parts[1] ?? '0', 10);
	return {
		ahead: Number.isFinite(ahead) ? ahead : 0,
		behind: Number.isFinite(behind) ? behind : 0,
	};
};

const mergedInto = async (
	run: IGitRunner,
	branch: string,
	base: string,
): Promise<boolean> => {
	const result = await run(['branch', '--list', '--merged', base, branch]);
	if (!result.ok) return false;
	return result.output
		.split('\n')
		.map((line) => line.trim().replace(/^\*\s*/u, ''))
		.some((line) => line === branch);
};

/** Resolve canonical worktrees dir from workspaceRoot + cacheDirRel. */
const resolveCanonicalWorktreesDir = (
	options: IBranchStatusEngineOptions,
): string =>
	options.canonicalWorktreesDir ??
	resolve(options.workspaceRoot, '.cache', 'mcp-vertex', '.worktrees');

const isUnderDir = (path: string, dir: string): boolean => {
	const rel = relative(dir, path);
	return !rel.startsWith('..') && !rel.startsWith('/');
};

/**
 * Core entry point. Inspects the workspace and returns either a full
 * `IBranchStatusResult` or a structured `{ ok: false, reason }` —
 * never throws.
 */
export const runBranchStatusEngine = async (
	options: IBranchStatusEngineOptions,
): Promise<IBranchStatusOutcome> => {
	const run = options.run;
	const baseBranch = options.baseBranch ?? 'develop';
	const agentPrefix = options.agentPrefix ?? 'agent/';
	const now = options.now ?? Date.now();
	const generatedAt = new Date(now).toISOString();
	const canonicalDir = resolveCanonicalWorktreesDir(options);

	// 1. List local branches that match the agent prefix.
	const branchListResult = await run(['branch', '--list', `${agentPrefix}*`]);
	if (!branchListResult.ok) {
		return {
			ok: false,
			reason: branchListResult.reason ?? 'git branch --list failed',
			baseBranch,
		};
	}
	const branchNames = parseBranchList(branchListResult.output).filter(
		(name) =>
			agentPrefix.length === 0 ? true : name.startsWith(agentPrefix),
	);

	// 2. List worktrees (porcelain).
	const worktreeListResult = await run(['worktree', 'list', '--porcelain']);
	if (!worktreeListResult.ok) {
		return {
			ok: false,
			reason: worktreeListResult.reason ?? 'git worktree list failed',
			baseBranch,
		};
	}
	const worktrees: IWorktreeStatusEntry[] = [];
	for (const block of worktreeListResult.output
		.split('\n\n')
		.map((b) => b.trim())
		.filter((b) => b.length > 0)) {
		let path = '';
		let head = '';
		let branch = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('worktree '))
				path = line.slice('worktree '.length);
			else if (line.startsWith('HEAD '))
				head = line.slice('HEAD '.length).slice(0, 7);
			else if (line.startsWith('branch '))
				branch = line
					.slice('branch '.length)
					.replace(/^refs\/heads\//, '');
		}
		if (path.length === 0) continue;
		const statusResult = await run(['-C', path, 'status', '--porcelain']);
		const counts = statusResult.ok
			? parseStatusPorcelain(statusResult.output)
			: { dirty: 0, untracked: 0 };
		const ageMin = await commitMinutesAgo(
			run,
			branch.length > 0 ? branch : 'HEAD',
			now,
		);
		worktrees.push({
			path,
			head,
			branch,
			outOfCache: !isUnderDir(path, canonicalDir),
			dirtyFiles: counts.dirty,
			untrackedFiles: counts.untracked,
			ageLabel: ageLabelFor(ageMin),
		});
	}

	// 3. Per-branch: ahead/behind + merged + age.
	const branchWorktreeByName = new Map<string, string>();
	for (const wt of worktrees) {
		if (wt.branch.length > 0) branchWorktreeByName.set(wt.branch, wt.path);
	}
	const branches: IBranchStatusEntry[] = [];
	for (const name of branchNames) {
		const [ab, merged, head, ageMin] = await Promise.all([
			aheadBehind(run, name, baseBranch),
			mergedInto(run, name, baseBranch),
			shortHead(run, name),
			commitMinutesAgo(run, name, now),
		]);
		branches.push({
			name,
			head,
			ahead: ab.ahead,
			behind: ab.behind,
			mergedIntoBase: merged,
			lastCommitMinutesAgo: ageMin,
			worktreePath: branchWorktreeByName.get(name) ?? '',
		});
	}

	const mergedCount = branches.filter((b) => b.mergedIntoBase).length;
	const aheadOfBaseCount = branches.filter((b) => b.ahead > 0).length;
	const behindBaseCount = branches.filter((b) => b.behind > 0).length;
	const dirtyWorktrees = worktrees.filter((w) => w.dirtyFiles > 0).length;
	const untrackedWorktrees = worktrees.filter(
		(w) => w.untrackedFiles > 0,
	).length;
	const outOfCacheWorktrees = worktrees.filter((w) => w.outOfCache).length;

	return {
		ok: true,
		baseBranch,
		branches,
		worktrees,
		summary: {
			totalBranches: branches.length,
			totalWorktrees: worktrees.length,
			mergedCount,
			aheadOfBaseCount,
			behindBaseCount,
			dirtyWorktrees,
			untrackedWorktrees,
			outOfCacheWorktrees,
		},
		generatedAt,
	};
};

// Re-export `join` so downstream code can compose paths without
// re-importing node:path (tests use it for fixture dirs).
export { join, resolve };
