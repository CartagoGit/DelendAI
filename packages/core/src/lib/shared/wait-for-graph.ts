import type {
	IWaitForCycle,
	IWaitForEdge,
} from '../contracts/interfaces/wait-for-graph.interface';

export type { IWaitForCycle, IWaitForEdge };

/**
 * Cycle detection on the wait-for graph.
 *
 * Deliberately tiny and deliberately shared. A swarm's wait graph is a
 * handful of agents, so the naive walk is the right algorithm — the
 * value is not in the traversal, it is in having exactly one definition
 * of "these agents are deadlocked" that every reader agrees on. Two
 * components each rolling their own is how the lock subsystem ended up
 * with a claim that was simultaneously free and held.
 *
 * Cycles of any length count. A→B→A and A→B→C→A are equally
 * unresolvable by waiting, and the three-party case is the one that used
 * to show up only as three agents timing out forever with no
 * explanation.
 */

const adjacency = (edges: readonly IWaitForEdge[]): Map<string, string[]> => {
	const map = new Map<string, string[]>();
	for (const edge of edges) {
		const existing = map.get(edge.waiter);
		if (existing === undefined) map.set(edge.waiter, [edge.holder]);
		else existing.push(edge.holder);
	}
	return map;
};

/**
 * Does following the waits out of `start` lead back to `target`?
 *
 * This is the question a single waiter asks about itself: "is the agent
 * I am blocked on, directly or through others, blocked on me?" A `true`
 * means waiting again can never succeed.
 */
export const waitsBackOnto = (input: {
	readonly edges: readonly IWaitForEdge[];
	readonly start: string;
	readonly target: string;
}): boolean => {
	const graph = adjacency(input.edges);
	const seen = new Set<string>();
	const queue: string[] = [input.start];
	while (queue.length > 0) {
		const agent = queue.shift();
		if (agent === undefined) break;
		if (agent === input.target) return true;
		if (seen.has(agent)) continue;
		seen.add(agent);
		for (const next of graph.get(agent) ?? []) queue.push(next);
	}
	return false;
};

/**
 * Every distinct cycle in the graph, for an operator asking "what is
 * this swarm stuck on?" rather than "am I stuck?".
 *
 * Each cycle is reported once, normalised to start at its
 * lexicographically smallest member, so the same deadlock does not
 * appear once per participant.
 */
export const findWaitForCycles = (
	edges: readonly IWaitForEdge[],
): readonly IWaitForCycle[] => {
	const graph = adjacency(edges);
	const found = new Map<string, IWaitForCycle>();
	const visit = (agent: string, path: readonly string[]): void => {
		const at = path.indexOf(agent);
		if (at !== -1) {
			const cycle = path.slice(at);
			const smallest = [...cycle].sort()[0];
			const offset = cycle.indexOf(smallest ?? '');
			const normalised = [
				...cycle.slice(offset),
				...cycle.slice(0, offset),
			];
			found.set(normalised.join('→'), { agents: normalised });
			return;
		}
		// Bound the walk: a path longer than the node count cannot be
		// simple, and the cycle that made it long was already recorded.
		if (path.length > graph.size) return;
		for (const next of graph.get(agent) ?? []) {
			visit(next, [...path, agent]);
		}
	};
	for (const waiter of graph.keys()) visit(waiter, []);
	return [...found.values()];
};
