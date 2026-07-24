/**
 * diagram-deps.tool.ts — `diagram_deps`: render the workspace's internal
 * dependency graph as a mermaid flowchart (which renders natively in the docs
 * site + artifacts). Composes the pure graph builder + renderer; the I/O is
 * injectable, so the tool is testable without a filesystem.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import type { IDiagramDeps } from '../contracts/interfaces/graph.interface';
import { buildDependencyGraph, renderMermaid } from '../graph/build-graph';
import { realDiagramDeps } from '../graph/real-deps';

export const buildDiagramDepsRegistration = (options: {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly deps?: IDiagramDeps;
}): IToolRegistration => ({
	id: 'diagram_deps',
	summary:
		'Render the workspace internal dependency graph as a mermaid flowchart.',
	tags: ['diagram', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_diagram_deps`,
			{
				description:
					'Build the internal (same-workspace) dependency graph — which workspace package depends on which — and return it as a mermaid `flowchart LR` (renders natively in the docs site + artifacts) plus the raw nodes/edges. External dependencies are ignored. Offline, read-only.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					mermaid: z.string(),
					nodes: z.array(z.string()),
					edges: z.array(
						z.object({ from: z.string(), to: z.string() }),
					),
				}),
			},
			async () => {
				const deps =
					options.deps ?? realDiagramDeps(options.workspaceRootAbs);
				const packages = await deps.listWorkspacePackages();
				const graph = buildDependencyGraph(packages);
				return toolJson({
					mermaid: renderMermaid(graph),
					nodes: graph.nodes,
					edges: graph.edges,
				});
			},
		);
	},
});
