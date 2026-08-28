import type { IToolSurfacePlan } from '../contracts/interfaces/tool-surface.interface';
import {
	buildStartupReport,
	type IStartupReport,
	type IStartupReportDiagnostics,
} from './model';
import { reconcileSurfaceCost, type IPluginCostInput } from './plugin-cost';
import type { IStartupReportLevel } from './level';

const isExposed = (
	registrationId: string,
	plan: IToolSurfacePlan,
	mode: IToolSurfacePlan['mode'],
): boolean => {
	if (mode === 'native') return plan.routerToolId !== registrationId;
	return (
		plan.bootstrapToolIds.includes(registrationId) ||
		(mode === 'compact' && plan.routerToolId === registrationId)
	);
};

const descriptorsFor = (plan: IToolSurfacePlan, pluginId: string | undefined) =>
	plan.descriptors.filter((descriptor) =>
		pluginId === undefined
			? descriptor.pluginId === undefined
			: descriptor.pluginId === pluginId,
	);

/**
 * Build the operator report from the same surface plan used by MCP
 * registration. This keeps available/exposed accounting honest: hidden
 * plugin tools remain available to the internal router but contribute zero
 * to the recurrent managed-surface tax.
 */
export const buildStartupReportForAssembly = (input: {
	readonly plan: IToolSurfacePlan;
	readonly level: IStartupReportLevel;
	readonly version: string;
	readonly workspace: string;
	readonly preset: string;
	readonly configuredPluginIds: readonly string[];
	readonly loadedPluginIds: readonly string[];
	readonly skillsByPlugin: Readonly<Record<string, readonly string[]>>;
	readonly failedPluginCount: number;
	readonly skillsAvailable: number;
	readonly resourcesAvailable: number;
	readonly moduleLoading?: 'lazy' | 'eager';
	readonly warnings?: readonly import('./model').IStartupReportWarning[];
	readonly schemaBytesByRegistrationId?:
		| Readonly<Record<string, number>>
		| undefined;
	readonly now?: () => Date;
	readonly diagnostics?: IStartupReportDiagnostics | undefined;
}): IStartupReport => {
	const pluginIds = [
		'core',
		...input.configuredPluginIds.filter((id) => id !== 'core'),
	];
	const pluginInputs = (mode: IToolSurfacePlan['mode']): IPluginCostInput[] =>
		pluginIds.map((pluginId) => {
			const id = pluginId === 'core' ? undefined : pluginId;
			const availableTools = descriptorsFor(input.plan, id);
			return {
				pluginId,
				pluginName: pluginId,
				availableSkillIds: input.skillsByPlugin[pluginId] ?? [],
				status:
					pluginId === 'core' ||
					input.loadedPluginIds.includes(pluginId)
						? mode === 'managed'
							? 'active-internal'
							: 'loaded-hidden'
						: input.moduleLoading === 'lazy'
							? 'unloaded'
							: 'failed',
				availableTools,
				exposedTools: availableTools.filter((descriptor) =>
					isExposed(descriptor.registrationId, input.plan, mode),
				),
				schemaBytesByRegistrationId: input.schemaBytesByRegistrationId,
			};
		});

	const native = reconcileSurfaceCost(pluginInputs('native'));
	const managed = reconcileSurfaceCost(pluginInputs(input.plan.mode), {
		nativeEquivalentTokensPerRequest:
			native.estimatedSchemaTokensPerRequest,
	});
	const toolsExposed = managed.plugins.reduce(
		(sum, plugin) => sum + plugin.exposedToolsCount,
		0,
	);

	return buildStartupReport(
		{
			identity: {
				version: input.version,
				workspace: input.workspace,
				preset: input.preset,
				surfaceMode: input.plan.mode,
				surfaceModeReason:
					input.plan.explicitMode !== undefined
						? `explicit surface override -> ${input.plan.explicitMode}`
						: 'managed by default at boot; the per-client mode is decided at MCP handshake from client capabilities (see stderr for the resolved reason)',
			},
			catalog: {
				pluginsConfigured: input.configuredPluginIds.length,
				pluginsLoaded: input.loadedPluginIds.length,
				pluginsWarm:
					input.plan.mode === 'managed'
						? 0
						: input.loadedPluginIds.length,
				pluginsFailed: input.failedPluginCount,
				toolsAvailable: input.plan.descriptors.length,
				toolsExposed,
				skillsAvailable: input.skillsAvailable,
				skillsBodiesPreloaded: 0,
				resourcesAvailable: input.resourcesAvailable,
			},
			pluginCosts: managed.plugins,
			runtime: {
				lazyActivation: input.plan.mode === 'managed',
				moduleLoading: input.moduleLoading ?? 'eager',
				internalRouting: input.plan.routerToolId !== undefined,
				idleEvictionMs: input.plan.workingSet?.idleTtlMs ?? 5 * 60_000,
				maxWarmPlugins: input.plan.workingSet?.maxWarmPlugins ?? 8,
				// `managed`/`adaptive`/`compact` all rely on the client
				// re-fetching `tools/list` after a `notifications/tools/list_changed`
				// to ever see a lazily-activated tool appear — `native`
				// registers everything up front and needs no such
				// notification. This used to be a hardcoded `false`
				// regardless of mode (AUD-C01 follow-up: another dishonest
				// startup-report value next to `maxWarmPlugins`).
				listChangedRequired: input.plan.mode !== 'native',
			},
			baseline: {
				tokensPerRequest: native.estimatedSchemaTokensPerRequest,
				source: 'estimated',
			},
			...(input.warnings !== undefined
				? { warnings: input.warnings }
				: {}),
			...(input.now !== undefined ? { now: input.now } : {}),
			...(input.diagnostics === undefined
				? {}
				: { diagnostics: input.diagnostics }),
		},
		input.level,
	);
};
