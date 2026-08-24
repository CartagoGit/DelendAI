import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import type { IDependencyGraphNode } from '../contracts/interfaces/dependency-graph.interface';
import type { IPluginRegisterErrorInfo } from '../contracts/interfaces/plugin-lifecycle-error.interface';
import { formatMissingDependenciesError } from './load-plugins-deps.helper';
import {
	blockDependentsForFailure,
	buildDependencyGraph,
	setDependencyGraphState,
} from './dependency-graph.service';

const formatBlockedDependencyMessage = (
	pluginName: string,
	blockedBy: readonly string[],
	blockerState: 'failed' | 'blocked',
): string => {
	const names = blockedBy.map((name) => `"${name}"`).join(', ');
	if (blockerState === 'failed') {
		return `plugin "${pluginName}" blocked because ${blockedBy.length === 1 ? 'dependency' : 'dependencies'} ${names} failed to register.`;
	}
	return `plugin "${pluginName}" blocked because ${blockedBy.length === 1 ? 'dependency' : 'dependencies'} ${names} ${blockedBy.length === 1 ? 'is' : 'are'} blocked.`;
};

const recordDependencyError = (
	registerErrors: IPluginRegisterErrorInfo[],
	errors: Array<{ specifier: string; message: string }>,
	recordedPlugins: Set<string>,
	node: IDependencyGraphNode,
	info: IPluginRegisterErrorInfo,
	message: string,
): void => {
	if (recordedPlugins.has(node.name)) return;
	recordedPlugins.add(node.name);
	registerErrors.push(info);
	errors.push({ specifier: node.specifier, message });
};

export const registerResolvedPluginsWithLifecycle = async (input: {
	readonly resolvedPlugins: readonly {
		readonly specifier: string;
		readonly resolved: string;
		readonly plugin: IMcpPlugin;
		readonly ctx: IMcpPluginContext;
	}[];
	readonly timeoutMs: number;
	readonly withTimeout: <T>(
		promise: Promise<T>,
		ms: number,
		label: string,
	) => Promise<T>;
}): Promise<{
	readonly loaded: readonly {
		readonly specifier: string;
		readonly resolved: string;
		readonly plugin: IMcpPlugin;
		readonly registrations: IMcpPluginRegistrations;
	}[];
	readonly errors: ReadonlyArray<{
		readonly specifier: string;
		readonly message: string;
	}>;
	readonly registerErrors: readonly IPluginRegisterErrorInfo[];
}> => {
	const { resolvedPlugins, timeoutMs, withTimeout } = input;
	const errors: Array<{ specifier: string; message: string }> = [];
	const registerErrors: IPluginRegisterErrorInfo[] = [];
	const recordedDependencyPlugins = new Set<string>();
	const resolvedByName = new Map(
		resolvedPlugins.map((entry) => [entry.plugin.name, entry] as const),
	);
	let dependencyGraph = buildDependencyGraph(
		resolvedPlugins.map(({ specifier, resolved, plugin }) => ({
			name: plugin.name,
			specifier,
			resolvedSpecifier: resolved,
			initialState: 'validated',
			...(plugin.dependsOn ? { dependsOn: plugin.dependsOn } : {}),
		})),
	);

	if (dependencyGraph.cycle) {
		for (const pluginName of dependencyGraph.cycle.plugins) {
			const node = dependencyGraph.nodes[pluginName];
			if (!node) continue;
			recordDependencyError(
				registerErrors,
				errors,
				recordedDependencyPlugins,
				node,
				{
					pluginName,
					resolvedSpecifier: node.resolvedSpecifier,
					phase: 'dependency',
					dependencyFailureType: 'cycle',
					cyclePath: dependencyGraph.cycle.path,
					lifecycleState: 'blocked',
					error: new Error(dependencyGraph.cycle.message),
				},
				dependencyGraph.cycle.message,
			);
		}
		return { loaded: [], errors, registerErrors };
	}

	for (const missing of dependencyGraph.missingDependencies) {
		const node = dependencyGraph.nodes[missing.plugin];
		if (!node) continue;
		dependencyGraph = setDependencyGraphState(
			dependencyGraph,
			missing.plugin,
			'blocked',
			{ blockedBy: missing.missing },
		);
		recordDependencyError(
			registerErrors,
			errors,
			recordedDependencyPlugins,
			node,
			{
				pluginName: missing.plugin,
				resolvedSpecifier: node.resolvedSpecifier,
				phase: 'dependency',
				dependencyFailureType: 'missing',
				missingDependencies: missing.missing,
				lifecycleState: 'blocked',
				error: new Error(formatMissingDependenciesError([missing])),
			},
			formatMissingDependenciesError([missing]),
		);
		const blockedResult = blockDependentsForFailure(
			dependencyGraph,
			missing.plugin,
		);
		dependencyGraph = blockedResult.graph;
		for (const blocked of blockedResult.blocked) {
			const blockedBy = blocked.blockedBy ?? [missing.plugin];
			recordDependencyError(
				registerErrors,
				errors,
				recordedDependencyPlugins,
				blocked,
				{
					pluginName: blocked.name,
					resolvedSpecifier: blocked.resolvedSpecifier,
					phase: 'dependency',
					dependencyFailureType: 'blocked',
					blockedBy,
					lifecycleState: 'blocked',
					error: new Error(
						formatBlockedDependencyMessage(
							blocked.name,
							blockedBy,
							'blocked',
						),
					),
				},
				formatBlockedDependencyMessage(
					blocked.name,
					blockedBy,
					'blocked',
				),
			);
		}
	}

	const loaded: Array<{
		readonly specifier: string;
		readonly resolved: string;
		readonly plugin: IMcpPlugin;
		readonly registrations: IMcpPluginRegistrations;
	}> = [];
	for (const pluginName of dependencyGraph.order) {
		const entry = resolvedByName.get(pluginName);
		const node = dependencyGraph.nodes[pluginName];
		if (!entry || !node) continue;
		if (node.state === 'blocked' || node.state === 'failed') continue;
		dependencyGraph = setDependencyGraphState(
			dependencyGraph,
			pluginName,
			'registering',
		);
		const { specifier, resolved, plugin, ctx } = entry;
		try {
			const registrations = await withTimeout(
				Promise.resolve(plugin.register(ctx)),
				timeoutMs,
				`plugin "${plugin.name}" register()`,
			);
			dependencyGraph = setDependencyGraphState(
				dependencyGraph,
				pluginName,
				'active',
			);
			loaded.push({ specifier, resolved, plugin, registrations });
		} catch (error) {
			dependencyGraph = setDependencyGraphState(
				dependencyGraph,
				pluginName,
				'failed',
			);
			registerErrors.push({
				pluginName: plugin.name,
				resolvedSpecifier: resolved,
				phase: 'register',
				lifecycleState: 'failed',
				error,
			});
			errors.push({
				specifier,
				message: `plugin "${plugin.name}" register() failed: ${error instanceof Error ? error.message : String(error)}`,
			});
			const blockedResult = blockDependentsForFailure(
				dependencyGraph,
				pluginName,
			);
			dependencyGraph = blockedResult.graph;
			for (const blocked of blockedResult.blocked) {
				const blockedBy = blocked.blockedBy ?? [pluginName];
				const blockerState =
					dependencyGraph.nodes[blockedBy[0] ?? pluginName]?.state;
				const dependencyFailureType =
					blockerState === 'failed' ? 'failed' : 'blocked';
				recordDependencyError(
					registerErrors,
					errors,
					recordedDependencyPlugins,
					blocked,
					{
						pluginName: blocked.name,
						resolvedSpecifier: blocked.resolvedSpecifier,
						phase: 'dependency',
						dependencyFailureType,
						blockedBy,
						lifecycleState: 'blocked',
						error: new Error(
							formatBlockedDependencyMessage(
								blocked.name,
								blockedBy,
								dependencyFailureType === 'failed'
									? 'failed'
									: 'blocked',
							),
						),
					},
					formatBlockedDependencyMessage(
						blocked.name,
						blockedBy,
						dependencyFailureType === 'failed'
							? 'failed'
							: 'blocked',
					),
				);
			}
		}
	}

	return { loaded, errors, registerErrors };
};
