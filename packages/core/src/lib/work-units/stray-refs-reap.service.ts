/**
 * stray-refs-reap.service.ts — a ref that is nobody's and carries no
 * work is removed from the clone.
 *
 * `no-stray-refs` names refs outside every namespace a clone is expected
 * to hold. On 2026-10-13 it named twenty-six: local copies of review
 * claims, fetched by hand under a namespace the product never writes.
 * A claim records who holds what and changes no file: a commit with no
 * parent whose tree is a snapshot of the integration branch. A copy of
 * one keeps nothing. Removing a ref is safe exactly
 * when every commit it holds beyond the integration branch is empty;
 * anything else may be somebody's work and is left, reported, for a
 * person.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IReapedStrayRef } from './stray-refs-reap.interface';
import { strayRefs } from './stray-refs.service';
import { integrationBase, readGit } from './work-unit-shared.service';

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

/** How far back the integration branch's trees are read for a snapshot. */
const SNAPSHOT_HISTORY = 5000;

/** The trees the integration branch has had, newest first. */
const integrationTrees = (root: string, base: string): ReadonlySet<string> =>
	new Set(
		lines(
			readGit(root, [
				'log',
				'--first-parent',
				`--max-count=${String(SNAPSHOT_HISTORY)}`,
				'--format=%T',
				base,
			]),
		),
	);

/**
 * Whether every commit `ref` holds beyond `base` changes no file: a
 * commit whose tree is its parent's, or — for a commit with no parent,
 * which is what a claim is — a tree the integration branch itself had.
 */
export const holdsOnlyEmptyCommits = (
	root: string,
	ref: string,
	base: string,
	trees: () => ReadonlySet<string> = () => integrationTrees(root, base),
): boolean => {
	const beyond = readGit(root, ['rev-list', '--parents', `${base}..${ref}`]);
	if (beyond === undefined) return false;
	const commits = lines(beyond);
	if (commits.length === 0) return true;
	return commits.every((line) => {
		const [commit = '', ...parents] = line.split(' ');
		if (parents.length === 0) {
			return trees().has(
				readGit(root, ['rev-parse', `${commit}^{tree}`]) ?? '',
			);
		}
		// A merge joins histories; whether it carries work is not this
		// rule's to judge, so the ref is left for a person.
		if (parents.length !== 1) return false;
		return (
			readGit(root, ['rev-parse', `${commit}^{tree}`]) ===
			readGit(root, ['rev-parse', `${parents[0] ?? ''}^{tree}`])
		);
	});
};

export const reapStrayRefs = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly apply: boolean;
}): readonly IReapedStrayRef[] => {
	const { root, policy, apply } = input;
	const base = integrationBase(root, policy);
	if (base === undefined) return [];
	const stray = strayRefs({
		refs: lines(readGit(root, ['for-each-ref', '--format=%(refname)'])),
		remotes: lines(readGit(root, ['remote'])),
		namespace: policy.branches.namespacePrefix,
	});
	let cached: ReadonlySet<string> | undefined;
	const trees = (): ReadonlySet<string> => {
		cached ??= integrationTrees(root, base);
		return cached;
	};
	return stray.map((ref): IReapedStrayRef => {
		if (!holdsOnlyEmptyCommits(root, ref, base, trees)) {
			return { ref, outcome: 'kept' };
		}
		if (!apply) return { ref, outcome: 'would-remove' };
		return {
			ref,
			outcome:
				readGit(root, ['update-ref', '-d', ref]) === undefined
					? 'kept'
					: 'removed',
		};
	});
};
