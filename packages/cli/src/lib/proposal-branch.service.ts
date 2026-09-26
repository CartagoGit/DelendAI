/**
 * proposal-branch.service.ts — the one work branch a proposal keeps while
 * it is in progress (f00642).
 */
import { parseWorkSubject } from './work-ref-shape.service';

/** Units a reviewer works under: a review round is its own branch. */
const REVIEW_SLICES: ReadonlySet<string> = new Set(['review', 'close']);

/** The agent and subject of `ref` under `template`, when it has that shape. */
const partsOf = (template: string, ref: string) => {
	const prefix = template.slice(0, template.indexOf('${agent}/'));
	if (prefix === '' || !ref.startsWith(prefix)) return undefined;
	const rest = ref.slice(prefix.length);
	const slash = rest.indexOf('/');
	if (slash === -1) return undefined;
	const parts = parseWorkSubject(template, rest.slice(slash + 1));
	return parts === undefined
		? undefined
		: { agent: rest.slice(0, slash), ...parts };
};

/**
 * The checked-out work branch that already carries `ref`'s proposal for
 * the same agent and generation, whatever slice or topic it was entered
 * for, with the path of its worktree.
 *
 * A proposal keeps one branch while it is in progress, so a second slice
 * continues on the first one's branch instead of opening another. A
 * review round is not implementation work and never joins one.
 */
export const liveProposalBranch = (
	template: string,
	ref: string,
	worktreeListing: string,
): { readonly ref: string; readonly path: string } | undefined => {
	const wanted = partsOf(template, ref);
	if (wanted === undefined || REVIEW_SLICES.has(wanted.slice)) {
		return undefined;
	}
	for (const block of worktreeListing.split('\n\n')) {
		const lines = block.split('\n');
		const branch = lines
			.find((line) => line.startsWith('branch '))
			?.slice('branch '.length);
		const path = lines
			.find((line) => line.startsWith('worktree '))
			?.slice('worktree '.length);
		if (branch === undefined || path === undefined) continue;
		const found = partsOf(template, branch);
		if (
			found !== undefined &&
			found.agent === wanted.agent &&
			found.proposal === wanted.proposal &&
			found.generation === wanted.generation &&
			!REVIEW_SLICES.has(found.slice)
		) {
			return { ref: branch, path };
		}
	}
	return undefined;
};
