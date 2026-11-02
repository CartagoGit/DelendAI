import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

/**
 * A fixture-backed git runner for the swarm-hygiene engine specs: it
 * synthesises the output the status, GC and hygiene engines consume and
 * lets a spec record every invocation.
 */
export const ROOT = '/ws';
export const CACHE_WT = `${ROOT}/.cache/delendai/.worktrees`;
export const BASE = 'develop';
export const FIXED_NOW = Date.parse('2026-07-02T12:00:00.000Z');

export interface IBranchFixture {
	readonly ahead: number;
	readonly behind: number;
	readonly merged: boolean;
	readonly minutesAgo: number;
	readonly head: string;
	/** Worktree path; omitted → branch has no worktree. */
	readonly worktreePath?: string;
	/** Whether `git branch --list agent/*` reports it (agent-prefixed). */
	readonly inAgentList: boolean;
}

/**
 * Any git verb that mutates repo state. `close_slice`/`swarm_hygiene` must
 * never issue one — integration is a deliberate human/orchestrator action.
 * (`branch --list …` is read-only; `branch -d/-D` is not — hence the token
 * scan below rather than a bare `branch` match.)
 */
export const DESTRUCTIVE_VERBS = new Set([
	'merge',
	'rebase',
	'reset',
	'push',
	'cherry-pick',
	'checkout',
	'switch',
	'commit',
	'clean',
	'stash',
	'apply',
]);

export const isDestructive = (args: readonly string[]): boolean => {
	// A `worktree remove|prune|add` or a `branch -d|-D|--delete` mutates too.
	if (
		args[0] === 'worktree' &&
		['remove', 'prune', 'add'].includes(args[1] ?? '')
	)
		return true;
	if (
		args[0] === 'branch' &&
		['-d', '-D', '--delete', '--force'].some((f) => args.includes(f))
	)
		return true;
	return args.some((a) => DESTRUCTIVE_VERBS.has(a));
};

/** Extract the branch tip from a `base...branch` / `base..branch` range. */
export const tipOf = (range: string): string => {
	const sep = range.includes('...') ? '...' : '..';
	return range.split(sep).pop() ?? '';
};

export const makeRunner = (
	fixtures: Readonly<Record<string, IBranchFixture>>,
	calls: string[][],
): IGitRunner => {
	const agentBranches = Object.entries(fixtures)
		.filter(([, f]) => f.inAgentList)
		.map(([name]) => name);
	const worktreeEntries = Object.entries(fixtures).filter(
		([, f]) => f.worktreePath !== undefined,
	);

	return async (args: readonly string[]) => {
		calls.push([...args]);

		// `git branch --list agent/*`  (agent-branch enumeration)
		if (
			args[0] === 'branch' &&
			args[1] === '--list' &&
			args[2] !== '--merged'
		) {
			return {
				ok: true,
				output: agentBranches.map((n) => `  ${n}`).join('\n'),
			};
		}

		// `git branch --list --merged <base> <branch>`  (merged reachability)
		if (
			args[0] === 'branch' &&
			args[1] === '--list' &&
			args[2] === '--merged'
		) {
			const branch = args[4] ?? '';
			const merged = fixtures[branch]?.merged ?? false;
			return { ok: true, output: merged ? `  ${branch}` : '' };
		}

		// `git worktree list --porcelain`
		if (args[0] === 'worktree' && args[1] === 'list') {
			const blocks = worktreeEntries.map(([name, f]) =>
				[
					`worktree ${f.worktreePath}`,
					`HEAD ${f.head}`,
					`branch refs/heads/${name}`,
				].join('\n'),
			);
			return { ok: true, output: blocks.join('\n\n') };
		}

		// `git -C <path> status --porcelain`  (clean everywhere)
		if (args.includes('status')) return { ok: true, output: '' };

		// `git -C <path> diff --shortstat base...branch`
		if (args.includes('diff')) {
			const range = args[args.length - 1] ?? '';
			const branch = tipOf(range);
			const f = fixtures[branch];
			return {
				ok: true,
				output: f
					? ` 2 files changed, ${f.ahead * 3} insertions(+)`
					: '',
			};
		}

		// `git rev-list --left-right --count base...branch`  → "behind\tahead"
		if (args[0] === 'rev-list' && args[1] === '--left-right') {
			const branch = tipOf(args[3] ?? '');
			const f = fixtures[branch];
			return { ok: true, output: f ? `${f.behind}\t${f.ahead}` : '0\t0' };
		}

		// `git rev-list --count base..branch`  → ahead gap
		if (args[0] === 'rev-list' && args[1] === '--count') {
			const branch = tipOf(args[2] ?? '');
			const f = fixtures[branch];
			return { ok: true, output: String(f ? f.ahead : 0) };
		}

		// `git log -1 --format=%ct <branch>`  → commit timestamp
		if (args[0] === 'log') {
			const branch = args[args.length - 1] ?? '';
			const f = fixtures[branch];
			const ts =
				f && f.minutesAgo >= 0
					? Math.round(FIXED_NOW / 1000 - f.minutesAgo * 60)
					: 0;
			return { ok: true, output: String(ts) };
		}

		// `git rev-parse --short <ref>`
		if (args[0] === 'rev-parse') {
			const ref = args[args.length - 1] ?? '';
			return {
				ok: true,
				output: (fixtures[ref]?.head ?? 'deadbee').slice(0, 7),
			};
		}

		return { ok: true, output: '' };
	};
};

export const wtPath = (branch: string): string =>
	`${CACHE_WT}/${branch.replace(/\W+/gu, '-')}`;
