/**
 * diagram-graph.tool.ts — f00132 S1: the two graph-rendering tools in
 * one file (per the slice spec). `diagram_deps` re-renders the
 * workspace's internal dependency graph as a mermaid flowchart; the
 * `diagram_modules` re-renders a single package's module graph
 * (file-level import graph) as a mermaid flowchart.
 *
 * Both tools compose the pure builders (`buildDependencyGraph`,
 * `buildModuleGraph`, `renderMermaid`, `renderModuleMermaid`) and
 * the I/O adapters (`realDiagramDeps`, `realDiagramModules`). The
 * I/O is injectable, so the unit test exercises the full
 * shape end-to-end without a filesystem.
 */

import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	resolveWorkspaceContained,
	toolError,
	toolJson,
} from '@mcp-vertex/core/public';

import type {
	IDiagramDeps,
	IDiagramModuleDeps,
} from '../contracts/interfaces/graph.interface';
import {
	buildDependencyGraph,
	limitDependencyGraph,
	renderMermaid,
} from '../graph/build-graph';
import {
	buildModuleGraph,
	limitModuleGraph,
	renderModuleMermaid,
} from '../graph/build-module-graph';
import { realDiagramDeps } from '../graph/real-deps';
import { realDiagramModules } from '../graph/real-modules';

export interface IDiagramGraphToolOptions {
	readonly namespacePrefix: string;
	/** Workspace root for `diagram_deps` (where packages/plugins/apps live). */
	readonly workspaceRootAbs: string;
	/** Optional dependency I/O override. */
	readonly deps?: IDiagramDeps;
	/** Optional module I/O override. */
	readonly moduleDeps?: IDiagramModuleDeps;
	/** Optional package root for `diagram_modules`. Defaults to the diagram plugin. */
	readonly modulePackageRootAbs?: string;
}

const withOptionalTruncated = <T extends object>(
	value: T,
	truncated: boolean,
): T & { truncated?: true } =>
	truncated ? { ...value, truncated: true } : value;

const toolErrorForModuleGraph = (
	packageRoot: string,
	error: Error,
): ReturnType<typeof toolError> =>
	toolError(
		[
			'diagram_modules failed while scanning',
			packageRoot,
			error.message,
		].join(': '),
		[
			'Omit `packageRoot` to use the diagram plugin default.',
			'Otherwise pass a workspace-relative package path whose source tree is readable.',
		].join(' '),
	);

/**
 * Build the two-tool registration for `<prefix>_diagram_deps` and
 * `<prefix>_diagram_modules`. Both tools share the options struct.
 */
export const buildDiagramGraphToolRegistrations = (
	options: IDiagramGraphToolOptions,
): readonly IToolRegistration[] => {
	const deps = options.deps ?? realDiagramDeps(options.workspaceRootAbs);
	const modulePackageRootAbs =
		options.modulePackageRootAbs ?? options.workspaceRootAbs;
	const moduleDeps =
		options.moduleDeps ?? realDiagramModules(modulePackageRootAbs);

	return [
		{
			id: 'diagram_deps',
			summary:
				'Render the workspace internal dependency graph as a mermaid flowchart.',
			tags: ['diagram', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_diagram_deps`,
					{
						description:
							'Build the internal (same-workspace) dependency graph — which workspace package depends on which — and return it as a mermaid `flowchart LR` (renders natively in the docs site + artifacts) plus the raw nodes/edges. External dependencies are ignored. When `limit` is provided, the tool keeps the first N node ids in deterministic alphabetical order and only the edges between retained nodes. Offline, read-only.',
						inputSchema: z.object({
							limit: z.number().int().positive().optional(),
						}),
						outputSchema: z.object({
							mermaid: z.string(),
							nodes: z.array(z.string()),
							edges: z.array(
								z.object({ from: z.string(), to: z.string() }),
							),
							truncated: z.boolean().optional(),
						}),
					},
					async (args: { limit?: number | undefined }) => {
						const packages = await deps.listWorkspacePackages();
						const limited = limitDependencyGraph(
							buildDependencyGraph(packages),
							args.limit,
						);
						return toolJson(
							withOptionalTruncated(
								{
									mermaid: renderMermaid(limited.graph),
									nodes: limited.graph.nodes,
									edges: limited.graph.edges,
								},
								limited.truncated,
							),
						);
					},
				);
			},
		},
		{
			id: 'diagram_modules',
			summary:
				'Render a single package file-level module graph as a mermaid flowchart.',
			tags: ['diagram', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_diagram_modules`,
					{
						description:
							'Build the file-level module graph (every `.ts` file under the package and the `import` edges between them) and return it as a mermaid `flowchart LR` plus the raw nodes/edges. External imports are dropped. The default package root is the diagram plugin itself; override via `packageRoot` (workspace-relative, e.g. `plugins/foo`) for a different package. When `limit` is provided, the tool keeps the first N node ids in deterministic alphabetical order and only the edges between retained nodes. Offline, read-only.',
						inputSchema: z.object({
							packageRoot: z.string().optional(),
							limit: z.number().int().positive().optional(),
						}),
						outputSchema: z.object({
							mermaid: z.string(),
							nodes: z.array(z.string()),
							edges: z.array(
								z.object({ from: z.string(), to: z.string() }),
							),
							packageRoot: z.string(),
							truncated: z.boolean().optional(),
						}),
					},
					async (args: {
						packageRoot?: string | undefined;
						limit?: number | undefined;
					}) => {
						const explicitRoot = args.packageRoot;
						let runtimeDeps = moduleDeps;
						let effectiveRoot = modulePackageRootAbs;
						if (explicitRoot !== undefined && explicitRoot !== '') {
							const contained = resolveWorkspaceContained(
								options.workspaceRootAbs,
								explicitRoot,
							);
							if (!contained.ok) {
								return toolError(
									`packageRoot "${explicitRoot}" is not allowed`,
									contained.reason ??
										'packageRoot must be a workspace-relative path.',
								);
							}
							runtimeDeps = realDiagramModules(contained.abs);
							effectiveRoot = contained.abs;
						}
						try {
							const files = await runtimeDeps.listPackageFiles();
							const importMap = new Map<
								string,
								readonly string[]
							>();
							for (const file of files) {
								const imports =
									await runtimeDeps.readFileImports(file);
								importMap.set(file, imports);
							}
							const limited = limitModuleGraph(
								buildModuleGraph(importMap),
								args.limit,
							);
							return toolJson(
								withOptionalTruncated(
									{
										mermaid: renderModuleMermaid(
											limited.graph,
										),
										nodes: limited.graph.nodes,
										edges: limited.graph.edges,
										packageRoot: effectiveRoot,
									},
									limited.truncated,
								),
							);
						} catch (err) {
							return toolErrorForModuleGraph(
								effectiveRoot,
								err as Error,
							);
						}
					},
				);
			},
		},
	];
};
