#!/usr/bin/env bun
/**
 * agent-branch-naming.script.ts — a00069 S4.
 *
 * Lint gate over local `agent/*` branches — the per-agent worktree
 * isolation shape, gated by `agentWorktree`. This is a DIFFERENT
 * concern from the `wip/*` branches agents use to land work on
 * `develop` through a PR: `wip/*` (like `fix/*`, `feature/*`) is never
 * inspected here and always passes through untouched, regardless of
 * the `agentWorktree` gate.
 *
 * Policy:
 *   1. Every local branch matching `agent/*` must satisfy
 *      `^agent/[a-z][a-z0-9-]+-[a-z][a-z0-9-]+(-[a-z][a-z0-9-]+)?$`
 *      (model token + proposal-id token + optional slice token).
 *   2. When `agentWorktree` is not true in delendai.config.json,
 *      ANY local `agent/*` branch is a violation (shared-checkout
 *      mode forbids agent worktree branches — agents work on `wip/*`
 *      or commit on `develop` instead).
 *   3. When a branch has no attached worktree it is flagged
 *      `outOfCache: true` (orphan branch, consistent with f00073).
 *
 * Pure engine is exported for unit tests; the CLI shell shells out
 * to `git branch` / `git worktree list` and reads the host config.
 */
import { spawnSync } from 'node:child_process';

import { readAgentWorktreeFlag } from './lib/agent-worktree-flag.lib';

/**
 * model + proposal-id + optional slice. Tokens are lowercase alnum
 * with internal hyphens, start with a letter. Examples that PASS:
 *   agent/copilot-minimax-m3-a00067
 *   agent/copilot-minimax-m3-f00121-s1
 * Examples that FAIL (F4 table):
 *   agent/copilot-minimax-doctor-skip-optin   (no proposal id)
 *   agent/copilot-minimax-f00120-s2-done      (extra -done; still 4 tokens
 *                                            after agent/ — see isValid)
 * The regex itself enforces at most 3 hyphen-separated segments after
 * `agent/`. "done"/"s2-s4" multi-suffixes push past that.
 */
/**
 * Loose shape check (lowercase path under agent/). Semantic rules live
 * in `isValidAgentBranchName` — the character class alone is too greedy
 * to encode "model + proposal id + optional slice".
 */
export const AGENT_BRANCH_PATTERN = /^agent\/[a-z][a-z0-9-]*$/;

/**
 * `agent/<model-tokens…>-<proposalId>[-sN[-slug]]`
 *
 * - ≥3 model tokens before the proposal id (e.g. `copilot-minimax-m3`)
 *   so bare `agent/copilot-minimax-f00120-s1` (F4 ✗) is rejected while
 *   `agent/copilot-minimax-m3-f00120-s1` (F4 ✓) passes.
 * - proposal id: letter + ≥4 digits (`a00067`, `f00121`, `c00123`).
 * - optional trailing slice: `s\d+` alone or `s\d+-<slug>` (allows
 *   `s2-polish`; rejects bare `-done` / `-fix` without an `sN` prefix
 *   and rejects multi-slice `-s2-s4`).
 */
export const isValidAgentBranchName = (name: string): boolean => {
	if (!name.startsWith('agent/')) return false;
	if (!AGENT_BRANCH_PATTERN.test(name)) return false;
	const parts = name.slice('agent/'.length).split('-');
	const propIdx = parts.findIndex((p) => /^[a-z]\d{4,}$/.test(p));
	if (propIdx < 3) return false; // need ≥3 model tokens before the id
	const model = parts.slice(0, propIdx);
	if (!model.every((p) => /^[a-z][a-z0-9]*$/.test(p))) return false;
	const after = parts.slice(propIdx + 1);
	if (after.length === 0) return true;
	if (after.length === 1) return /^s\d+$/.test(after[0] ?? '');
	if (after.length === 2) {
		const slice = after[0] ?? '';
		const slug = after[1] ?? '';
		// Slice must be `sN`. Slug must be a non-status word and must not
		// itself look like another slice (`s4`) — that covers F4's
		// `-s2-done` and `-s2-s4` while still allowing `-s2-polish`.
		const bannedSlugs = new Set([
			'done',
			'fix',
			'wip',
			'tmp',
			'temp',
			'final',
			'old',
		]);
		return (
			/^s\d+$/.test(slice) &&
			/^[a-z][a-z0-9]*$/.test(slug) &&
			!/^s\d+$/.test(slug) &&
			!bannedSlugs.has(slug)
		);
	}
	return false;
};

export interface IAgentBranchSnapshot {
	readonly name: string;
	readonly hasWorktree: boolean;
}

export interface IAgentBranchNamingInput {
	readonly branches: readonly IAgentBranchSnapshot[];
	/** Resolved `delendai.config.json#agentWorktree` (default false). */
	readonly agentWorktreeEnabled: boolean;
}

export interface IAgentBranchViolation {
	readonly branch: string;
	readonly reason: string;
	readonly outOfCache: boolean;
}

export type AgentBranchNamingResult =
	| { readonly ok: true; readonly checked: number }
	| {
			readonly ok: false;
			readonly checked: number;
			readonly violations: readonly IAgentBranchViolation[];
	  };

/** Pure decision engine. No I/O. */
export const lintAgentBranchNaming = (
	input: IAgentBranchNamingInput,
): AgentBranchNamingResult => {
	const violations: IAgentBranchViolation[] = [];
	for (const branch of input.branches) {
		if (!branch.name.startsWith('agent/')) continue;
		const outOfCache = !branch.hasWorktree;
		if (!input.agentWorktreeEnabled) {
			violations.push({
				branch: branch.name,
				reason: 'agentWorktree is false — local agent/* branches are forbidden on a shared checkout',
				outOfCache,
			});
			continue;
		}
		if (!isValidAgentBranchName(branch.name)) {
			violations.push({
				branch: branch.name,
				reason: 'name must match agent/<model>-<proposalId>[-<slice>] (lowercase; proposal id like f00121)',
				outOfCache,
			});
			continue;
		}
		if (outOfCache) {
			violations.push({
				branch: branch.name,
				reason: 'orphan agent/* branch with no attached worktree',
				outOfCache: true,
			});
		}
	}
	if (violations.length === 0) {
		return { ok: true, checked: input.branches.length };
	}
	return {
		ok: false,
		checked: input.branches.length,
		violations,
	};
};

// ---------- CLI shell ----------

const readLocalAgentBranches = (cwd: string): string[] => {
	const res = spawnSync(
		'git',
		['branch', '--list', 'agent/*', '--format=%(refname:short)'],
		{
			cwd,
			encoding: 'utf8',
		},
	);
	if (res.status !== 0) return [];
	return (res.stdout ?? '')
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.startsWith('agent/'));
};

const readWorktreeBranches = (cwd: string): Set<string> => {
	const res = spawnSync('git', ['worktree', 'list', '--porcelain'], {
		cwd,
		encoding: 'utf8',
	});
	const set = new Set<string>();
	if (res.status !== 0) return set;
	for (const line of (res.stdout ?? '').split('\n')) {
		if (!line.startsWith('branch ')) continue;
		const ref = line.slice('branch '.length).trim();
		// refs/heads/agent/foo → agent/foo
		const name = ref.replace(/^refs\/heads\//, '');
		if (name.startsWith('agent/')) set.add(name);
	}
	return set;
};

const formatReport = (result: AgentBranchNamingResult): string => {
	if (result.ok) {
		return `✓ agent-branch-naming: ok (${result.checked} agent/* branch(es) checked)\n`;
	}
	const lines = [
		`✗ agent-branch-naming: ${result.violations.length} violation(s) across ${result.checked} branch(es)`,
		'',
	];
	for (const v of result.violations) {
		const flag = v.outOfCache ? ' [outOfCache]' : '';
		lines.push(`  - ${v.branch}${flag}: ${v.reason}`);
	}
	lines.push('');
	return lines.join('\n');
};

export interface ICliArgs {
	readonly cwd: string;
	/** Injected branch list (tests / dry runs). */
	readonly branches?: readonly string[];
	readonly agentWorktree?: boolean;
	readonly worktrees?: readonly string[];
}

export const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	const branches: string[] = [];
	let agentWorktree: boolean | undefined;
	const worktrees: string[] = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--branch': {
				const v = argv[++i];
				if (v) branches.push(v);
				break;
			}
			case '--agent-worktree': {
				const v = argv[++i];
				agentWorktree = v === 'true' || v === '1';
				break;
			}
			case '--worktree-branch': {
				const v = argv[++i];
				if (v) worktrees.push(v);
				break;
			}
			default:
				break;
		}
	}
	return {
		cwd,
		...(branches.length > 0 ? { branches } : {}),
		...(agentWorktree !== undefined ? { agentWorktree } : {}),
		...(worktrees.length > 0 ? { worktrees } : {}),
	};
};

export const runAgentBranchNaming = (
	args: ICliArgs,
): AgentBranchNamingResult => {
	const names =
		args.branches !== undefined
			? [...args.branches]
			: readLocalAgentBranches(args.cwd);
	const worktreeSet =
		args.worktrees !== undefined
			? new Set(args.worktrees)
			: readWorktreeBranches(args.cwd);
	const agentWorktreeEnabled =
		args.agentWorktree !== undefined
			? args.agentWorktree
			: readAgentWorktreeFlag(args.cwd);
	const branches: IAgentBranchSnapshot[] = names.map((name) => ({
		name,
		hasWorktree: worktreeSet.has(name),
	}));
	return lintAgentBranchNaming({ branches, agentWorktreeEnabled });
};

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	const result = runAgentBranchNaming(args);
	const report = formatReport(result);
	if (result.ok) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
