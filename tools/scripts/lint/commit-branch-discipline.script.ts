#!/usr/bin/env bun
/**
 * commit-branch-discipline.script.ts — f00086 S1 (policy flipped
 * 2026-08-24: single shared `develop` branch).
 *
 * Pre-commit guard. Pure function over
 * `(cwd, stagedFiles, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (single shared branch):
 *   - This repo works on ONE branch: `develop`. Agents share commits
 *     and pushes instead of creating per-agent branches.
 *   - `currentBranch === 'develop'` → always allowed.
 *   - Detached HEAD (`currentBranch === null` / empty) → fail-open so
 *     release engineers can check out a tag and commit a fix.
 *   - Any other branch (`agent/*`, `feature/*`, …) → blocked with a
 *     next-action telling the agent to switch back to develop. No new
 *     branches; joint work, not parallel isolates.
 *
 * Default behaviour: **block on a stray branch.** The agent switches
 * back to `develop` and re-commits there.
 */
import { spawnSync } from 'node:child_process';

import { isLefthookBypassed } from '../lib/lefthook-bypass';

const DEVELOP_BRANCH = 'develop';

export interface ICommitBranchInput {
	readonly cwd: string;
	readonly stagedFiles: readonly string[];
	readonly currentBranch: string | null;
}

export type CommitBranchResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

/** Pure decision engine. No I/O, no side effects. */
export const lintCommitBranch = (
	input: ICommitBranchInput,
): CommitBranchResult => {
	const { currentBranch } = input;
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

	// Anything else is a stray per-agent / feature branch. This repo
	// works on `develop` only; agents share one branch.
	blockers.push(
		`committing on \`${currentBranch}\` — this repo works on \`develop\` only.`,
		'',
		'next-action:',
		`  switch back:  git switch ${DEVELOP_BRANCH}`,
		'  then commit and push on develop. agents share one branch;',
		'  do not create agent/* or feature/* branches.',
		'',
		'  if this is a true emergency (CI follow-up, release hotfix),',
		'  bypass the hook with:  LEFTHOOK_BYPASS=1 git commit ...',
	);
	return { ok: false, blockers };
};

// ---------- CLI shell ----------

interface ICliArgs {
	readonly cwd: string;
	readonly staged: readonly string[];
	readonly branch: string | null;
	readonly listOnly: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	const staged: string[] = [];
	let branch: string | null | undefined;
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
			case '--list-only':
				listOnly = true;
				break;
			default:
				break;
		}
	}
	return { cwd, staged, branch: branch ?? null, listOnly };
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
	if (args.listOnly) {
		process.stdout.write(`${staged.join('\n')}\n`);
		return 0;
	}
	const result = lintCommitBranch({
		cwd: args.cwd,
		stagedFiles: staged,
		currentBranch: branch,
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
