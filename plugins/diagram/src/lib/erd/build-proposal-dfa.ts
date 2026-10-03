/**
 * build-proposal-dfa.ts — f00132 S2: build a mermaid stateDiagram of
 * the proposal status finite automaton + the current per-status
 * counts. Pure over an injected counts map; deterministic output.
 *
 * The DFA edges come from `PROPOSAL_STATUS_TRANSITIONS` (the same
 * map the proposal_transition tool validates against). The
 * per-status counts are an INJECTED input — the diagram plugin
 * does not read the registry itself, so the tool stays pure and
 * testable. The orchestrator collects the counts and passes them
 * in.
 *
 * The output is a mermaid `stateDiagram-v2`:
 *   - one node per status (with the count as a label suffix when
 *     a non-zero count is supplied)
 *   - one edge per legal transition, rendered as `from --> to`
 *   - terminal statuses (done, retired) have no outgoing edge
 *
 * The renderer is deliberately minimal: no styling, no subgraphs,
 * no "class" decorations. Mermaid renders the bare DFA crisply
 * enough; the proposal tooling can layer labels on top if it
 * needs more.
 */

import type { IProposalStatus } from '@delendai/proposals/public';
import { PROPOSAL_STATUS_TRANSITIONS } from '@delendai/proposals/public';

export type IProposalStatusCounts = Readonly<
	Partial<Record<IProposalStatus, number>>
>;

/**
 * A single node label. We render a status as `<status>` and
 * optionally suffix the count: `ready [3]`. Mermaid's stateDiagram
 * accepts the bracketed suffix.
 */
const nodeLabel = (
	status: IProposalStatus,
	count: number | undefined,
): string => {
	if (count === undefined || count === 0) return status;
	return `${status} [${count}]`;
};

/**
 * Build the mermaid stateDiagram of the proposal DFA, optionally
 * annotating each node with the current count of proposals in
 * that state. Edges are emitted in alphabetical-by-source order
 * for determinism. Pure: no I/O, no global state.
 */
export const buildProposalDfaMermaid = (
	counts: IProposalStatusCounts = {},
): string => {
	const statuses = Object.keys(PROPOSAL_STATUS_TRANSITIONS).sort();
	const lines: string[] = ['stateDiagram-v2'];
	for (const status of statuses) {
		const label = nodeLabel(
			status as IProposalStatus,
			counts[status as IProposalStatus],
		);
		lines.push(`\t${label}`);
	}
	// Emit edges in (from, to) alphabetical order so the diagram is
	// stable across runs and snapshot-friendly.
	const edgePairs: Array<[string, string]> = [];
	for (const from of statuses) {
		const targets = PROPOSAL_STATUS_TRANSITIONS[from as IProposalStatus];
		if (targets === undefined) continue;
		for (const to of [...targets].sort()) {
			edgePairs.push([from, to]);
		}
	}
	edgePairs.sort(
		(a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
	);
	for (const [from, to] of edgePairs) {
		lines.push(`\t${from} --> ${to}`);
	}
	return lines.join('\n');
};
