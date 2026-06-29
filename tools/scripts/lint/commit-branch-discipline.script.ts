#!/usr/bin/env bun
/**
 * commit-branch-discipline.script.ts — f00086 S1.
 *
 * Pre-commit guard. Pure function over
 * `(cwd, stagedFiles, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.
 *
 * Policy (f00086):
 *   - When `currentBranch === 'develop'`, any staged file under one
 *     of the "deep" paths (proposals, packages sources, plugin
 *     sources, tools/scripts/) is a violation: the agent forgot
 *     to open a feature branch.
 *   - Small residual fixes (≤3 staged files, no deep paths) are
 *     allowed.
 *   - Any other branch (agent/x, feature/x, etc.) is always
 *     allowed — the discipline is "don't commit to develop
 *     directly", not "don't commit".
 *   - Detached HEAD (`currentBranch === null` / empty) is
 *     fail-open so release engineers can check out a tag and
 *     commit a fix.
 *
 * Default behaviour: **block when in doubt.** False positives are
 * cheap (the agent re-runs the commit on a branch in 30s); false
 * negatives leave the tree dirty again and the rule has no teeth.
 */
import { spawnSync } from 'node:child_process';

const DEVELOP_BRANCH = 'develop';

/** Paths that, when staged on `develop`, are a policy violation. */
export const DEEP_PATH_PATTERNS: readonly RegExp[] = [
	/^docs\/mcp-vertex\/proposals\//,
	/^packages\/[^/]+\/src\//,
	/^plugins\/[^/]+\/src\//,
	/^tools\/scripts\//,
];

/** Maximum staged files allowed for a "small residual fix" on `develop`. */
export const MAX_RESIDUAL_FILES = 3;

export interface ICommitBranchInput {
	readonly cwd: string;
	readonly stagedFiles: readonly string[];
	readonly currentBranch: string | null;
}

export type CommitBranchResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

/** Pure classifier. Returns the deep-path files that are violations. */
export const findDeepPathViolations = (
	stagedFiles: readonly string[],
): readonly string[] =>
	stagedFiles.filter((f) => DEEP_PATH_PATTERNS.some((re) => re.test(f)));

/** Pure decision engine. No I/O, no side effects. */
export const lintCommitBranch = (
	input: ICommitBranchInput,
): CommitBranchResult => {
	const { stagedFiles, currentBranch } = input;
	const blockers: string[] = [];

	// Detached HEAD / non-git cwd: fail-open. Release engineers may
	// check out a tag and need to commit; CI branch protection is
	// the real enforcement for those flows.
	if (currentBranch === null || currentBranch === '') {
		return { ok: true };
	}

	// Any non-develop branch is allowed. The discipline is "don't
	// commit to develop directly", not "don't commit at all".
	if (currentBranch !== DEVELOP_BRANCH) {
		return { ok: true };
	}

	// On develop: deep paths are an immediate block.
	const deep = findDeepPathViolations(stagedFiles);
	if (deep.length > 0) {
		blockers.push(
			`on \`develop\`, these staged files need a feature branch: ${deep.join(', ')}`,
			'',
			'next-action:',
			'  create a branch:  git switch -c agent/<your-name>-<id>-<id-proposals>-<id-agent>',
			'  then commit there. push to develop only via PR.',
			'',
			'  if this is a true emergency (CI follow-up, release hotfix),',
			'  bypass the hook with:  LEFTHOOK_BYPASS=1 git commit ...',
		);
		return { ok: false, blockers };
	}

	// On develop with no deep paths: small residual fixes allowed.
	if (stagedFiles.length > MAX_RESIDUAL_FILES) {
		blockers.push(
			`on \`develop\`, more than ${MAX_RESIDUAL_FILES} files are staged (${stagedFiles.length}). even when none of them are in a deep path, this is too much for a direct develop commit.`,
			'',
			'next-action:',
			'  create a branch:  git switch -c agent/<your-name>-<id>-<id-proposals>-<id-agent>',
			'  push there and open a PR.',
		);
		return { ok: false, blockers };
	}

	return { ok: true };
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
