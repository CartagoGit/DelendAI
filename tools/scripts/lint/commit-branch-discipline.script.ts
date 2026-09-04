#!/usr/bin/env bun
/**
 * commit-branch-discipline.script.ts — f00086 S1 (refined 2026-08-31:
 * shared checkout permits develop and release/* only).
 *
 * Pre-commit guard. Pure function over
 * `(cwd, stagedFiles, currentBranch, agentWorktreeEnabled)` →
 * `{ ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (config-driven):
 *   - `develop` → always allowed to commit on. This hook only governs
 *     commits; landing that commit on `develop` still requires opening
 *     a PR from a `wip/*` branch — `push-to-develop-discipline`
 *     (pre-push) and `commit-policy`'s push driver both refuse a
 *     direct push there independently.
 *   - Detached HEAD (`null` / empty) → fail-open (release hotfix).
 *   - When `agentWorktree: true` → every branch is allowed: `agent/*`
 *     branches are the expected per-agent isolation shape.
 *   - When `agentWorktree: false` (this repo) → only `release/*` is an
 *     additional commit branch; arbitrary working branches are blocked.
 *
 * Default behaviour: **block only `agent/*`** when the worktree gate
 * is off. The agent switches back to `develop` (or a `wip/*` branch)
 * and re-commits there.
 */
import { spawnSync } from 'node:child_process';

import { isLefthookBypassed } from '../lib/lefthook-bypass';
import { readAgentWorktreeFlag } from './lib/agent-worktree-flag.lib';

const DEVELOP_BRANCH = 'develop';
const RELEASE_BRANCH_PREFIX = 'release/';
const _AGENT_BRANCH_PREFIX = 'agent/';

export interface ICommitBranchInput {
	readonly cwd: string;
	readonly stagedFiles: readonly string[];
	readonly currentBranch: string | null;
	/** Resolved `delendai.config.json#agentWorktree` (default false). */
	readonly agentWorktreeEnabled?: boolean;
}

export type CommitBranchResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

/** Pure decision engine. No I/O, no side effects. */
export const lintCommitBranch = (
	input: ICommitBranchInput,
): CommitBranchResult => {
	const { currentBranch, agentWorktreeEnabled = false } = input;
	const blockers: string[] = [];

	// Detached HEAD / non-git cwd: fail-open. Release engineers may
	// check out a tag and need to commit; CI branch protection is
	// the real enforcement for those flows.
	if (currentBranch === null || currentBranch === '') {
		return { ok: true };
	}

	// The shared branch. Committing here is the whole point.
	if (currentBranch === DEVELOP_BRANCH) {
		return { ok: true };
	}

	// With the worktree gate on, `agent/*` branches are the expected
	// per-agent isolation shape — allow every branch.
	if (agentWorktreeEnabled === true) {
		return { ok: true };
	}

	// Gate off: develop and operator-created release branches are the only
	// supported commit locations in this shared-checkout repository.
	if (currentBranch.startsWith(RELEASE_BRANCH_PREFIX)) {
		return { ok: true };
	}

	blockers.push(
		`committing on \`${currentBranch}\` — temporary working branches are disabled (agentWorktree: false).`,
		'',
		'next-action:',
		`  switch back:  git switch ${DEVELOP_BRANCH}`,
		'  or use a release/<version> branch for the release PR flow.',
		'  only the operator creates the release branch; agents never branch on their own.',
		'',
		'  if this is a true emergency, bypass:  LEFTHOOK_BYPASS=1 git commit ...',
	);
	return { ok: false, blockers };
};

// ---------- CLI shell ----------

interface ICliArgs {
	readonly cwd: string;
	readonly staged: readonly string[];
	readonly branch: string | null;
	readonly agentWorktree?: boolean;
	readonly listOnly: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	const staged: string[] = [];
	let branch: string | null | undefined;
	let agentWorktree: boolean | undefined;
	let listOnly = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--staged': {
				i += 1;
				while (i < argv.length && !argv[i]?.startsWith('--')) {
					const v = argv[i];
					if (v) staged.push(v);
					i += 1;
				}
				i -= 1;
				break;
			}
			case '--branch': {
				const v = argv[++i];
				branch = v === undefined ? null : v;
				break;
			}
			case '--agent-worktree': {
				const v = argv[++i];
				agentWorktree = v === 'true' || v === '1';
				break;
			}
			case '--list-only':
				listOnly = true;
				break;
			default:
				break;
		}
	}
	return {
		cwd,
		staged,
		branch: branch ?? null,
		...(agentWorktree !== undefined ? { agentWorktree } : {}),
		listOnly,
	};
};

const readCurrentBranch = (cwd: string): string | null => {
	const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
		cwd,
		encoding: 'utf8',
	});
	if (res.status !== 0) return null; // detached HEAD or non-git cwd
	const out = (res.stdout ?? '').trim();
	if (out === 'HEAD' || out === '') return null;
	return out;
};

const readStagedFiles = (cwd: string): string[] => {
	const res = spawnSync(
		'git',
		['diff', '--staged', '--name-only', '--diff-filter=ACMR'],
		{ cwd, encoding: 'utf8' },
	);
	if (res.status !== 0) return [];
	return (res.stdout ?? '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
};

const formatReport = (result: CommitBranchResult): string => {
	if (result.ok) {
		return '✓ commit-branch-discipline: ok\n';
	}
	return [
		'✗ commit-branch-discipline: blocked',
		'',
		...result.blockers,
		'',
	].join('\n');
};

const main = async (): Promise<number> => {
	// x00159 S2: honour the documented escape hatch for real. Every
	// blocker message below tells the operator to set
	// LEFTHOOK_BYPASS=1 — lefthook itself has no such variable, so
	// this script must be the one to check it.
	if (isLefthookBypassed()) {
		process.stdout.write(
			'✓ commit-branch-discipline: bypassed (LEFTHOOK_BYPASS=1)\n',
		);
		return 0;
	}
	const args = parseArgs(process.argv.slice(2));
	const branch = args.branch ?? readCurrentBranch(args.cwd);
	const staged =
		args.staged.length > 0 ? args.staged : readStagedFiles(args.cwd);
	const agentWorktreeEnabled =
		args.agentWorktree ?? readAgentWorktreeFlag(args.cwd);
	if (args.listOnly) {
		process.stdout.write(`${staged.join('\n')}\n`);
		return 0;
	}
	const result = lintCommitBranch({
		cwd: args.cwd,
		stagedFiles: staged,
		currentBranch: branch,
		agentWorktreeEnabled,
	});
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
