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
	IWorktreeDirtiness,
} from './seams.interface';
import { trimTrailingChar } from '../shared/string-normalize';
import {
	logicalWorkRefName,
	qualifyRef,
	remoteTrackingNamespace,
	workRefNamespace,
} from './work-ref-identity';

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
		readonly publicationRefPrefix?: string | undefined;
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
			// The publication namespace, so that `--prune` reaches it.
			//
			// `--prune` only prunes INSIDE the refspecs it is given, and
			// these were the integration branch and the work refs. A
			// candidate branch deleted on the forge when its pull request
			// merged therefore kept its remote-tracking ref here forever:
			// measured at 29 of them locally, 27 for pull requests that
			// had already landed. The tree looked like it had 29 open
			// candidates and it had two.
			...(request.publicationRefPrefix !== undefined &&
			request.publicationRefPrefix.length > 0
				? [
						`+refs/heads/${trimTrailingChar(request.publicationRefPrefix, '/')}/*:refs/remotes/${remote}/${trimTrailingChar(request.publicationRefPrefix, '/')}/*`,
					]
				: []),
		];
		const result = await run(['fetch', '--prune', remote, ...refspecs]);
		if (!result.ok) {
			return { ok: false, reason: result.reason ?? 'git fetch failed' };
		}
		if (namespace.length === 0) return { ok: true };
		// The work namespace, mirrored into REMOTE-TRACKING refs.
		//
		// It used to be mirrored onto local refs of the same name in the
		// pruned fetch above, and `--prune` deletes every ref in a mirrored
		// namespace the remote does not have — a work branch nobody has
		// published yet is exactly that. Starting the server deleted one
		// carrying five commits (x00551). In remote-tracking refs the prune
		// still removes the copy of a ref the remote dropped (that is how a
		// merged or abandoned ref stops being observed) and can never reach
		// a local branch.
		const mirror = await run([
			'fetch',
			'--prune',
			remote,
			`+${namespace}/*:${remoteTrackingNamespace(remote, namespace)}/*`,
		]);
		return mirror.ok
			? { ok: true }
			: { ok: false, reason: mirror.reason ?? 'git fetch failed' };
	};

	/** Every remote's mirror of one work namespace. */
	const mirrorNamespaces = async (
		namespace: string,
	): Promise<readonly string[]> => {
		const remotes = await run(['remote']);
		return (remotes.ok ? lines(remotes.output) : []).map((remote) =>
			remoteTrackingNamespace(remote, namespace),
		);
	};

	const listRefs = async (
		prefix: string,
	): Promise<readonly IObservedRef[]> => {
		const namespace = workRefNamespace(prefix);
		if (namespace.length === 0) return [];
		// This machine's own work refs AND the mirrors of what other
		// machines published. Both are units of work; only where git keeps
		// them differs, and each is reported once, under its own name.
		const mirrors = await mirrorNamespaces(namespace);
		const result = await run([
			'for-each-ref',
			'--format=%(refname) %(objectname)',
			`${namespace}/`,
			...mirrors.map((mirror) => `${mirror}/`),
		]);
		if (!result.ok) return [];
		const byName = new Map<string, IObservedRef>();
		for (const line of lines(result.output)) {
			const [name, sha] = line.split(' ');
			if (name === undefined || sha === undefined) continue;
			const logical = logicalWorkRefName(name, namespace, mirrors);
			if (logical === undefined) continue;
			// A ref held both locally and on a remote is one unit of work,
			// and the local copy is the one this machine can act on.
			if (name === logical || !byName.has(logical)) {
				byName.set(logical, { name: logical, sha });
			}
		}
		return [...byName.values()].sort((left, right) =>
			left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
		);
	};

	/**
	 * A work ref by its logical name, wherever git holds it: this
	 * machine's own branch, or a mirror of another machine's.
	 */
	const resolveWorkRef = async (
		name: string,
	): Promise<string | undefined> => {
		const qualified = qualifyRef(name);
		const direct = await resolveRef(qualified);
		if (direct !== undefined) return direct;
		const namespace = qualified.slice(0, qualified.lastIndexOf('/'));
		for (const mirror of await mirrorNamespaces(namespace)) {
			const sha = await resolveRef(
				`${mirror}/${qualified.slice(namespace.length + 1)}`,
			);
			if (sha !== undefined) return sha;
		}
		return undefined;
	};

	const describeRef = async (
		name: string,
		integrationRef: string,
	): Promise<IWorkRefSnapshot | undefined> => {
		const sha = await resolveWorkRef(name);
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

	/**
	 * `--porcelain=v1 -z`: a path may contain a space, a quote or a
	 * newline, and reconstructing git's quoting by hand is a bug class
	 * this repository has already paid for once.
	 */
	/**
	 * Three answers, not two.
	 *
	 * This used to return `[]` when `git status` failed, and a caller
	 * reading an empty list cannot tell "the tree is clean" from "nobody
	 * could look". `verify-checkout` then treated the silence as a clean
	 * tree and went on to fast-forward the shared checkout — asserting a
	 * precondition it never verified. Git has its own protections, so no
	 * loss was measured; the reasoning was wrong anyway, and that is the
	 * same reasoning that cost five commits in x00551.
	 */
	const dirtyState = async (): Promise<IWorktreeDirtiness> => {
		const result = await run(['status', '--porcelain=v1', '-z']);
		if (!result.ok) {
			return {
				kind: 'unknown',
				reason:
					result.reason ??
					'git status did not answer; the tree was not inspected',
			};
		}
		const fields = result.output.split('\0').filter((f) => f.length > 0);
		const paths: string[] = [];
		for (let i = 0; i < fields.length; i += 1) {
			const field = fields[i] ?? '';
			if (field.length < 4) continue;
			const status = field.slice(0, 2);
			paths.push(field.slice(3));
			// A rename carries its source as the NEXT field; skip it so
			// the old name is not reported as a change of its own.
			if (status.includes('R') || status.includes('C')) i += 1;
		}
		return paths.length === 0
			? { kind: 'clean' }
			: { kind: 'dirty', paths };
	};

	/** The paths, for callers that already handled `unknown`. */
	const dirtyPaths = async (): Promise<readonly string[]> => {
		const state = await dirtyState();
		return state.kind === 'dirty' ? state.paths : [];
	};

	/**
	 * `merge --ff-only`, and nothing that could stand in for it.
	 *
	 * Not `reset --hard` (discards the tree), not `switch` (moves HEAD),
	 * not `pull` (which is a fetch plus a merge that may create a commit).
	 * If the current head is not an ancestor of `target`, git refuses and
	 * the refusal is returned as-is: a caller that got here with a
	 * diverged branch must hear about it, not have it resolved.
	 */
	const fastForward = async (target: string): Promise<IGitOutcome> => {
		const result = await run(['merge', '--ff-only', target]);
		return result.ok
			? { ok: true }
			: {
					ok: false,
					reason:
						result.reason ?? `git merge --ff-only ${target} failed`,
				};
	};

	return {
		fetch,
		listRefs,
		resolveRef,
		describeRef,
		isAncestor,
		currentBranch,
		dirtyPaths,
		dirtyState,
		headSha: () => resolveRef('HEAD'),
		fastForward,
	};
};
