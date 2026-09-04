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

/** A directed edge \`from → to\` in the dependency graph. */
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
	/** The full package name (e.g. "@delendai/deps"). */
	readonly name: string;
	/** Every declared dependency name (all sections). */
	readonly dependencies: readonly string[];
}

/** A directed edge \`from → to\` in the module graph. */
export interface IModuleEdge {
	readonly from: string;
	readonly to: string;
}

/** The resolved module graph for a single package. */
export interface IModuleGraph {
	readonly nodes: readonly string[];
	readonly edges: readonly IModuleEdge[];
}

/**
 * Injected I/O seam for the module-graph builder. The production
 * adapter (realModules) walks the package src TS files, parses
 * their import statements, and resolves every import to either
 * an in-package relative path or drops it. Tests inject a static
 * map to keep the unit test free of filesystem I/O.
 */
export interface IDiagramModuleDeps {
	/**
	 * List every \`.ts\` file in the package, relative to the package
	 * root. The order is irrelevant; the builder sorts.
	 */
	readonly listPackageFiles: () => Promise<readonly string[]>;
	/**
	 * Read the \`import\` paths of a single file. The I/O layer
	 * returns relative paths (or external paths the I/O layer
	 * could not resolve to a package file); the builder drops the
	 * ones not present in \`listPackageFiles()\`.
	 */
	readonly readFileImports: (
		relativePath: string,
	) => Promise<readonly string[]>;
}
