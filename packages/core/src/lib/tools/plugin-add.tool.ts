/**
 * plugin-add.tool.ts — f00141/S2: `${prefix}_plugin_add` registration.
 *
 * Pure registration builder: resolve a plugin id from the registry,
 * enforce explicit consent for community entries, then either return a
 * dry-run plan or call injected install/configure hooks.
 */
import z from 'zod';

import type {
	IPluginRegistryEntry,
	IResolvePluginsOptions,
	IResolvePluginsResult,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import { resolvePlugins } from '../registry/resolve';

import { toolError, toolJson } from '../shared/tool-response';

export interface IPluginAddToolOptions {
	readonly namespacePrefix: string;
	/**
	 * Resolver for the registry (defaults to `resolvePlugins` from core).
	 * Injected so tests can stub the registry without touching the index.
	 */
	readonly resolve?: (opts: IResolvePluginsOptions) => IResolvePluginsResult;
	/**
	 * Installer the tool will call after wiring. Receives an
	 * `IPluginRegistryEntry` and returns a structured result.
	 * Defaults to a no-op stub that records intent.
	 */
	readonly install?: (entry: IPluginRegistryEntry) => Promise<IInstallResult>;
	/**
	 * Config writer. Receives the entry's `id` + `package` and returns
	 * the new config file path. Defaults to a no-op stub.
	 */
	readonly configure?: (
		entry: IPluginRegistryEntry,
	) => Promise<IConfigureResult>;
	/**
	 * Dry-run when true (the default for the tool's `dryRun` input unless
	 * overridden). When false the tool actually calls `install` +
	 * `configure`.
	 */
	readonly defaultDryRun?: boolean;
}

export interface IInstallResult {
	readonly installed: boolean;
	readonly note?: string;
}

export interface IConfigureResult {
	readonly configPath: string;
	readonly added: boolean;
}

const buildDefaultInstall = async (
	_entry: IPluginRegistryEntry,
): Promise<IInstallResult> => ({
	installed: true,
	note: 'install stub: recorded plugin adoption intent; no package install ran.',
});

const buildDefaultConfigure = async (
	_entry: IPluginRegistryEntry,
): Promise<IConfigureResult> => ({
	configPath: 'mcp-vertex.config.json',
	added: true,
});

const TOOL_INPUT = z.object({
	/** Plugin id from the registry (e.g. `security`, `deps`). */
	id: z.string().min(1),
	/** When true, do not actually install — return the plan only. */
	dryRun: z.boolean().optional(),
	/** When origin is `community`, this MUST be true. */
	consentCommunity: z.boolean().optional(),
});

const TOOL_OUTPUT = z.object({
	id: z.string(),
	package: z.string(),
	origin: z.enum(['first-party', 'community']),
	dryRun: z.boolean(),
	installed: z.boolean(),
	configured: z.boolean(),
	configPath: z.string().optional(),
	notes: z.array(z.string()),
});

export const buildPluginAddRegistration = (
	options: IPluginAddToolOptions,
): IToolRegistration => ({
	id: 'plugin_add',
	summary: 'Resolve a plugin id and produce its install/config plan.',
	tags: ['plugin', 'registry', 'adopt'],
	effects: ['network', 'write'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugin_add`,
			{
				description:
					'Resolve a plugin id from the registry and optionally run the injected install + configure hooks.',
				inputSchema: TOOL_INPUT,
				outputSchema: TOOL_OUTPUT,
			},
			async (args) => {
				const resolve = options.resolve ?? resolvePlugins;
				const install = options.install ?? buildDefaultInstall;
				const configure = options.configure ?? buildDefaultConfigure;
				const dryRun = args.dryRun ?? options.defaultDryRun ?? true;
				const { entries } = resolve({});
				const entry = entries.find(
					(candidate) => candidate.id === args.id,
				);

				if (entry === undefined) {
					return toolError(
						'not-found',
						`No plugin with id "${args.id}" exists in the registry. Search the registry first and retry with a valid id.`,
					);
				}

				if (
					entry.origin === 'community' &&
					args.consentCommunity !== true
				) {
					return toolError(
						'consent-required',
						`Plugin "${entry.id}" (${entry.package}) is community-origin. Re-call with consentCommunity: true to confirm adoption.`,
					);
				}

				const notes: string[] = [];
				let installed = false;
				let configured = false;
				let configPath: string | undefined;

				if (!dryRun) {
					const installResult = await install(entry);
					installed = installResult.installed;
					if (installResult.note !== undefined) {
						notes.push(installResult.note);
					}

					const configureResult = await configure(entry);
					configured = configureResult.added;
					configPath = configureResult.configPath;
				}

				return toolJson({
					id: entry.id,
					package: entry.package,
					origin: entry.origin,
					dryRun,
					installed,
					configured,
					...(configPath !== undefined ? { configPath } : {}),
					notes,
				});
			},
		);
	},
});
