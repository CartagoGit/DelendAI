/**
 * Shared types for the TokenBudgetRegistry (`f00186`).
 *
 * The registry is the single API consumed by CI, dashboard, docs, tests
 * and CLI to measure, validate and report token consumption across MCP
 * surfaces (`schema`, `runtime`, `native`) and detail levels (`compact`,
 * `normal`, `full`).
 *
 * These types are pure: no runtime dependencies, importable from any
 * plugin or tool without pulling in heavy infrastructure.
 */

/** Surfaces a token measurement can refer to. */
export type TokenSurface =
	| 'schema'
	| 'runtime'
	| 'native'
	| 'compact'
	| 'normal'
	| 'full';

/** Per-surface measurement shape used by the dashboard (c00135). */
export type Surface = 'adaptive' | 'native';

export interface IPerSurfaceMeasurement {
	readonly adaptive?: number;
	readonly native?: number;
}

export interface IBudgetCeiling {
	readonly hard: number;
	readonly warning: number;
	readonly releaseRelativePercent: number;
}

export interface IBudgetForSurface extends IBudgetCeiling {
	readonly marginalPluginHard?: number;
	readonly marginalPluginWarning?: number;
}

export interface ITokenMeasurement {
	readonly surface: TokenSurface;
	readonly bytes: number;
	readonly tokens: number;
	readonly sourceId: string;
	readonly capturedAt: string;
}

export interface ITokenReportRow {
	readonly surface: TokenSurface;
	readonly bytes: number;
	readonly tokens: number;
	readonly budget?: number;
	readonly status: 'ok' | 'warning' | 'breach';
}

export interface ITokenReport {
	readonly toolId: string;
	readonly measurements: readonly ITokenReportRow[];
	readonly documentedDeficits: readonly {
		readonly surface: TokenSurface;
		readonly ratio: number;
		readonly bytes: number;
		readonly budget: number;
	}[];
	readonly generatedAt: string;
}

export interface IBudgetSource {
	readonly id: string;
	readonly measure: (
		surface: TokenSurface,
		toolId: string,
	) => Promise<number> | number;
}

export class TokenBudgetBreachError extends Error {
	readonly surface: TokenSurface;
	readonly toolId: string;
	readonly measured: number;
	readonly budget: number;
	readonly source: string;
	constructor(args: {
		surface: TokenSurface;
		toolId: string;
		measured: number;
		budget: number;
		source: string;
	}) {
		super(
			`token budget breach: tool=${args.toolId} surface=${args.surface} ` +
				`measured=${args.measured}B budget=${args.budget}B source=${args.source}`,
		);
		this.name = 'TokenBudgetBreachError';
		this.surface = args.surface;
		this.toolId = args.toolId;
		this.measured = args.measured;
		this.budget = args.budget;
		this.source = args.source;
	}
}
