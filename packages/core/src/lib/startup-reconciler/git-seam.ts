/**
 * git-seam.ts — the real, read-mostly git implementation of
 * `IStartupGitSeam`.
 *
 * WHY it is built on the shared `IGitRunner` rather than shelling out
 * here: the runner already normalises "git is missing", "git timed out"
 * and "git exited non-zero" into a result instead of an exception, and a
 * boot must not crash because a laptop woke up without a network. Every
 * method below therefore degrades to `undefined` / `false` and lets the
 * calling phase turn that into a typed finding.
 *
 * WHY there is no `deleteRef`, `push`, `reset` or `checkout`: this
 * subsystem must be incapable of the very repairs it is forbidden to
 * improvise. A `git reset --hard` that "fixes" a moved HEAD would destroy
 * uncommitted work; the reconciler reports that condition instead, and
 * cannot act on it even if a future call site asked it to.
 */

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { computePatchDigest, parseObjectListing } from '../wip-engine/index';
import type {
	IGitOutcome,
	IObservedRef,
	IStartupGitSeam,
	IWorkRefSnapshot,
} from './seams.interface';
import { qualifyRef, workRefNamespace } from './work-ref-identity';

const lines = (output: string): readonly string[] =>
	output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

/** Bind the seam to one repository through an existing runner. */
export const createStartupGitSeam = (run: IGitRunner): IStartupGitSeam => {
	const resolveRef = async (name: string): Promise<string | undefined> => {
		const result = await run(['rev-parse', '--verify', '--quiet', name]);
		if (!result.ok) return undefined;
		const sha = result.output.trim();
		return sha.length > 0 ? sha : undefined;
	};

	const isAncestor = async (
		ancestor: string,
		descendant: string,
	): Promise<boolean> => {
		if (ancestor.length === 0 || descendant.length === 0) return false;
		const result = await run([
			'merge-base',
			'--is-ancestor',
			ancestor,
			descendant,
		]);
		return result.ok;
	};

	const fetch = async (request: {
		readonly integrationBranch: string;
		readonly workRefPrefix: string;
	}): Promise<IGitOutcome> => {
		const remotes = await run(['remote']);
		if (!remotes.ok) {
			return { ok: false, reason: remotes.reason ?? 'git remote failed' };
		}
		const remote = lines(remotes.output)[0];
		if (remote === undefined) {
			// A repository with no remote is fully local: there is nothing
			// to fetch, and calling that a failure would make every purely
			// local workspace boot DEGRADED.
			return { ok: true, reason: 'no remote configured' };
		}
		const namespace = workRefNamespace(request.workRefPrefix);
		const refspecs = [
			`+refs/heads/${request.integrationBranch}:refs/remotes/${remote}/${request.integrationBranch}`,
			...(namespace.length > 0 ? [`+${namespace}/*:${namespace}/*`] : []),
		];
		const result = await run(['fetch', '--prune', remote, ...refspecs]);
		return result.ok
			? { ok: true }
			: { ok: false, reason: result.reason ?? 'git fetch failed' };
	};

	const listRefs = async (
		prefix: string,
	): Promise<readonly IObservedRef[]> => {
		const namespace = workRefNamespace(prefix);
		if (namespace.length === 0) return [];
		const result = await run([
			'for-each-ref',
			'--format=%(refname) %(objectname)',
			`${namespace}/`,
		]);
		if (!result.ok) return [];
		const refs: IObservedRef[] = [];
		for (const line of lines(result.output)) {
			const [name, sha] = line.split(' ');
			if (name === undefined || sha === undefined) continue;
			refs.push({ name, sha });
		}
		return refs.sort((left, right) =>
			left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
		);
	};

	const describeRef = async (
		name: string,
		integrationRef: string,
	): Promise<IWorkRefSnapshot | undefined> => {
		const sha = await resolveRef(qualifyRef(name));
		if (sha === undefined) return undefined;
		const mergeBase = await run(['merge-base', sha, integrationRef]);
		const baseSha = mergeBase.ok ? mergeBase.output.trim() : '';
		const diff =
			baseSha.length > 0
				? await run(['diff', '--name-only', baseSha, sha])
				: await run(['ls-tree', '-r', '--name-only', sha]);
		const fileScope = diff.ok ? [...lines(diff.output)].sort() : [];
		const listing =
			fileScope.length > 0
				? await run(['ls-tree', '-r', sha, '--', ...fileScope])
				: { ok: true, output: '' };
		const entries = listing.ok ? parseObjectListing(listing.output) : [];
		return {
			name: qualifyRef(name),
			sha,
			baseSha,
			fileScope,
			patchDigest: computePatchDigest(fileScope, entries),
		};
	};

	const currentBranch = async (): Promise<string | undefined> => {
		const result = await run([
			'symbolic-ref',
			'--quiet',
			'--short',
			'HEAD',
		]);
		if (!result.ok) return undefined;
		const branch = result.output.trim();
		return branch.length > 0 ? branch : undefined;
	};

	return {
		fetch,
		listRefs,
		resolveRef,
		describeRef,
		isAncestor,
		currentBranch,
		headSha: () => resolveRef('HEAD'),
	};
};
