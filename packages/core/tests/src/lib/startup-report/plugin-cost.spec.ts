import { describe, expect, it } from 'vitest';

import {
	EMPTY_BUDGET,
	computePluginCostSnapshot,
	hiddenPluginContributesZero,
	reconcileSurfaceCost,
} from '@mcp-vertex/core/lib/startup-report/plugin-cost';
import type { IToolSurfaceDescriptor } from '@mcp-vertex/core/lib/contracts/interfaces/tool-surface.interface';

const tool = (
	overrides: Partial<IToolSurfaceDescriptor> = {},
): IToolSurfaceDescriptor => ({
	registrationId: 'reg',
	name: 'mcp-vertex_test',
	toolId: 'test',
	summary: 'desc',
	...overrides,
});

const HIDDEN_PLUGIN_AVAILABLE: IToolSurfaceDescriptor[] = [
	tool({ registrationId: 'h1', toolId: 'h1', name: 'mcp-vertex_hidden_1' }),
	tool({ registrationId: 'h2', toolId: 'h2', name: 'mcp-vertex_hidden_2' }),
	tool({ registrationId: 'h3', toolId: 'h3', name: 'mcp-vertex_hidden_3' }),
];

const BOOTSTRAP_TOOLS: IToolSurfaceDescriptor[] = [
	tool({
		registrationId: 'overview',
		toolId: 'overview',
		name: 'mcp-vertex_overview',
		summary: 'orient',
	}),
	tool({
		registrationId: 'tool_search',
		toolId: 'tool_search',
		name: 'mcp-vertex_tool_search',
		summary: 'search',
	}),
	tool({
		registrationId: 'vertex',
		toolId: 'vertex',
		name: 'mcp-vertex_vertex',
		summary: 'route',
	}),
];

const NATIVE_FULL_SURFACE: IToolSurfaceDescriptor[] = Array.from(
	{ length: 199 },
	(_, i) =>
		tool({
			registrationId: `r${i}`,
			toolId: `t${i}`,
			name: `mcp-vertex_native_t${i}`,
			summary: `native tool ${i}`,
		}),
);

describe('startup-report/plugin-cost (q00009 / f00260)', () => {
	describe('computePluginCostSnapshot', () => {
		it('contributes zero when no tools are exposed (hidden plugin)', () => {
			const snap = computePluginCostSnapshot(
				{
					pluginId: 'core',
					pluginName: 'core',
					status: 'loaded-hidden',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
				0,
			);
			expect(snap.exposedSchemaBytesPerRequest).toBe(0);
			expect(snap.estimatedSchemaTokensPerRequest).toBe(0);
			expect(snap.exposedToolsCount).toBe(0);
			expect(snap.availableToolsCount).toBe(3);
			expect(hiddenPluginContributesZero(snap)).toBe(true);
		});

		it('contributes positive bytes when at least one tool is exposed', () => {
			const snap = computePluginCostSnapshot(
				{
					pluginId: 'core',
					status: 'active-internal',
					availableTools: BOOTSTRAP_TOOLS,
					exposedTools: BOOTSTRAP_TOOLS,
				},
				JSON.stringify(BOOTSTRAP_TOOLS).length,
			);
			expect(snap.exposedSchemaBytesPerRequest).toBeGreaterThan(0);
			expect(snap.estimatedSchemaTokensPerRequest).toBeGreaterThan(0);
			expect(snap.exposedToolsCount).toBe(3);
			expect(snap.budget).toEqual(EMPTY_BUDGET);
		});

		it('preserves explicit budget semantics', () => {
			const snap = computePluginCostSnapshot(
				{
					pluginId: 'git',
					status: 'active-internal',
					availableTools: [],
					exposedTools: [],
					budget: { semantics: 'inherited', value: 8000 },
				},
				0,
			);
			expect(snap.budget).toEqual({
				semantics: 'inherited',
				value: 8000,
			});
		});
	});

	describe('reconcileSurfaceCost', () => {
		it('sum of plugins equals surface total when reconciled (acceptance §14.4)', () => {
			const result = reconcileSurfaceCost([
				{
					pluginId: 'core',
					status: 'active-internal',
					availableTools: BOOTSTRAP_TOOLS,
					exposedTools: BOOTSTRAP_TOOLS,
					budget: { semantics: 'shared', value: null },
				},
				{
					pluginId: 'git',
					status: 'loaded-hidden',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
				{
					pluginId: 'proposals',
					status: 'loaded-hidden',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
			]);
			const sumOfPlugins = result.plugins.reduce(
				(s, p) => s + p.exposedSchemaBytesPerRequest,
				0,
			);
			expect(sumOfPlugins).toBe(result.exposedSchemaBytesPerRequest);
			expect(result.balanced).toBe(true);
			expect(result.reconciliationDeltaBytes).toBe(0);
		});

		it('hidden plugins contribute zero to the schema tax', () => {
			const result = reconcileSurfaceCost([
				{
					pluginId: 'core',
					status: 'active-internal',
					availableTools: BOOTSTRAP_TOOLS,
					exposedTools: BOOTSTRAP_TOOLS,
				},
				{
					pluginId: 'git',
					status: 'loaded-hidden',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
				{
					pluginId: 'proposals',
					status: 'loaded-hidden',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
			]);
			const gitSnap = result.plugins.find((p) => p.pluginId === 'git');
			const proposalsSnap = result.plugins.find(
				(p) => p.pluginId === 'proposals',
			);
			expect(gitSnap && hiddenPluginContributesZero(gitSnap)).toBe(true);
			expect(
				proposalsSnap && hiddenPluginContributesZero(proposalsSnap),
			).toBe(true);
		});

		it('emits `balanced=true` because the function is self-consistent by construction', () => {
			// The reconcile function reads `exposedTools.length` from the
			// same source it sums over, so the aggregate cannot drift
			// from the per-plugin total. The regression gate is the lint
			// (q00009 c00150) which compares the function's output
			// against an independent measurement, NOT a self-check on
			// tampered objects.
			const inputs = [
				{
					pluginId: 'core',
					status: 'active-internal' as const,
					availableTools: BOOTSTRAP_TOOLS,
					exposedTools: BOOTSTRAP_TOOLS,
				},
				{
					pluginId: 'git',
					status: 'loaded-hidden' as const,
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: [],
				},
			];
			const result = reconcileSurfaceCost(inputs);
			expect(result.balanced).toBe(true);
			expect(result.reconciliationDeltaBytes).toBe(0);

			// The structural invariant: sum of per-plugin bytes equals
			// the surface total. Any future drift in the implementation
			// would break this assertion.
			const sumOfPlugins = result.plugins.reduce(
				(s, p) => s + p.exposedSchemaBytesPerRequest,
				0,
			);
			expect(sumOfPlugins).toBe(result.exposedSchemaBytesPerRequest);
		});

		it('computes avoided tokens vs a native baseline', () => {
			const result = reconcileSurfaceCost(
				[
					{
						pluginId: 'core',
						status: 'active-internal',
						availableTools: BOOTSTRAP_TOOLS,
						exposedTools: BOOTSTRAP_TOOLS,
					},
				],
				{
					nativeEquivalentTokensPerRequest: 51168,
				},
			);
			expect(result.nativeEquivalentTokensPerRequest).toBe(51168);
			expect(result.avoidedTokensPerRequest).toBe(
				51168 - result.estimatedSchemaTokensPerRequest,
			);
			expect(result.avoidedPercentage).toBeGreaterThan(90);
			expect(result.balanced).toBe(true);
		});

		it('handles an empty catalog (no plugins loaded)', () => {
			const result = reconcileSurfaceCost([]);
			expect(result.exposedSchemaBytesPerRequest).toBe(0);
			expect(result.estimatedSchemaTokensPerRequest).toBe(0);
			expect(result.plugins).toEqual([]);
			expect(result.balanced).toBe(true);
		});

		it('reproduces the spec example: native 51,168 tokens → bootstrap ~1,420', () => {
			const result = reconcileSurfaceCost(
				[
					{
						pluginId: 'core',
						pluginName: 'core',
						status: 'active-internal',
						availableTools: BOOTSTRAP_TOOLS,
						exposedTools: BOOTSTRAP_TOOLS,
						budget: { semantics: 'shared', value: null },
					},
				],
				{ nativeEquivalentTokensPerRequest: 51168 },
			);
			expect(result.estimatedSchemaTokensPerRequest).toBeGreaterThan(0);
			expect(result.estimatedSchemaTokensPerRequest).toBeLessThan(2000);
			expect(result.avoidedPercentage).toBeGreaterThan(95);
		});

		it('keeps the catalog count for the full 199 native surface as information', () => {
			const result = reconcileSurfaceCost(
				[
					{
						pluginId: 'all',
						status: 'active-internal',
						availableTools: NATIVE_FULL_SURFACE,
						exposedTools: NATIVE_FULL_SURFACE,
					},
				],
				{ nativeEquivalentTokensPerRequest: 0 },
			);
			// Without a baseline, we cannot claim avoided tokens; the
			// field stays at 0 so the UI shows "n/a". The math still
			// reports the actual exposed bytes/tokens for the catalog.
			expect(result.avoidedTokensPerRequest).toBe(0);
			expect(result.avoidedPercentage).toBe(0);
			expect(result.exposedSchemaBytesPerRequest).toBeGreaterThan(0);
			expect(result.plugins[0]?.availableToolsCount).toBe(199);
		});

		it('falls back to descriptor estimates for lazy tools missing runtime schemas', () => {
			const result = reconcileSurfaceCost([
				{
					pluginId: 'core',
					status: 'active-internal',
					availableTools: BOOTSTRAP_TOOLS,
					exposedTools: BOOTSTRAP_TOOLS,
					schemaBytesByRegistrationId: { overview: 500 },
				},
				{
					pluginId: 'lazy-plugin',
					status: 'unloaded',
					availableTools: HIDDEN_PLUGIN_AVAILABLE,
					exposedTools: HIDDEN_PLUGIN_AVAILABLE,
					schemaBytesByRegistrationId: { overview: 500 },
				},
			]);
			expect(
				result.plugins[1]?.exposedSchemaBytesPerRequest,
			).toBeGreaterThan(0);
		});
	});
});
