/**
 * retired-machinery-reap.service.ts — what the old queue left in a clone
 * goes, once it holds nothing of its own.
 *
 * The queue built trains on local branches (`<ns>/train/…`) and scratch
 * worktrees (`delendai-train-*`, `candidate-refresh-*` in the temporary
 * directory). A run that died before its cleanup left them registered in
 * the shared clone, and nothing that runs now creates or removes them.
 * Each is removed only when every commit it reaches is also reached by the
 * integration branch or a work or publication ref, here or as fetched; one
 * that may hold the only copy of a commit is kept and reported.
 */
import { basename } from 'node:path';

import type { IReapedMachinery } from '../contracts/interfaces/retired-machinery-reap.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	retiredMachineryPrefixes,
	shortName,
} from '../integration/decisions/namespaces.helper';
import { integrationBase, readGit } from './work-unit-shared.service';

/** The scratch worktrees the retired queue created, by directory name. */
const RETIRED_SCRATCH = ['delendai-train-', 'candidate-refresh-'] as const;

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

interface IWorktreeEntry {
	readonly path: string;
	readonly head?: string;
	readonly branch?: string;
}

const worktreesOf = (root: string): readonly IWorktreeEntry[] =>
	(readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.map((block) => {
			const field = (key: string): string | undefined =>
				block
					.split('\n')
					.find((line) => line.startsWith(`${key} `))
					?.slice(key.length + 1);
			const head = field('HEAD');
			const branch = field('branch');
			return {
				path: field('worktree') ?? '',
				...(head === undefined ? {} : { head }),
				...(branch === undefined ? {} : { branch }),
			};
		})
		.filter((entry) => entry.path !== '');

/** Every ref whose commits count as kept: work and publication refs, local and fetched. */
const holderRefs = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
): readonly string[] => {
	const prefixes = [
		...ownedWorkRefPrefixes(policy.branches),
		...ownedPublicationRefPrefixes(policy.branches),
	]
		.map(shortName)
		.filter((prefix) => prefix !== '');
	return lines(
		readGit(root, [
			'for-each-ref',
			'--format=%(refname)',
			'refs/heads',
			'refs/remotes',
		]),
	).filter((ref) => {
		const name = ref.replace(/^refs\/(heads|remotes\/[^/]+)\//u, '');
		return prefixes.some((prefix) => name.startsWith(prefix));
	});
};

export const reapRetiredMachinery = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly apply: boolean;
}): readonly IReapedMachinery[] => {
	const { root, policy, apply } = input;
	const base = integrationBase(root, policy);
	if (base === undefined) return [];
	const retired = retiredMachineryPrefixes(policy.branches).filter(
		(prefix) => prefix !== '',
	);
	let holders: readonly string[] | undefined;
	const holdsNothing = (sha: string): boolean => {
		holders ??= holderRefs(root, policy);
		return (
			readGit(root, [
				'rev-list',
				'--count',
				sha,
				'--not',
				base,
				...holders,
			]) === '0'
		);
	};
	const isRetiredBranch = (ref: string | undefined): boolean =>
		ref !== undefined &&
		retired.some((prefix) => shortName(ref).startsWith(prefix));
	const out: IReapedMachinery[] = [];
	const kept = (what: string): IReapedMachinery => ({
		what,
		outcome: 'kept',
		why: 'it may hold the only copy of a commit',
	});
	for (const tree of worktreesOf(root)) {
		const scratch = RETIRED_SCRATCH.some((name) =>
			basename(tree.path).startsWith(name),
		);
		if (!scratch && !isRetiredBranch(tree.branch)) continue;
		if (tree.head === undefined || !holdsNothing(tree.head)) {
			out.push(kept(tree.path));
			continue;
		}
		if (!apply) {
			out.push({ what: tree.path, outcome: 'would-remove' });
			continue;
		}
		const removed =
			readGit(root, ['worktree', 'remove', '--force', tree.path]) !==
			undefined;
		out.push(
			removed ? { what: tree.path, outcome: 'removed' } : kept(tree.path),
		);
	}
	if (apply) readGit(root, ['worktree', 'prune']);
	const branches = lines(
		readGit(root, [
			'for-each-ref',
			'--format=%(refname) %(objectname)',
			...retired.map((prefix) => `refs/heads/${prefix}`),
		]),
	);
	for (const line of branches) {
		const [ref = '', sha = ''] = line.split(' ');
		if (!holdsNothing(sha)) {
			out.push(kept(ref));
			continue;
		}
		if (!apply) {
			out.push({ what: ref, outcome: 'would-remove' });
			continue;
		}
		const gone =
			readGit(root, ['update-ref', '-d', ref, sha]) !== undefined;
		out.push(gone ? { what: ref, outcome: 'removed' } : kept(ref));
	}
	return out;
};
