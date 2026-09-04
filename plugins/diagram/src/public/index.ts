/**
 * Public surface of `@delendai/diagram`. Pure graph-building primitives for
 * consumers that want to render the dependency graph + module graph directly.
 */
export {
	buildDependencyGraph,
	renderMermaid,
} from '../lib/graph/build-graph';
export {
	buildModuleGraph,
	moduleDisplayName,
	renderModuleMermaid,
} from '../lib/graph/build-module-graph';
export { realDiagramDeps } from '../lib/graph/real-deps';
export { realDiagramModules } from '../lib/graph/real-modules';
export { buildDiagramGraphToolRegistrations } from '../lib/tools/diagram-graph.tool';
export type {
	IDependencyEdge,
	IDependencyGraph,
	IDiagramDeps,
	IPackageNode,
	IWorkspacePackage,
	IModuleEdge,
	IModuleGraph,
	IDiagramModuleDeps,
} from '../lib/contracts/interfaces/graph.interface';
export type { IDiagramGraphToolOptions } from '../lib/tools/diagram-graph.tool';
export { buildMermaidEr } from '../lib/erd/build-erd';
export { buildProposalDfaMermaid } from '../lib/erd/build-proposal-dfa';
export type { IProposalStatusCounts } from '../lib/erd/build-proposal-dfa';
export { buildDiagramProposalsToolRegistrations } from '../lib/tools/diagram-proposals.tool';
export type { IDiagramProposalsToolOptions } from '../lib/tools/diagram-proposals.tool';
