/**
 * stray-refs.service.ts — the clone holds no ref that is nobody's.
 *
 * A branch list shows branches. A commit graph shows every ref, and after
 * one run it showed a hundred tips going nowhere: copies of work kept "just
 * in case" under `refs/recovery/`, local copies of retired units, and a
 * remote-tracking ref of a remote that no longer existed. None was a
 * branch, so no tool that lists branches named them, and the owner saw a
 * repository full of lost work that was, in fact, all kept elsewhere.
 *
 * What may be in a clone is known: branches, tags, what was fetched from
 * a configured remote, git's own (stash, notes, bisect, replace) and the
 * product's bookkeeping other than retired work, which lives on the forge.
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';

/** Ref namespaces git itself owns. */
const GIT_OWN = ['stash', 'notes', 'bisect', 'replace', 'original', 'prefetch'];

/** The refs of `refs` that belong to nothing a clone is expected to hold. */
export const strayRefs = (input: {
	readonly refs: readonly string[];
	readonly remotes: readonly string[];
	readonly namespace: string;
}): readonly string[] =>
	input.refs.filter((ref) => {
		const [, kind = '', ...rest] = ref.split('/');
		if (kind === 'heads' || kind === 'tags') return false;
		if (GIT_OWN.includes(kind)) return false;
		if (kind === 'remotes') return !input.remotes.includes(rest[0] ?? '');
		// Retired work is kept on the forge, not here; the rest of the
		// product's own namespace is bookkeeping it may cache.
		if (kind === input.namespace) return rest[0] === 'retired';
		return true;
	});

/** The invariant, from what the clone has. */
export const strayRefsInvariant = (input: {
	readonly refs: readonly string[];
	readonly remotes: readonly string[];
	readonly namespace: string;
}): IInvariantResult => {
	const stray = strayRefs(input);
	return {
		scope: 'checkout',
		id: 'no-stray-refs',
		claim: 'the clone holds no ref that is nobody’s',
		holds: stray.length === 0,
		observed:
			stray.length === 0
				? 'none'
				: `${String(stray.length)}: ${stray.slice(0, 3).join(', ')}`,
		remedy: 'a tip worth keeping is retired (`delendai work retire --ref=<branch> --reason=<why>`), which keeps it on the forge; then `git update-ref -d <ref>` for each ref left here',
	};
};
