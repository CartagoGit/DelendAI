/**
 * stranded-edits.service.ts — what an agent left uncommitted in the shared
 * checkout is kept under a ref named for it, and nothing else is touched.
 *
 * An agent stopped mid-task (its quota ran out, its host closed) leaves
 * its edits wherever it was typing. In the shared checkout nothing commits
 * them: the next fast-forward refuses to carry them, `work rescue` keeps
 * and discards them only when somebody asks, and the agent that resumes
 * has no way to know they exist. Each start now keeps such edits as one
 * commit on the integration tip, under `refs/<namespace>/stranded/<agent>/`,
 * without touching the checkout, its index or its branch: the agent whose
 * live unit covers the paths is named, and `work status` says how to
 * bring them into a unit.
 */
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { UNATTRIBUTED_AGENT } from '../contracts/constants/stranded-edits.constant';
import type { IStrandedEdits } from '../contracts/interfaces/stranded-edits.interface';
import { namespacedRef } from './namespaced-ref.helper';
import { readSwarm } from './work-swarm.service';
import { readGit } from './work-unit-shared.service';

/** How much of the tree names the ref, so one state is kept once. */
const SHORT_TREE_LENGTH = 12;

const changedPaths = (root: string): readonly string[] =>
	(readGit(root, ['status', '--porcelain', '--untracked-files=all']) ?? '')
		.split('\n')
		.filter((line) => line.trim().length > 0)
		// `XY path`; the reader trims the output, so the first line may
		// have lost the blank of its status. The path follows the first
		// run of blanks after the status either way.
		.map((line) => {
			const entry = line.trimStart();
			const path = entry.slice(entry.indexOf(' ') + 1).trim();
			// A rename lists `old -> new`; the new name is what is there.
			const arrow = path.indexOf(' -> ');
			return arrow === -1 ? path : path.slice(arrow + ' -> '.length);
		});

/** The one agent whose live units cover every path, if there is one. */
const ownerOf = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	paths: readonly string[],
): string => {
	const owners = new Set<string>();
	for (const unit of readSwarm({ root, policy }).units) {
		if (paths.some((path) => unit.paths.includes(path))) {
			owners.add(unit.agent);
		}
	}
	const [only] = [...owners];
	return owners.size === 1 && only !== undefined ? only : UNATTRIBUTED_AGENT;
};

/**
 * Keep the shared checkout's uncommitted edits under a ref, when this is
 * the shared checkout on the integration branch of a work-ref project.
 * A temporary index holds the snapshot; the checkout's own is untouched.
 */
export const keepStrandedEdits = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): Promise<IStrandedEdits> => {
	const { root, policy } = input;
	if (policy.branches.workRefTemplate.length === 0) {
		return { outcome: 'not-shared-checkout' };
	}
	const branch = readGit(root, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'HEAD',
	]);
	if (branch !== policy.branches.integration) {
		return { outcome: 'not-shared-checkout' };
	}
	const paths = changedPaths(root);
	if (paths.length === 0) return { outcome: 'clean' };
	const gitDir = readGit(root, ['rev-parse', '--absolute-git-dir']);
	const tip = readGit(root, ['rev-parse', '-q', '--verify', 'HEAD']);
	if (gitDir === undefined || tip === undefined) {
		return {
			outcome: 'failed',
			reason: 'the checkout has no commit to keep the edits on',
		};
	}
	const index = join(
		gitDir,
		`delendai-stranded-index-${String(process.pid)}`,
	);
	const git = (args: readonly string[]): string =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, GIT_INDEX_FILE: index },
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	try {
		git(['read-tree', tip]);
		git(['add', '-A']);
		const tree = git(['write-tree']);
		if (tree === git(['rev-parse', `${tip}^{tree}`])) {
			return { outcome: 'clean' };
		}
		const agent = ownerOf(root, policy, paths);
		const ref = namespacedRef(
			policy.branches.namespacePrefix,
			'stranded',
			agent,
			tree.slice(0, SHORT_TREE_LENGTH),
		);
		if (readGit(root, ['rev-parse', '-q', '--verify', ref]) !== undefined) {
			return { outcome: 'already-kept', ref, agent, paths };
		}
		// A record the machine makes: a clone with no identity of its own
		// still keeps the edits, under delendai's name.
		const named =
			(readGit(root, ['config', 'user.email']) ?? '').length > 0
				? []
				: [
						'-c',
						'user.name=delendai',
						'-c',
						'user.email=delendai@localhost',
					];
		const commit = git([
			...named,
			'commit-tree',
			tree,
			'-p',
			tip,
			'-m',
			`stranded in the shared checkout: ${String(paths.length)} path(s) left uncommitted on ${policy.branches.integration}`,
		]);
		git(['update-ref', ref, commit, '']);
		return { outcome: 'kept', ref, agent, paths };
	} catch (error) {
		return {
			outcome: 'failed',
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		await rm(index, { force: true });
	}
};

/** How the owner brings kept edits into a unit of their own. */
export const resumeStrandedEdits = (ref: string): string =>
	`enter a unit (delendai work enter …), then in its worktree: git checkout ${ref} -- <path>   (see them with: git diff HEAD ${ref})`;

/** Keep them at start-up, and say where and how to resume, when kept. */
export const keepStrandedEditsAtStart = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	write: (line: string) => void,
): Promise<IStrandedEdits> => {
	const stranded = await keepStrandedEdits({ root, policy });
	if (stranded.outcome === 'kept') {
		write(
			`[delendai] ${String(stranded.paths.length)} path(s) left uncommitted in the shared checkout are kept at ${stranded.ref} (for ${stranded.agent}). To resume: ${resumeStrandedEdits(stranded.ref)}\n`,
		);
	} else if (stranded.outcome === 'failed') {
		write(
			`[delendai] could not keep the shared checkout's uncommitted edits: ${stranded.reason}\n`,
		);
	}
	return stranded;
};

/** Every ref stranded edits are kept under, with who they are for. */
export const listStrandedEdits = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): readonly { readonly ref: string; readonly agent: string }[] => {
	const prefix = namespacedRef(
		input.policy.branches.namespacePrefix,
		'stranded',
	);
	return (
		readGit(input.root, [
			'for-each-ref',
			'--format=%(refname)',
			`${prefix}/`,
		]) ?? ''
	)
		.split('\n')
		.filter((ref) => ref.length > 0)
		.map((ref) => ({
			ref,
			agent: ref.slice(prefix.length + 1).split('/')[0] ?? '',
		}));
};
