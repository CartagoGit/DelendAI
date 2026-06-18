import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { listDeps, checkDeps } from './engine';

export interface IDepsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Manifest path relative to the workspace root. Default `package.json`. */
	readonly manifest?: string;
}

const SECTION_COUNTS = z.object({
	dependencies: z.number(),
	devDependencies: z.number(),
	peerDependencies: z.number(),
	optionalDependencies: z.number(),
});

/**
 * Dependency inventory + offline health for the project manifest.
 * `deps_list` enumerates declared deps; `deps_check` flags missing
 * lockfile, unpinned ranges and cross-section duplicates. No network.
 */
export const buildDepsToolRegistrations = (
	options: IDepsToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const manifest = options.manifest ?? 'package.json';
	return [
		{
			id: 'deps_list',
			summary:
				'Inventory the manifest dependencies (name, range, section).',
			tags: ['deps', 'orientation', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_deps_list`,
					{
						description:
							'List the declared dependencies from package.json across dependencies/devDependencies/peerDependencies/optionalDependencies, each with its version range. Read-only, offline.',
						inputSchema: z.object({
							manifest: z.string().optional(),
						}),
						outputSchema: z.object({
							manifest: z.string(),
							found: z.boolean(),
							counts: SECTION_COUNTS,
							deps: z.array(
								z.object({
									name: z.string(),
									range: z.string(),
									section: z.string(),
								}),
							),
						}),
					},
					async (args: { manifest?: string | undefined }) =>
						toolJson(
							await listDeps(
								options.workspaceRootAbs,
								args.manifest ?? manifest,
							),
						),
				);
			},
		},
		{
			id: 'deps_check',
			summary:
				'Offline dependency health: missing lockfile, unpinned ranges, cross-section duplicates.',
			tags: ['deps', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_deps_check`,
					{
						description:
							'Report offline dependency health: missing lockfile (non-reproducible builds), unpinned ranges (*, latest) and deps declared in more than one section. Returns {manifest, lockfile, findings, healthy}. No network / no CVE database.',
						inputSchema: z.object({
							manifest: z.string().optional(),
						}),
						outputSchema: z.object({
							manifest: z.string(),
							lockfile: z.object({
								present: z.boolean(),
								kind: z.string().nullable(),
							}),
							findings: z.array(
								z.object({
									kind: z.string(),
									dep: z.string().optional(),
									detail: z.string(),
								}),
							),
							healthy: z.boolean(),
						}),
					},
					async (args: { manifest?: string | undefined }) =>
						toolJson(
							await checkDeps(
								options.workspaceRootAbs,
								args.manifest ?? manifest,
							),
						),
				);
			},
		},
	];
};
