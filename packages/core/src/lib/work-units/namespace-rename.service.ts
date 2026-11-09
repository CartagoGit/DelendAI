/**
 * namespace-rename.service.ts — `work rename-namespace`: moves the refs
 * left under a former namespace into the current one, keeping each tip
 * (f00808 S7).
 *
 * Never while a pull request is open from a former namespace: the forge
 * closes a pull request whose head goes away, and its rename API closed
 * all seven open pull requests here once. That API is never called; a
 * ref is moved by pushing the new name at the same tip, keeping the old
 * tip under the retired root, and only then deleting the old name.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	INamespaceRenameMove,
	INamespaceRenamePlan,
	IRemoteBranch,
} from '../contracts/interfaces/namespace-rename.interface';
import {
	ownedNamespaces,
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	shortName as bare,
} from '../integration/decisions/namespaces.helper';
import { namespacedRef } from './namespaced-ref.helper';

/** Each former prefix with the current prefix it moves to, and its namespace. */
const formerPairs = (
	policy: IResolvedDevelopmentPolicy,
): readonly { from: string; to: string; namespace: string }[] => {
	const namespaces = ownedNamespaces(policy.branches);
	const pairs = (owned: readonly string[]) =>
		owned.slice(1).map((from, index) => ({
			from: bare(from),
			to: bare(owned[0] ?? ''),
			namespace: namespaces[index + 1] ?? '',
		}));
	return [
		...pairs(ownedWorkRefPrefixes(policy.branches)),
		...pairs(ownedPublicationRefPrefixes(policy.branches)),
	].filter((pair) => pair.from.length > 0 && pair.to.length > 0);
};

/** Whether `branch` lives under a former namespace. */
const underFormer = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): boolean => formerPairs(policy).some((pair) => branch.startsWith(pair.from));

/**
 * What renaming would move. Refused as a whole when the open pull
 * requests cannot be read, or when any of them has its head under a
 * former namespace.
 */
export const planNamespaceRename = (input: {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly branches: readonly IRemoteBranch[];
	/** Heads of the open pull requests; `undefined` when the forge could not say. */
	readonly openHeads: readonly string[] | undefined;
}): INamespaceRenamePlan => {
	const { policy } = input;
	if (formerPairs(policy).length === 0) {
		return {
			refusal:
				'No former namespace is declared (development.branches.formerNamespacePrefixes): there is nothing to rename.',
			moves: [],
		};
	}
	if (input.openHeads === undefined) {
		return {
			refusal:
				'The open pull requests could not be read, so nothing proves that no pull request uses a former namespace. Nothing was renamed.',
			moves: [],
		};
	}
	const open = input.openHeads.filter((head) => underFormer(policy, head));
	if (open.length > 0) {
		return {
			refusal: `${String(open.length)} open pull request(s) still use a former namespace (${open.join(', ')}). Renaming their heads would close them: wait until they end.`,
			moves: [],
		};
	}
	const taken = new Set(input.branches.map((branch) => branch.name));
	const moves: INamespaceRenameMove[] = [];
	for (const branch of input.branches) {
		const pair = formerPairs(policy).find((each) =>
			branch.name.startsWith(each.from),
		);
		if (pair === undefined) continue;
		const to = `${pair.to}${branch.name.slice(pair.from.length)}`;
		// A name already taken under the current namespace is another
		// ref's; this one is left where it is rather than overwritten.
		if (taken.has(to)) continue;
		moves.push({
			from: branch.name,
			to,
			sha: branch.sha,
			keptAt: namespacedRef(pair.namespace, 'retired', branch.name),
		});
	}
	return { moves };
};

/** A git runner that says whether the command succeeded. */
type IGit = (args: readonly string[]) => { readonly ok: boolean };

/**
 * Moves each ref: the new name at the same tip, the old tip kept, then
 * the old name deleted. Asks again, just before each move, whether a pull
 * request opened from it meanwhile; stops at the first failure.
 */
export const applyNamespaceRename = (input: {
	readonly git: IGit;
	readonly remote: string;
	readonly moves: readonly INamespaceRenameMove[];
	readonly openHeads: () => readonly string[] | undefined;
}): { readonly moved: readonly string[]; readonly stopped?: string } => {
	const moved: string[] = [];
	for (const move of input.moves) {
		const open = input.openHeads();
		if (open === undefined || open.includes(move.from)) {
			return {
				moved,
				stopped: `${move.from}: ${open === undefined ? 'the open pull requests could not be read' : 'a pull request is open from it'}; it was left as it is.`,
			};
		}
		const steps: readonly (readonly string[])[] = [
			['push', input.remote, `${move.sha}:refs/heads/${move.to}`],
			['push', input.remote, `${move.sha}:${move.keptAt}`],
			['push', input.remote, `:refs/heads/${move.from}`],
		];
		for (const step of steps) {
			if (!input.git(step).ok) {
				return {
					moved,
					stopped: `${move.from}: \`git ${step.join(' ')}\` failed; its tip is unchanged.`,
				};
			}
		}
		moved.push(`${move.from} -> ${move.to}`);
	}
	return { moved };
};
