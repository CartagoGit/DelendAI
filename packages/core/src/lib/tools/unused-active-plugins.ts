import type { IActivationReport } from '../contracts/interfaces/activation-report.interface';
import type { IMetricsRegistry } from '../metrics/metrics-registry';

export interface IUnusedActivePluginsInput {
	readonly activationReport: IActivationReport;
	readonly corePrefix: string;
	readonly namespaceForPlugin: (pluginId: string) => string;
	readonly metricsRegistry: IMetricsRegistry;
}

/**
 * Finds enabled plugins that expose tools but have not received a tool call in
 * this server process. Metrics are the canonical session-level observation
 * point, populated by the common tool wrapper even without the logs plugin.
 */
export const findUnusedActivePlugins = (
	input: IUnusedActivePluginsInput,
): string[] => {
	const observedTools = Object.keys(input.metricsRegistry.snapshot().tools);
	return input.activationReport.entries
		.filter((entry) => entry.active && entry.toolCount > 0)
		.map((entry) => ({
			id: entry.id,
			prefix: `${input.corePrefix}_${input.namespaceForPlugin(entry.id)}_`,
		}))
		.filter(
			(entry) =>
				!observedTools.some((toolName) =>
					toolName.startsWith(entry.prefix),
				),
		)
		.map((entry) => entry.id)
		.sort((left, right) => left.localeCompare(right));
};
