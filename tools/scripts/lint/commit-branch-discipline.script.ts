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
 *   - `develop` → NOT this hook's question any more. It answered "always
 *     allowed" because it was written for the model where committing on
 *     the integration branch locally was normal and only the PUSH was
 *     restricted. Under a policy whose
 *     `persistence.allowsDirectIntegrationCommit` is false the commit
 *     itself is forbidden, and an answer hard-coded here would be a
 *     second source of truth contradicting the policy — which is
 *     exactly how commits kept landing on `develop` while every
 *     policy-derived guard correctly refused them.
 *     `tools/scripts/hooks/refuse-integration-commit.script.ts` owns it,
 *     reading the project's own `development` block. This hook stays
 *     permissive about `develop` so the two never disagree; it is not
 *     the one deciding.
 *   - Detached HEAD (`null` / empty) → fail-open (release hotfix).
 *   - When `agentWorktree: true` → every branch is allowed: `agent/*`
 *     branches are the expected per-agent isolation shape.
 *   - When `agentWorktree: false` (this repo) → only `release/*` is an
 *     additional commit branch; arbitrary working branches are blocked.
 *
 * Default behaviour: **block only `agent/*`** when the worktree gate
 * is off. The agent commits on a work branch in its own worktree instead
 * and re-commits there.
 */
import { spawnSync } from 'node:child_process';

import { declaredBranches } from '../lib/declared-branches';
import { isLefthookBypassed } from '../lib/lefthook-bypass';
import { readAgentWorktreeFlag } from './lib/agent-worktree-flag.lib';

/** Used only when no development policy can be read. */
const DEFAULT_INTEGRATION_BRANCH = 'develop';
const RELEASE_BRANCH_PREFIX = 'release/';
const _AGENT_BRANCH_PREFIX = 'agent/';

export interface ICommitBranchInput {
	readonly cwd: string;
	readonly stagedFiles: readonly string[];
	readonly currentBranch: string | null;
	/** Resolved `delendai.config.json#agentWorktree` (default false). */
	readonly agentWorktreeEnabled?: boolean;
	/** Policy integration branch (`branches.integration`); defaults to develop. */
	readonly integrationBranch?: string;
	/** Policy work namespace (`branches.workRefPrefix`), e.g. `heads/delendai/wip/`. */
	readonly workRefPrefix?: string;
	/** Policy publication namespace (`branches.publicationRefPrefix`). */
	readonly publicationRefPrefix?: string;
}

/** Strip `refs/` and `heads/` so a qualified prefix matches a branch name. */
const shortRef = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

const inNamespace = (branch: string, prefix: string | undefined): boolean =>
	prefix !== undefined &&
	prefix !== '' &&
	branch.startsWith(shortRef(prefix));

export type CommitBranchResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly string[] };

/** Pure decision engine. No I/O, no side effects. */
export const lintCommitBranch = (
	input: ICommitBranchInput,
): CommitBranchResult => {
	const {
		currentBranch,
		agentWorktreeEnabled = false,
		integrationBranch = DEFAULT_INTEGRATION_BRANCH,
		workRefPrefix,
		publicationRefPrefix,
	} = input;
	const blockers: string[] = [];

	// Detached HEAD / non-git cwd: fail-open. Release engineers may
	// check out a tag and need to commit; CI branch protection is
	// the real enforcement for those flows.
	if (currentBranch === null || currentBranch === '') {
		return { ok: true };
	}

	// The shared branch. Committing here is the whole point.
	// The configured integration branch, not a hardcoded name: a project
	// that integrates into `trunk` must not have `develop` treated as its
	// shared branch.
	if (currentBranch === integrationBranch) {
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

	// The policy's own namespaces. Under shared-checkout-pr an agent
	// develops on a visible work branch in its own worktree and opens its
	// pull request from a publication branch; refusing both left the model
	// unusable, and the old remedy (`git switch develop`) sent agents back
	// to committing on the integration branch.
	if (
		inNamespace(currentBranch, workRefPrefix) ||
		inNamespace(currentBranch, publicationRefPrefix)
	) {
		return { ok: true };
	}

	const workShape =
		workRefPrefix === undefined || workRefPrefix === ''
			? 'the policy work namespace'
			: `${shortRef(workRefPrefix)}<model>/<proposal>-<slice>-g<n>-<topic>`;
	const publicationShape =
		publicationRefPrefix === undefined || publicationRefPrefix === ''
			? 'the policy publication namespace'
			: `${shortRef(publicationRefPrefix)}<name>`;

	blockers.push(
		`committing on \`${currentBranch}\` — outside every branch namespace the development policy declares.`,
		'',
		'next-action:',
		`  commit on a work branch, in its own worktree: ${workShape}`,
		`  open the pull request from ${publicationShape}; never switch the shared checkout.`,
		'  release/<version> branches are created by the operator only.',
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
	// A fixture or foreign directory may have no delendai.config.json; the
	// namespaces are then simply unknown and only develop/release pass.
	let namespaces: {
		integrationBranch?: string;
		workRefPrefix?: string;
		publicationRefPrefix?: string;
	} = {};
	try {
		const branches = declaredBranches(args.cwd);
		namespaces = {
			integrationBranch: branches.integration,
			workRefPrefix: branches.workRefPrefix,
			publicationRefPrefix: branches.publicationRefPrefix,
		};
	} catch {
		namespaces = {};
	}
	const result = lintCommitBranch({
		cwd: args.cwd,
		stagedFiles: staged,
		currentBranch: branch,
		agentWorktreeEnabled,
		...namespaces,
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
