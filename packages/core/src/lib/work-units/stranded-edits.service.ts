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
/**
 * Who the edits are kept for, and what says so. Git cannot tell who wrote
 * an uncommitted file, so an agent is named only when its units cover
 * every path; a unit covering one of them is evidence, not authorship:
 * 24 paths an agent wrote with no unit were kept under the name of another
 * whose unit held one hunk of them.
 */
const ownerOf = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	paths: readonly string[],
): { readonly agent: string; readonly evidence: readonly string[] } => {
	const covering = readSwarm({ root, policy }).units.filter((unit) =>
		paths.some((path) => unit.paths.includes(path)),
	);
	const evidence = covering.map(
		(unit) =>
			`${unit.ref} changes ${paths.filter((path) => unit.paths.includes(path)).join(', ')}`,
	);
	const owners = new Set(covering.map((unit) => unit.agent));
	const [only] = [...owners];
	const coversAll = paths.every((path) =>
		covering.some((unit) => unit.paths.includes(path)),
	);
	return {
		agent:
			owners.size === 1 && only !== undefined && coversAll
				? only
				: UNATTRIBUTED_AGENT,
		evidence,
	};
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
		const { agent, evidence } = ownerOf(root, policy, paths);
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
			[
				`stranded in the shared checkout: ${String(paths.length)} path(s) left uncommitted on ${policy.branches.integration}`,
				...(evidence.length === 0
					? []
					: ['', 'Units that change some of them:', ...evidence]),
			].join('\n'),
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
	const landed = dropLandedStrandedEdits({
		root,
		policy,
		integration: policy.branches.integration,
	});
	if (landed.length > 0) {
		write(
			`[delendai] dropped ${String(landed.length)} stranded ref(s) that keep nothing found nowhere else: ${landed.join(', ')}\n`,
		);
	}
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
}): readonly {
	readonly ref: string;
	readonly agent: string;
	/** When the edits were kept: how long they have waited for their owner. */
	readonly keptAt: string;
}[] => {
	const prefix = namespacedRef(
		input.policy.branches.namespacePrefix,
		'stranded',
	);
	return (
		readGit(input.root, [
			'for-each-ref',
			'--sort=committerdate',
			'--format=%(refname) %(committerdate:iso-strict)',
			`${prefix}/`,
		]) ?? ''
	)
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [ref = '', keptAt = ''] = line.split(' ');
			return {
				ref,
				agent: ref.slice(prefix.length + 1).split('/')[0] ?? '',
				keptAt,
			};
		});
};

/**
 * The blob of each of `paths` on each of `refs`, read by one process however
 * many pairs there are, or `undefined` when git could not answer.
 */
const blobsOf = (
	root: string,
	refs: readonly string[],
	paths: readonly string[],
): ReadonlyMap<string, string> | undefined => {
	const unique = [...new Set(paths)];
	const names = [...new Set(refs)].flatMap((ref) =>
		unique.map((path) => `${ref}:${path}`),
	);
	if (names.length === 0) return new Map();
	try {
		const answers = execFileSync(
			'git',
			['cat-file', '--batch-check=%(objectname)'],
			{
				cwd: root,
				encoding: 'utf8',
				input: `${names.join('\n')}\n`,
				maxBuffer: Number.POSITIVE_INFINITY,
				stdio: ['pipe', 'pipe', 'ignore'],
			},
		).split('\n');
		return new Map(
			names.flatMap((name, index) => {
				const sha = answers[index] ?? '';
				return /^[0-9a-f]+$/u.test(sha) ? [[name, sha] as const] : [];
			}),
		);
	} catch {
		return undefined;
	}
};

/**
 * Every version, as `path\0blob`, that the integration branch's history
 * ever held of `paths`: one walk, paid only when a stranded ref exists.
 */
const integratedVersions = (
	root: string,
	integration: string,
	paths: readonly string[],
): ReadonlySet<string> => {
	if (paths.length === 0) return new Set();
	const raw =
		readGit(root, [
			'log',
			'--raw',
			'--no-abbrev',
			'--no-renames',
			'--format=',
			integration,
			'--',
			...new Set(paths),
		]) ?? '';
	const versions = new Set<string>();
	for (const line of raw.split('\n')) {
		const [meta, path] = line.split('\t');
		const after = meta?.split(' ')[3];
		if (path !== undefined && after !== undefined) {
			versions.add(`${path}\0${after}`);
		}
	}
	return versions;
};

/**
 * Drop the stranded refs that keep nothing found nowhere else: every file
 * such a ref saved is, byte for byte, on the integration branch, on a
 * work or publication branch, or in a larger stranded ref kept, or is a
 * version the integration branch's history once held. One that holds a
 * single file found nowhere else is kept. On 2026-10-29 one checkout held
 * 15 stranded refs: five kept nothing (repeated snapshots of one tree, and
 * edits a unit had since published) and ten held edits no branch had.
 */
export const dropLandedStrandedEdits = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly integration: string;
}): readonly string[] => {
	const branches = (
		readGit(input.root, [
			'for-each-ref',
			'--format=%(refname)',
			`refs/remotes/origin/${input.policy.branches.namespacePrefix}`,
		]) ?? ''
	)
		.split('\n')
		.filter((ref) => ref.length > 0);
	const stranded = (
		readGit(input.root, [
			'for-each-ref',
			'--format=%(refname)',
			`${namespacedRef(input.policy.branches.namespacePrefix, 'stranded')}/`,
		]) ?? ''
	)
		.split('\n')
		.filter((ref) => ref.length > 0);
	const pathsOf = (ref: string): readonly string[] =>
		(readGit(input.root, ['diff', '--name-only', `${ref}^`, ref]) ?? '')
			.split('\n')
			.filter((path) => path.length > 0);
	// The largest snapshots first: a ref is covered by one already kept, so
	// two identical snapshots never drop each other, and the earlier, smaller
	// one of a pair goes.
	const ordered = stranded
		.map((ref) => ({ ref, paths: pathsOf(ref) }))
		.filter((entry) => entry.paths.length > 0)
		.sort((a, b) => b.paths.length - a.paths.length);
	const blobs = blobsOf(
		input.root,
		[input.integration, ...branches, ...stranded],
		ordered.flatMap((entry) => entry.paths),
	);
	// Nothing is known about what these refs keep, so none of them goes.
	if (blobs === undefined) return [];
	const blob = (ref: string, path: string): string | undefined =>
		blobs.get(`${ref}:${path}`);
	const integrated = integratedVersions(
		input.root,
		input.integration,
		ordered.flatMap((entry) => entry.paths),
	);
	const kept: string[] = [];
	const dropped: string[] = [];
	for (const { ref, paths } of ordered) {
		const elsewhere = [input.integration, ...branches, ...kept];
		const keepsSomething = paths.some((path) => {
			const saved = blob(ref, path);
			// A file the ref deleted keeps nothing to restore.
			if (saved === undefined) return false;
			// A version the integration branch once held reached it: the
			// snapshot was a stale copy of work that landed and moved on.
			if (integrated.has(`${path}\0${saved}`)) return false;
			return !elsewhere.some((other) => blob(other, path) === saved);
		});
		if (keepsSomething) {
			kept.push(ref);
			continue;
		}
		const tip = readGit(input.root, ['rev-parse', ref])?.trim();
		try {
			execFileSync('git', ['update-ref', '-d', ref], {
				cwd: input.root,
				stdio: 'ignore',
			});
			// Named with its commit, so the journal line can restore it.
			dropped.push(tip === undefined ? ref : `${ref}@${tip}`);
		} catch {
			// Kept: it is dropped on a later start.
		}
	}
	return dropped;
};
