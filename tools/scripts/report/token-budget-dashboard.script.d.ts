#!/usr/bin/env bun
import {
	type IToolBreakdownRow,
	type IToolOwnerMetrics,
} from './token-budget-report-lib';
import { type ITokenizerModelEstimate } from './tokenizer-real.script';
interface IPresetDashboardRow {
	readonly presetId: string;
	readonly title: string;
	/** Surface used to collect the measurement, not the default runtime. */
	readonly surfaceMode: 'native' | 'adaptive';
	/** Surface used by ordinary DelendAI hosts for this measurement. */
	readonly runtimeSurface: 'managed';
	readonly source: 'tokens-gate' | 'dynamic-client';
	readonly pluginCount: number;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly maxPluginBytes: number;
	readonly overviewCompactBytes: number | null;
	readonly roundContextBytes: number | null;
	readonly loadErrors: readonly string[];
	readonly ownerRows: readonly IToolOwnerMetrics[];
	readonly toolBreakdowns: readonly IToolBreakdownRow[];
	readonly tokenizerEstimates: readonly ITokenizerModelEstimate[];
}
export declare const DASHBOARD_SURFACES: readonly [
	{
		readonly surfaceMode: 'native';
		readonly runtimeSurface: 'managed';
		readonly source: 'tokens-gate';
		readonly clientInfo: undefined;
		readonly capabilities: undefined;
	},
	{
		readonly surfaceMode: 'adaptive';
		readonly runtimeSurface: 'managed';
		readonly source: 'dynamic-client';
		readonly clientInfo: {
			version: string;
			websiteUrl?: string | undefined;
			description?: string | undefined;
			icons?:
				| {
						src: string;
						mimeType?: string | undefined;
						sizes?: string[] | undefined;
						theme?: 'dark' | 'light' | undefined;
				  }[]
				| undefined;
			name: string;
			title?: string | undefined;
		};
		readonly capabilities: {
			experimental?:
				| {
						[x: string]: object;
				  }
				| undefined;
			sampling?:
				| {
						context?: object | undefined;
						tools?: object | undefined;
				  }
				| undefined;
			elicitation?:
				| {
						[x: string]: unknown;
						form?:
							| {
									[x: string]: unknown;
									applyDefaults?: boolean | undefined;
							  }
							| undefined;
						url?: object | undefined;
				  }
				| undefined;
			roots?:
				| {
						listChanged?: boolean | undefined;
				  }
				| undefined;
			tasks?:
				| {
						[x: string]: unknown;
						list?: object | undefined;
						cancel?: object | undefined;
						requests?:
							| {
									[x: string]: unknown;
									sampling?:
										| {
												[x: string]: unknown;
												createMessage?:
													| object
													| undefined;
										  }
										| undefined;
									elicitation?:
										| {
												[x: string]: unknown;
												create?: object | undefined;
										  }
										| undefined;
							  }
							| undefined;
				  }
				| undefined;
			extensions?:
				| {
						[x: string]: object;
				  }
				| undefined;
		};
	},
];
export declare const TOKEN_BUDGET_DASHBOARD_PATH: readonly [
	'docs',
	'delendai',
	'TOKEN-BUDGETS.md',
];
export declare const measurePresetDashboard: (
	workspace: string,
	presetId: string,
	measurement: (typeof DASHBOARD_SURFACES)[number],
) => Promise<IPresetDashboardRow>;
/**
 * c00135 — Per-surface columns. Pairs the `native` and `adaptive` rows of
 * the same preset side-by-side so a reader can compare without scanning
 * the dual rows of the main table. `deficits` are reported per surface,
 * never mixed.
 */
export interface IPerSurfaceColumn {
	readonly presetId: string;
	readonly adaptiveBytes: number | null;
	readonly adaptiveStatus: 'ok' | 'warning' | 'breach' | 'n/a';
	readonly nativeBytes: number | null;
	readonly nativeStatus: 'ok' | 'warning' | 'breach' | 'n/a';
	readonly adaptiveDeficit: string | null;
	readonly nativeDeficit: string | null;
}
export declare const buildPerSurfaceColumns: (
	presetRows: readonly IPresetDashboardRow[],
) => readonly IPerSurfaceColumn[];
export declare const buildTokenBudgetDashboardMarkdown: (_input?: {
	readonly generatedAt?: string;
}) => Promise<string>;
export declare const generateTokenBudgetDashboard: () => Promise<{
	readonly markdown: string;
	readonly outputPath: string;
}>;
export {};
