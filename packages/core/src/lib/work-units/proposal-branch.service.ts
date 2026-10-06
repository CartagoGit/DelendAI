/**
 * proposal-branch.service.ts — the one work branch a proposal keeps while
 * it is in progress (f00642).
 */
import type { ILiveProposalUnit } from '../contracts/interfaces/live-proposal-unit.interface';

import { parseWorkSubject } from './work-ref-shape.service';

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
	// Only implementation continues on a proposal's branch: a review
	// round, an audit or any other kind of work is its own unit.
	if (wanted === undefined || wanted.kind !== 'implement') {
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
			found.kind === wanted.kind
		) {
			return { ref: branch, path };
		}
	}
	return undefined;
};

/** A branch name however it is spelled: `refs/heads/x`, `heads/x` or `x`. */
const withoutRefsHeads = (name: string): string =>
	name.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The kinds of unit that write a proposal's own document. */
const PROPOSAL_WRITING_KINDS: ReadonlySet<string> = new Set([
	'implement',
	'create',
]);

/**
 * The checked-out units that carry `proposal` and write its document,
 * for `agent` when one is named.
 *
 * A proposal created and implemented in a unit exists only on that unit's
 * ref until its pull request lands, so the unit's worktree is the only
 * tree its lifecycle can move in. A review round, an audit or any other
 * kind of unit never writes a proposal's document and is not listed.
 * When both an implementation and a creation unit are live, the
 * implementation is the one that has the proposal's work.
 */
export const liveUnitsOfProposal = (
	template: string,
	worktreeListing: string,
	wanted: { readonly proposal: string; readonly agent?: string | undefined },
): readonly ILiveProposalUnit[] => {
	const units: ILiveProposalUnit[] = [];
	for (const block of worktreeListing.split('\n\n')) {
		const lines = block.split('\n');
		const ref = lines
			.find((line) => line.startsWith('branch '))
			?.slice('branch '.length);
		const path = lines
			.find((line) => line.startsWith('worktree '))
			?.slice('worktree '.length);
		if (ref === undefined || path === undefined) continue;
		const found = partsOf(
			withoutRefsHeads(template),
			withoutRefsHeads(ref),
		);
		if (
			found === undefined ||
			found.proposal !== wanted.proposal ||
			!PROPOSAL_WRITING_KINDS.has(found.kind) ||
			(wanted.agent !== undefined && found.agent !== wanted.agent)
		) {
			continue;
		}
		units.push({ ref, path, agent: found.agent, kind: found.kind });
	}
	const implementing = units.filter((unit) => unit.kind === 'implement');
	return implementing.length > 0 ? implementing : units;
};
