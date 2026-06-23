import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import {
	listDeps,
	checkDeps,
	checkOutdated,
	fetchLatestFromNpm,
} from '../services/engine';
import type { ILatestVersionFetcher } from '../services/engine';
import { listPolyglotDeps } from '../services/polyglot';

export interface IDepsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Manifest path relative to the workspace root. Default `package.json`. */
	readonly manifest?: string;
	/**
	 * Opt-in: also register `deps_outdated` (hits the npm registry, `effects:
	 * ['network']`). Default false — `deps`/`deps_check`/`deps_list` stay
	 * offline by design; this is the one deliberate, declared exception.
	 */
	readonly allowNetwork?: boolean;
	/** Injectable for tests; defaults to a real npm registry fetch. */
	readonly fetchLatest?: ILatestVersionFetcher;
}

const OUTDATED_ENTRY = z.object({
	name: z.string(),
	range: z.string(),
	section: z.string(),
	wanted: z.string().nullable(),
	latest: z.string().nullable(),
	outdated: z.boolean(),
	error: z.string().optional(),
});

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
		...(options.allowNetwork
			? [
					{
						id: 'deps_outdated',
						summary:
							"Resolve each dep's latest npm version and flag stale ones. Opt-in, network.",
						tags: ['deps', 'network'],
						effects: ['network'],
						register: async (server) => {
							server.registerTool(
								`${prefix}_deps_outdated`,
								{
									description:
										"For each manifest dep whose range pins a plain x.y.z baseline, resolve the npm registry's `latest` dist-tag and flag it as outdated when newer. Ranges without a comparable baseline (*, latest, workspace:/npm:/file:/link:, git urls) report wanted:null and are skipped, not errors. Capped at 50 packages per call (truncated:true past the cap). Opt-in (plugins.deps.options.allowNetwork:true) — deps_list/deps_check stay offline.",
									inputSchema: z.object({
										manifest: z.string().optional(),
									}),
									outputSchema: z.object({
										manifest: z.string(),
										checked: z.number(),
										outdatedCount: z.number(),
										entries: z.array(OUTDATED_ENTRY),
										truncated: z.boolean(),
									}),
								},
								async (args: {
									manifest?: string | undefined;
								}) =>
									toolJson(
										await checkOutdated(
											options.workspaceRootAbs,
											args.manifest ?? manifest,
											options.fetchLatest ??
												fetchLatestFromNpm,
										),
									),
							);
						},
					} satisfies IToolRegistration,
				]
			: []),
		{
			id: 'deps_polyglot',
			summary:
				'List Python/Rust/Go dependencies (pyproject.toml, Cargo.toml, go.mod) if present.',
			tags: ['deps', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_deps_polyglot`,
					{
						description:
							'List declared dependencies from whichever of pyproject.toml (PEP 621 `[project] dependencies` and/or Poetry `[tool.poetry.dependencies]`), Cargo.toml ([dependencies]/[dev-dependencies]/[build-dependencies]) and go.mod (require) exist at the workspace root. Each entry has {ecosystem,name,range,section}. Read-only, offline, no CVE database — same contract as deps_list, for non-npm ecosystems.',
						outputSchema: z.object({
							manifests: z.array(
								z.object({
									ecosystem: z.string(),
									manifest: z.string(),
									deps: z.array(
										z.object({
											ecosystem: z.string(),
											name: z.string(),
											range: z.string(),
											section: z.string(),
										}),
									),
								}),
							),
						}),
					},
					async () =>
						toolJson({
							manifests: await listPolyglotDeps(
								options.workspaceRootAbs,
							),
						}),
				);
			},
		},
	];
};
