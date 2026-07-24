/**
 * graph.interface.ts — types for the diagram plugin's dependency-graph
 * rendering. Kept under contracts/interfaces per the types-in-contracts
 * convention.
 */

/** One workspace package + the internal (same-workspace) packages it needs. */
export interface IPackageNode {
	/** Short display name (the last path segment or unscoped package name). */
	readonly name: string;
	/** Short names of the internal packages this one depends on. */
	readonly internalDeps: readonly string[];
}

/** A directed edge `from → to` in the dependency graph. */
export interface IDependencyEdge {
	readonly from: string;
	readonly to: string;
}

/** The resolved internal dependency graph. */
export interface IDependencyGraph {
	readonly nodes: readonly string[];
	readonly edges: readonly IDependencyEdge[];
}

/** Injected I/O seam so the graph build is unit-testable without a filesystem. */
export interface IDiagramDeps {
	/** All workspace packages with their declared dependency names. */
	readonly listWorkspacePackages: () => Promise<readonly IWorkspacePackage[]>;
}

/** A workspace package as read from its manifest. */
export interface IWorkspacePackage {
	/** The full package name (e.g. "@mcp-vertex/deps"). */
	readonly name: string;
	/** Every declared dependency name (all sections). */
	readonly dependencies: readonly string[];
}
