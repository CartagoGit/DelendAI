/**
 * Public surface of `@mcp-vertex/diagram`. Pure graph-building primitives for
 * consumers that want to render the dependency graph directly.
 */
export {
	buildDependencyGraph,
	renderMermaid,
} from '../lib/graph/build-graph';
export { realDiagramDeps } from '../lib/graph/real-deps';
export type {
	IDependencyEdge,
	IDependencyGraph,
	IDiagramDeps,
	IPackageNode,
	IWorkspacePackage,
} from '../lib/contracts/interfaces/graph.interface';
