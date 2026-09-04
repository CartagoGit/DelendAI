import { describe, expect, it } from 'vitest';

import {
	buildStartupReport,
	reconcileCatalogVsPlugins,
} from '@delendai/core/lib/startup-report/model';
import type {
	IStartupReportBudget,
	IStartupReportCatalogCounts,
	IStartupReportInput,
	IStartupReportManagedRuntime,
	IStartupReportBaseline,
	IStartupReportWarning,
} from '@delendai/core/lib/startup-report/model';
import {
	computePluginCostSnapshot,
	type IPluginCostInput,
} from '@delendai/core/lib/startup-report/plugin-cost';

const COUNTS: IStartupReportCatalogCounts = {
	pluginsConfigured: 42,
	pluginsWarm: 6,
	pluginsFailed: 0,
	toolsAvailable: 199,
	toolsExposed: 4,
	skillsAvailable: 37,
	skillsBodiesPreloaded: 0,
	resourcesAvailable: 12,
};

const RUNTIME: IStartupReportManagedRuntime = {
	lazyActivation: true,
	internalRouting: true,
	idleEvictionMs: 5 * 60_000,
	maxWarmPlugins: 8,
	listChangedRequired: false,
};

const BASELINE: IStartupReportBaseline = {
	tokensPerRequest: 51168,
	source: 'estimated',
};

const BUDGETS: readonly IStartupReportBudget[] = [
	{ name: 'core', semantics: 'shared', value: null, unit: 'unspecified' },
	{ name: 'git', semantics: 'inherited', value: 8000, unit: 'tokens' },
	{ name: 'proposals', semantics: 'dedicated', value: 18000, unit: 'tokens' },
	{
		name: 'agent-orchestrator',
		semantics: 'dedicated',
		value: 50_000,
		unit: 'subagent-invocations',
	},
];

const WARNINGS: readonly IStartupReportWarning[] = [
	{
		severity: 'warning',
		code: 'budget-near-threshold',
		message: 'proposals budget at 85% of cap',
		source: 'proposals',
	},
];

const PLUGIN_INPUTS: readonly IPluginCostInput[] = [
	{
		pluginId: 'core',
		pluginName: 'core',
		status: 'active-internal',
		availableTools: [],
		exposedTools: [
			{
				registrationId: 'overview',
				name: 'delendai_overview',
				toolId: 'overview',
				summary: 'orient',
			},
			{
				registrationId: 'tool_search',
				name: 'delendai_tool_search',
				toolId: 'tool_search',
				summary: 'search',
			},
			{
				registrationId: 'vertex',
				name: 'delendai_vertex',
				toolId: 'vertex',
				summary: 'route',
			},
			{
				registrationId: 'status',
				name: 'delendai_status',
				toolId: 'status',
				summary: 'health',
			},
		],
		budget: { semantics: 'shared', value: null },
	},
	{
		pluginId: 'git',
		pluginName: 'git',
		status: 'loaded-hidden',
		availableTools: Array.from({ length: 10 }, (_, i) => ({
			registrationId: `g${i}`,
			name: `delendai_git_${i}`,
			toolId: `git_${i}`,
			summary: `git tool ${i}`,
		})),
		exposedTools: [],
		budget: { semantics: 'inherited', value: 8000 },
	},
	{
		pluginId: 'proposals',
		pluginName: 'proposals',
		status: 'loaded-hidden',
		availableTools: Array.from({ length: 34 }, (_, i) => ({
			registrationId: `p${i}`,
			name: `delendai_proposals_${i}`,
			toolId: `proposals_${i}`,
			summary: `proposal tool ${i}`,
		})),
		exposedTools: [],
		budget: { semantics: 'dedicated', value: 18000 },
	},
];

const baseInput = (): IStartupReportInput => {
	// Pre-compute per-plugin cost so the model receives realistic
	// bytes (the test would be vacuous otherwise — percentages would
	// always be 0 because we passed 0 bytes upstream).
	const totalBytes = PLUGIN_INPUTS.reduce((sum, p) => {
		const snap = computePluginCostSnapshot(p, 0);
		return sum + snap.exposedSchemaBytesPerRequest;
	}, 0);
	return {
		identity: {
			version: '0.x.x',
			workspace: '/workspace/my-project',
			preset: 'swarm',
			surfaceMode: 'managed',
		},
		catalog: COUNTS,
		pluginCosts: PLUGIN_INPUTS.map((p) => {
			const snap = computePluginCostSnapshot(p, totalBytes);
			return {
				pluginId: snap.pluginId,
				pluginName: snap.pluginName,
				status: snap.status,
				availableToolsCount: snap.availableToolsCount,
				exposedToolsCount: snap.exposedToolsCount,
				exposedSchemaBytesPerRequest: snap.exposedSchemaBytesPerRequest,
				estimatedSchemaTokensPerRequest:
					snap.estimatedSchemaTokensPerRequest,
				budget: snap.budget,
			};
		}),
		runtime: RUNTIME,
		baseline: BASELINE,
		budgets: BUDGETS,
		warnings: WARNINGS,
	};
};

describe('startup-report/model (q00009 / f00257)', () => {
	describe('buildStartupReport', () => {
		it('produces an immutable report with the requested level', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			expect(report.identity.startupReportLevel).toBe('medium');
			expect(report.identity.surfaceMode).toBe('managed');
		});

		it('stamps `generatedAtIso` from the injected clock', () => {
			const fixed = new Date('2026-08-26T12:58:40.228Z');
			const input = { ...baseInput(), now: () => fixed };
			const report = buildStartupReport(input, 'compact');
			expect(report.generatedAtIso).toBe('2026-08-26T12:58:40.228Z');
		});

		it('reconciles hidden plugins to 0 in the schema tax', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const core = report.reconciliation.plugins.find(
				(p) => p.pluginId === 'core',
			);
			const git = report.reconciliation.plugins.find(
				(p) => p.pluginId === 'git',
			);
			const proposals = report.reconciliation.plugins.find(
				(p) => p.pluginId === 'proposals',
			);
			expect(core?.exposedSchemaBytesPerRequest).toBeGreaterThan(0);
			expect(git?.exposedSchemaBytesPerRequest).toBe(0);
			expect(proposals?.exposedSchemaBytesPerRequest).toBe(0);
		});

		it('attributes 100% of the exposed tax to the only exposing plugin', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const core = report.reconciliation.plugins.find(
				(p) => p.pluginId === 'core',
			);
			expect(core?.percentageOfTotal).toBe(100);
		});

		it('sums the per-plugin tax to the surface total', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const sum = report.reconciliation.plugins.reduce(
				(s, p) => s + p.exposedSchemaBytesPerRequest,
				0,
			);
			expect(sum).toBe(
				report.reconciliation.exposedSchemaBytesPerRequest,
			);
		});

		it('computes avoided tokens vs the native baseline', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			expect(report.baseline.tokensPerRequest).toBe(51168);
			expect(report.reconciliation.nativeEquivalentTokensPerRequest).toBe(
				51168,
			);
			expect(
				report.reconciliation.avoidedTokensPerRequest,
			).toBeGreaterThan(50000);
			expect(report.reconciliation.avoidedPercentage).toBeGreaterThan(95);
		});

		it('preserves warnings and budgets arrays verbatim', () => {
			const report = buildStartupReport(baseInput(), 'high');
			expect(report.warnings).toEqual(WARNINGS);
			expect(report.budgets).toEqual(BUDGETS);
		});

		it('keeps the managed-runtime knobs intact', () => {
			const report = buildStartupReport(baseInput(), 'high');
			expect(report.runtime.lazyActivation).toBe(true);
			expect(report.runtime.internalRouting).toBe(true);
			expect(report.runtime.listChangedRequired).toBe(false);
			expect(report.runtime.idleEvictionMs).toBe(5 * 60_000);
		});
	});

	describe('reconcileCatalogVsPlugins', () => {
		it('returns balanced=true when catalog `toolsExposed` matches the sum of per-plugin exposed tools', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const r = reconcileCatalogVsPlugins(report);
			expect(r.balanced).toBe(true);
			expect(r.delta).toBe(0);
		});

		it('returns a positive delta when the catalog overcounts', () => {
			const input = baseInput();
			const tampered: IStartupReportInput = {
				...input,
				catalog: { ...input.catalog, toolsExposed: 99 },
			};
			const report = buildStartupReport(tampered, 'medium');
			const r = reconcileCatalogVsPlugins(report);
			expect(r.balanced).toBe(false);
			expect(r.delta).toBe(95); // 99 - 4
		});
	});
});
