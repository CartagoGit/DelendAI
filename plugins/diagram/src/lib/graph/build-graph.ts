/**
 * build-graph.ts — build the internal (same-workspace) dependency graph from
 * a list of workspace packages, and render it as a mermaid flowchart. Both
 * pure; the mermaid output renders natively in the docs site and in
 * artifacts, so the graph is instantly viewable.
 */
import type {
	IDependencyGraph,
	IWorkspacePackage,
} from '../contracts/interfaces/graph.interface';

interface INodeEdgeGraph<TEdge extends { from: string; to: string }> {
	readonly nodes: readonly string[];
	readonly edges: readonly TEdge[];
}

/** The short, display name for a package (unscoped last segment). */
const shortName = (name: string): string => {
	const slash = name.lastIndexOf('/');
	return slash >= 0 ? name.slice(slash + 1) : name;
};

/** A mermaid-safe node id (letters/digits/underscore). */
const nodeId = (name: string): string => name.replace(/[^A-Za-z0-9_]/g, '_');

/**
 * Build the internal dependency graph: nodes are the workspace packages
 * (short names), edges are `from → to` for every dependency that is itself a
 * workspace package. External deps are ignored. Pure; deterministic (sorted).
 */
export const buildDependencyGraph = (
	packages: readonly IWorkspacePackage[],
): IDependencyGraph => {
	const internal = new Set(packages.map((pkg) => pkg.name));
	const nodes = [
		...new Set(packages.map((pkg) => shortName(pkg.name))),
	].sort();
	const edges = packages
		.flatMap((pkg) =>
			pkg.dependencies
				.filter((dep) => internal.has(dep) && dep !== pkg.name)
				.map((dep) => ({
					from: shortName(pkg.name),
					to: shortName(dep),
				})),
		)
		.sort(
			(a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
		);
	return { nodes, edges };
};

/**
 * Deterministically keep the first `limit` node ids in alphabetical order and
 * retain only the edges whose endpoints both survive the cut.
 */
export const limitGraph = <TEdge extends { from: string; to: string }>(
	graph: INodeEdgeGraph<TEdge>,
	limit: number | undefined,
): { graph: INodeEdgeGraph<TEdge>; truncated: boolean } => {
	if (limit === undefined || graph.nodes.length <= limit) {
		return { graph, truncated: false };
	}
	const nodes = graph.nodes.slice(0, limit);
	const kept = new Set(nodes);
	return {
		graph: {
			nodes,
			edges: graph.edges.filter(
				(edge) => kept.has(edge.from) && kept.has(edge.to),
			),
		},
		truncated: true,
	};
};

export const limitDependencyGraph = (
	graph: IDependencyGraph,
	limit: number | undefined,
): { graph: IDependencyGraph; truncated: boolean } => {
	const limited = limitGraph(graph, limit);
	return {
		graph: limited.graph as IDependencyGraph,
		truncated: limited.truncated,
	};
};

export const renderNodeEdgeMermaid = <
	TEdge extends { from: string; to: string },
>(
	graph: INodeEdgeGraph<TEdge>,
): string => {
	const lines = ['flowchart LR'];
	const connected = new Set<string>();
	for (const edge of graph.edges) {
		connected.add(edge.from);
		connected.add(edge.to);
		lines.push(
			`\t${nodeId(edge.from)}["${edge.from}"] --> ${nodeId(edge.to)}["${edge.to}"]`,
		);
	}
	for (const node of graph.nodes) {
		if (!connected.has(node)) lines.push(`\t${nodeId(node)}["${node}"]`);
	}
	return lines.join('\n');
};

/**
 * Render a dependency graph as a mermaid `flowchart LR`. Isolated nodes (no
 * edges) are declared so they still appear. Deterministic output.
 */
export const renderMermaid = (graph: IDependencyGraph): string =>
	renderNodeEdgeMermaid(graph);
