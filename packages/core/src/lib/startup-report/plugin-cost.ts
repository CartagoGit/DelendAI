/**
 * startup-report/plugin-cost.ts — q00009 / f00260.
 *
 * Per-plugin per-request cost accounting. The acceptance criterion
 * (q00009 §26) is unambiguous:
 *
 *   "sum(plugin.exposedSchemaBytesPerRequest)
 *    == surface.exposedSchemaBytesPerRequest"
 *
 * Plus the strict rule that an unloaded / hidden plugin contributes
 * ZERO to the schema tax, even when it has many tools available.
 *
 * This module is pure math: no I/O, no clock, no fs. It takes a
 * snapshot of plugin descriptors and produces:
 *
 *   - a per-plugin `IPluginCostSnapshot`
 *   - a surface-wide `ISurfaceCostReconciliation`
 *
 * The reconciliation includes a `balanced` boolean so the caller
 * (or a regression lint, see q00009 c00150) can fail-fast when the
 * sum disagrees with the surface total.
 */

import type { IToolSurfaceDescriptor } from '../contracts/interfaces/tool-surface.interface';

/**
 * Budget semantics for a plugin. Matches q00009 §14.3 verbatim.
 *
 *  - `dedicated`            plugin has its own budget number
 *  - `shared`               plugin shares a budget with peers
 *  - `inherited`            plugin uses the preset-level budget
 *  - `unbounded-by-plugin`  no per-plugin cap
 */
export type IBudgetSemantics =
	| 'dedicated'
	| 'shared'
	| 'inherited'
	| 'unbounded-by-plugin';

/**
 * Optional explicit budget for a plugin. When `semantics` is
 * `unbounded-by-plugin` the value MUST be `null` — a number there
 * would lie about the contract.
 */
export interface IPluginBudget {
	readonly semantics: IBudgetSemantics;
	readonly value: number | null;
}

export interface IPluginCostInput {
	readonly pluginId: string;
	readonly pluginName?: string | undefined;
	/** Number of catalogued skills applicable to this plugin. */
	readonly availableSkillsCount?: number | undefined;
	/** Compact ids used by the high/full operator report. */
	readonly availableSkillIds?: readonly string[] | undefined;
	readonly status:
		| 'unloaded'
		| 'loaded-hidden'
		| 'active-internal'
		| 'denied'
		| 'failed';
	readonly availableTools: readonly IToolSurfaceDescriptor[];
	readonly exposedTools: readonly IToolSurfaceDescriptor[];
	/** Runtime-measured MCP definition bytes, keyed by registration id. */
	readonly schemaBytesByRegistrationId?:
		| Readonly<Record<string, number>>
		| undefined;
	readonly budget?: IPluginBudget | undefined;
}

export interface IPluginCostSnapshot {
	readonly pluginId: string;
	readonly pluginName: string;
	readonly status: IPluginCostInput['status'];
	readonly availableToolsCount: number;
	readonly availableSkillsCount?: number;
	readonly availableToolIds?: readonly string[];
	readonly availableSkillIds?: readonly string[];
	readonly exposedToolsCount: number;
	readonly exposedSchemaBytesPerRequest: number;
	readonly estimatedSchemaTokensPerRequest: number;
	readonly percentageOfTotal: number;
	readonly budget: IPluginBudget;
	/** Skill bodies preloaded at session start. Always 0 unless the
	 * operator explicitly opts in via a future setting (q00009 deferred). */
	readonly skillBodiesPreloaded: number;
}

export interface ISurfaceCostReconciliation {
	readonly plugins: readonly IPluginCostSnapshot[];
	readonly exposedSchemaBytesPerRequest: number;
	readonly estimatedSchemaTokensPerRequest: number;
	/** Native / full-surface equivalent for the same preset. */
	readonly nativeEquivalentTokensPerRequest: number;
	readonly avoidedTokensPerRequest: number;
	readonly avoidedPercentage: number;
	readonly balanced: boolean;
	readonly reconciliationDeltaBytes: number;
}

export const EMPTY_BUDGET: IPluginBudget = {
	semantics: 'unbounded-by-plugin',
	value: null,
};

/**
 * Estimate schema bytes for one tool descriptor. Mirrors the canonical
 * `measureBootstrapBytes` projection in `surface/bootstrap.ts`: we
 * keep the same shape (name + toolId + summary) so the per-plugin
 * bytes are directly comparable to the bootstrap surface total.
 *
 * When the descriptor list is empty, return 0 bytes — not the 2-byte
 * `[]` JSON encoding — because the acceptance criterion (q00009 §8.1,
 * §14.1) is that an unloaded / hidden plugin contributes exactly 0 to
 * the per-request schema tax.
 */

const estimateDescriptorBytes = (descriptor: IToolSurfaceDescriptor): number =>
	Buffer.byteLength(
		JSON.stringify({
			name: descriptor.name,
			toolId: descriptor.toolId,
			summary: descriptor.summary,
		}),
		'utf8',
	);

const measureDescriptorsBytes = (
	descriptors: readonly IToolSurfaceDescriptor[],
	schemaBytesByRegistrationId?: Readonly<Record<string, number>>,
): number => {
	if (descriptors.length === 0) return 0;
	if (schemaBytesByRegistrationId !== undefined) {
		return descriptors.reduce(
			(sum, descriptor) =>
				sum +
				(schemaBytesByRegistrationId[descriptor.registrationId] ??
					estimateDescriptorBytes(descriptor)),
			0,
		);
	}
	return Buffer.byteLength(
		JSON.stringify(
			descriptors.map((descriptor) => ({
				name: descriptor.name,
				toolId: descriptor.toolId,
				summary: descriptor.summary,
			})),
		),
		'utf8',
	);
};

const bytesToTokens = (bytes: number): number =>
	bytes === 0 ? 0 : Math.ceil(bytes / 4);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Compute one plugin's snapshot. The exposed-side number is what
 * counts for the per-request schema tax; the available-side number
 * is shown as informational context (catalog vs surface).
 */
export const computePluginCostSnapshot = (
	input: IPluginCostInput,
	totalExposedBytes: number,
): IPluginCostSnapshot => {
	const exposedBytes = measureDescriptorsBytes(
		input.exposedTools,
		input.schemaBytesByRegistrationId,
	);
	const exposedTokens = bytesToTokens(exposedBytes);
	const percentage =
		totalExposedBytes > 0
			? round2((exposedBytes / totalExposedBytes) * 100)
			: 0;

	return {
		pluginId: input.pluginId,
		pluginName: input.pluginName ?? input.pluginId,
		status: input.status,
		availableToolsCount: input.availableTools.length,
		availableSkillsCount:
			input.availableSkillsCount ?? input.availableSkillIds?.length ?? 0,
		availableToolIds: input.availableTools.map((tool) => tool.toolId),
		availableSkillIds: input.availableSkillIds ?? [],
		exposedToolsCount: input.exposedTools.length,
		exposedSchemaBytesPerRequest: exposedBytes,
		estimatedSchemaTokensPerRequest: exposedTokens,
		percentageOfTotal: percentage,
		budget: input.budget ?? EMPTY_BUDGET,
		skillBodiesPreloaded: 0,
	};
};

/**
 * Compute the surface-wide reconciliation. Returns the full plugin
 * list plus the aggregate totals. `balanced` is `true` when the sum of
 * the per-plugin bytes equals the aggregate, within `epsilon`.
 *
 * `nativeEquivalentTokensPerRequest` is the cost the LLM would pay if
 * the catalog were published in `native` mode. Pass `0` when no
 * baseline measurement exists; the reconciliation still completes.
 */
export const reconcileSurfaceCost = (
	inputs: readonly IPluginCostInput[],
	options: {
		readonly nativeEquivalentTokensPerRequest?: number;
		readonly epsilonBytes?: number;
	} = {},
): ISurfaceCostReconciliation => {
	const epsilon = options.epsilonBytes ?? 0;

	const exposedTotalBytes = inputs.reduce((sum, input) => {
		return (
			sum +
			measureDescriptorsBytes(
				input.exposedTools,
				input.schemaBytesByRegistrationId,
			)
		);
	}, 0);

	const plugins = inputs.map((input) =>
		computePluginCostSnapshot(input, exposedTotalBytes),
	);

	const exposedTotalTokens = bytesToTokens(exposedTotalBytes);
	const nativeTokens = options.nativeEquivalentTokensPerRequest ?? 0;
	const avoided = Math.max(0, nativeTokens - exposedTotalTokens);
	const avoidedPct =
		nativeTokens > 0 ? round2((avoided / nativeTokens) * 100) : 0;

	const sumOfPlugins = plugins.reduce(
		(sum, p) => sum + p.exposedSchemaBytesPerRequest,
		0,
	);
	const delta = sumOfPlugins - exposedTotalBytes;

	return {
		plugins,
		exposedSchemaBytesPerRequest: exposedTotalBytes,
		estimatedSchemaTokensPerRequest: exposedTotalTokens,
		nativeEquivalentTokensPerRequest: nativeTokens,
		avoidedTokensPerRequest: avoided,
		avoidedPercentage: avoidedPct,
		balanced: Math.abs(delta) <= epsilon,
		reconciliationDeltaBytes: delta,
	};
};

/**
 * Convenience predicate: a hidden plugin must contribute ZERO to the
 * per-request schema tax. Acceptance criterion (q00009 §8.1, §14.1):
 *
 *   "A plugin that is available/loaded but has no schemas
 *    exposed to the LLM must contribute 0 to the recurring schema cost."
 */
export const hiddenPluginContributesZero = (
	snapshot: IPluginCostSnapshot,
): boolean =>
	snapshot.exposedSchemaBytesPerRequest === 0 &&
	snapshot.estimatedSchemaTokensPerRequest === 0;
