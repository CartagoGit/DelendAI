/**
 * startup-report/model.ts — q00009 / f00257.
 *
 * Immutable data class for the 5-level Startup Report. Owns:
 *
 *   - server identity (version, workspace, preset, surface mode)
 *   - the catalog roll-up (plugins / tools / skills / resources)
 *   - the per-plugin per-request cost reconciliation
 *   - lazy activation / eviction / routing knobs
 *   - warnings / config issues
 *
 * The model is the *only* thing the renderers see. They never reach
 * back into the registry, the metrics store, the file system or the
 * plugin graph. That separation is what lets us test the renderers
 * with deterministic snapshots and ship multiple output channels
 * (ansi, plain, JSON, host Output Channel) without duplicating
 * collection logic.
 */

import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';
import type { IConfigurationCenterSnapshot } from '../contracts/interfaces/configuration-center.interface';

import type {
	IPluginCostSnapshot,
	ISurfaceCostReconciliation,
} from './plugin-cost';
import type { IStartupReportLevel } from './level';

/** A single warning emitted by the operator-visible report. */
export interface IStartupReportWarning {
	readonly severity: 'info' | 'warning' | 'error';
	readonly code: string;
	readonly message: string;
	readonly source?: string | undefined;
}

export interface IStartupReportCatalogCounts {
	readonly pluginsConfigured: number;
	/** Number of plugin modules imported during assembly. */
	readonly pluginsLoaded?: number;
	readonly pluginsWarm: number;
	readonly pluginsFailed: number;
	readonly toolsAvailable: number;
	readonly toolsExposed: number;
	readonly skillsAvailable: number;
	readonly skillsBodiesPreloaded: number;
	readonly resourcesAvailable: number;
}

export interface IStartupReportServerIdentity {
	readonly version: string;
	readonly workspace: string;
	readonly preset: string;
	readonly surfaceMode: IMcpToolSurfaceMode;
	/**
	 * Why `surfaceMode` is what it is. The Startup Report is built once at
	 * boot, before any client has connected, so this can only describe the
	 * BOOT DEFAULT (an explicit override, or "managed pending the
	 * per-client capability check") — the mode actually served to a given
	 * client is decided later, at MCP handshake, by
	 * `decideSurfaceModeFromCapabilities` (see the `[surface]` stderr line
	 * on a real transition). AUD-C01: previously there was no `reason` at
	 * all here, only the mode, which read as a fixed fact rather than a
	 * default that adapts per client.
	 */
	readonly surfaceModeReason?: string | undefined;
	readonly startupReportLevel: IStartupReportLevel;
}

export interface IStartupReportManagedRuntime {
	readonly lazyActivation: boolean;
	/** Surface activation and module loading are separate dimensions. */
	readonly moduleLoading?: 'eager' | 'lazy';
	readonly internalRouting: boolean;
	readonly idleEvictionMs?: number | null;
	readonly maxWarmPlugins?: number | null;
	readonly listChangedRequired: boolean;
}

/** Native / full-surface equivalent. `null` when no baseline exists. */
export interface IStartupReportBaseline {
	readonly tokensPerRequest: number;
	readonly source: 'measured' | 'estimated' | 'unset';
}

export interface IStartupReportBudget {
	readonly name: string;
	readonly semantics:
		| 'dedicated'
		| 'shared'
		| 'inherited'
		| 'unbounded-by-plugin';
	readonly value: number | null;
	readonly unit: 'tokens' | 'bytes' | 'subagent-invocations' | 'unspecified';
}

/** Safe operator diagnostics; configuration is already redacted by the
 * configuration-center builder and plugin rows contain counts, not schemas. */
export interface IStartupReportDiagnostics {
	readonly configuration: IConfigurationCenterSnapshot;
}

/**
 * The full Startup Report. Immutable; built via {@link buildStartupReport}.
 */
export interface IStartupReport {
	readonly identity: IStartupReportServerIdentity;
	readonly catalog: IStartupReportCatalogCounts;
	readonly reconciliation: ISurfaceCostReconciliation;
	readonly runtime: IStartupReportManagedRuntime;
	readonly baseline: IStartupReportBaseline;
	readonly budgets: readonly IStartupReportBudget[];
	readonly diagnostics?: IStartupReportDiagnostics | undefined;
	readonly warnings: readonly IStartupReportWarning[];
	readonly generatedAtIso: string;
}

/** Inputs required to build a startup report. */
export interface IStartupReportInput {
	readonly identity: Omit<IStartupReportServerIdentity, 'startupReportLevel'>;
	readonly catalog: IStartupReportCatalogCounts;
	readonly pluginCosts: readonly Omit<
		IPluginCostSnapshot,
		'percentageOfTotal' | 'skillBodiesPreloaded'
	>[];
	readonly runtime: IStartupReportManagedRuntime;
	readonly baseline: IStartupReportBaseline;
	readonly budgets?: readonly IStartupReportBudget[];
	readonly diagnostics?: IStartupReportDiagnostics | undefined;
	readonly warnings?: readonly IStartupReportWarning[];
	/** Injected clock; defaults to `new Date()`. */
	readonly now?: () => Date;
}

const ensureBudgetsArray = (
	budgets: readonly IStartupReportBudget[] | undefined,
): readonly IStartupReportBudget[] => budgets ?? [];

/**
 * Build a Startup Report. Pure: takes inputs, returns an immutable
 * object. The clock is injected (default = `new Date`) so tests can
 * produce deterministic snapshots.
 */
export const buildStartupReport = (
	input: IStartupReportInput,
	level: IStartupReportLevel,
): IStartupReport => {
	const now = input.now ?? ((): Date => new Date());
	const plugins = input.pluginCosts.map((snap) => ({
		pluginId: snap.pluginId,
		pluginName: snap.pluginName,
		status: snap.status,
		availableToolsCount: snap.availableToolsCount,
		availableSkillsCount: snap.availableSkillsCount ?? 0,
		availableToolIds: snap.availableToolIds ?? [],
		availableSkillIds: snap.availableSkillIds ?? [],
		exposedToolsCount: snap.exposedToolsCount,
		exposedSchemaBytesPerRequest: snap.exposedSchemaBytesPerRequest,
		estimatedSchemaTokensPerRequest: snap.estimatedSchemaTokensPerRequest,
		budget: snap.budget,
		skillBodiesPreloaded: 0 as const,
	}));

	const totalBytes = plugins.reduce(
		(s, p) => s + p.exposedSchemaBytesPerRequest,
		0,
	);

	const reconciled: ISurfaceCostReconciliation = {
		plugins: plugins.map((p) => ({
			...p,
			percentageOfTotal:
				totalBytes > 0
					? Math.round(
							(p.exposedSchemaBytesPerRequest / totalBytes) *
								10000,
						) / 100
					: 0,
		})),
		exposedSchemaBytesPerRequest: totalBytes,
		estimatedSchemaTokensPerRequest:
			totalBytes === 0 ? 0 : Math.ceil(totalBytes / 4),
		nativeEquivalentTokensPerRequest: input.baseline.tokensPerRequest,
		avoidedTokensPerRequest: Math.max(
			0,
			input.baseline.tokensPerRequest -
				(totalBytes === 0 ? 0 : Math.ceil(totalBytes / 4)),
		),
		avoidedPercentage:
			input.baseline.tokensPerRequest > 0
				? Math.round(
						(Math.max(
							0,
							input.baseline.tokensPerRequest -
								(totalBytes === 0
									? 0
									: Math.ceil(totalBytes / 4)),
						) /
							input.baseline.tokensPerRequest) *
							10000,
					) / 100
				: 0,
		balanced: true,
		reconciliationDeltaBytes: 0,
	};

	return {
		identity: {
			...input.identity,
			startupReportLevel: level,
		},
		catalog: input.catalog,
		reconciliation: reconciled,
		runtime: input.runtime,
		baseline: input.baseline,
		budgets: ensureBudgetsArray(input.budgets),
		...(input.diagnostics === undefined
			? {}
			: { diagnostics: input.diagnostics }),
		warnings: input.warnings ?? [],
		generatedAtIso: now().toISOString(),
	};
};

/**
 * Reconcile the explicit `toolsExposed` from the catalog with the sum
 * of per-plugin exposed tools. Returns the delta; a regression lint
 * (q00009 c00150) can fail CI when this exceeds zero.
 */
export const reconcileCatalogVsPlugins = (
	report: IStartupReport,
): {
	readonly delta: number;
	readonly balanced: boolean;
} => {
	const sum = report.reconciliation.plugins.reduce(
		(s, p) => s + p.exposedToolsCount,
		0,
	);
	const delta = report.catalog.toolsExposed - sum;
	return { delta, balanced: delta === 0 };
};
