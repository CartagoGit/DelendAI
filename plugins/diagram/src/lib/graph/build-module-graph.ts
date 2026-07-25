/**
 * build-module-graph.ts — f00132 S1: build a file-level module graph
 * for a single package, and render it as a mermaid flowchart.
 *
 * A "module graph" is the graph of `.ts` files inside a single package
 * (default: the `diagram` plugin itself) and the `import` relationships
 * between them. Each `.ts` file is a node; every `import` (or `export
 * ... from`) is an edge to the file the path resolves to.
 *
 * Both functions are pure; the I/O (filesystem walk) lives in
 * `real-modules.ts` and is injected via `IDiagramModuleDeps`. The
 * output is deterministic (sorted nodes/edges) so the result is
 * stable across runs and snapshot-friendly.
 */

import type {
	IModuleEdge,
	IModuleGraph,
} from '../contracts/interfaces/graph.interface';

/**
 * The display name for a file: the path relative to the package root,
 * with the `.ts` extension stripped and a leading `./` removed. So
 * `src/lib/foo.ts` → `src/lib/foo`.
 */
export const moduleDisplayName = (relativePath: string): string => {
	const cleaned = relativePath.replace(/\\/g, '/');
	const noExt = cleaned.replace(/\.tsx?$/, '');
	return noExt.startsWith('./') ? noExt.slice(2) : noExt;
};

/**
 * A mermaid-safe node id (letters/digits/underscore). Replaces `/` and
 * `-` with `_` so `src/lib/foo` becomes `src_lib_foo`.
 */
const nodeId = (display: string): string =>
	display.replace(/[^A-Za-z0-9_]/g, '_');

/**
 * Build the module graph for a single package from the file-level
 * `imports` map the I/O layer produces. Pure; deterministic (sorted).
 *
 * Input shape: `{ "src/lib/foo.ts": ["src/lib/bar.ts", ...], ... }`
 * where each entry lists the relative paths `foo.ts` imports.
 */
const entriesOf = (
	files:
		| ReadonlyMap<string, readonly string[]>
		| Readonly<Record<string, readonly string[]>>,
): readonly (readonly [string, readonly string[]])[] => {
	if (files instanceof Map) return [...files.entries()];
	return Object.entries(files);
};

export const buildModuleGraph = (
	files:
		| ReadonlyMap<string, readonly string[]>
		| Readonly<Record<string, readonly string[]>>,
): IModuleGraph => {
	const nodeSet = new Set<string>();
	const edges: IModuleEdge[] = [];
	for (const [file, imports] of entriesOf(files)) {
		const fromDisplay = moduleDisplayName(file);
		nodeSet.add(fromDisplay);
		for (const imported of imports) {
			const toDisplay = moduleDisplayName(imported);
			// Skip self-loops (a file importing itself would never resolve
			// anyway) and external imports the I/O layer did not classify
			// as in-package — the I/O layer drops them before this point.
			if (fromDisplay === toDisplay) continue;
			nodeSet.add(toDisplay);
			edges.push({ from: fromDisplay, to: toDisplay });
		}
	}
	const nodes = [...nodeSet].sort();
	edges.sort(
		(a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
	);
	return { nodes, edges };
};

/**
 * Render a module graph as a mermaid `flowchart LR`. Isolated nodes
 * (no edges) are declared so they still appear. Deterministic output
 * — the same input always produces the same string.
 */
export const renderModuleMermaid = (graph: IModuleGraph): string => {
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
