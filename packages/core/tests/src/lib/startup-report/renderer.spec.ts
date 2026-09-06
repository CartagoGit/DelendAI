import { describe, expect, it } from 'vitest';

import type { IStartupReportInput } from '@delendai/core/lib/startup-report/model';
import { buildStartupReport } from '@delendai/core/lib/startup-report/model';
import {
	computePluginCostSnapshot,
	type IPluginCostInput,
} from '@delendai/core/lib/startup-report/plugin-cost';
import {
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from '@delendai/core/lib/startup-report/renderer';

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
				name: 'delendai_compact_router',
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
		catalog: {
			pluginsConfigured: 42,
			pluginsWarm: 6,
			pluginsFailed: 0,
			toolsAvailable: 199,
			toolsExposed: 4,
			skillsAvailable: 37,
			skillsBodiesPreloaded: 0,
			resourcesAvailable: 12,
		},
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
		runtime: {
			lazyActivation: true,
			internalRouting: true,
			idleEvictionMs: 5 * 60_000,
			maxWarmPlugins: 8,
			listChangedRequired: false,
		},
		baseline: { tokensPerRequest: 51168, source: 'estimated' },
		diagnostics: {
			configuration: {
				config: { token: '[REDACTED]' },
				configSchema: {},
				redactions: 1,
				plugins: [
					{
						id: 'git',
						origin: 'bundled',
						active: false,
						source: 'preset',
						options: {},
						schemaStatus: 'unavailable',
						permissions: ['git-read'],
						dependencies: ['core'],
						capabilities: {
							tools: 10,
							prompts: 0,
							resources: 1,
							knowledge: 0,
							skills: 1,
						},
					},
				],
				artifacts: [
					{
						id: 'git-orientation',
						kind: 'skill',
						owner: { id: 'git', origin: 'bundled' },
					},
				],
				unavailableArtifactKinds: ['agent'],
			},
		},
		budgets: [
			{
				name: 'core',
				semantics: 'shared',
				value: null,
				unit: 'unspecified',
			},
			{
				name: 'git',
				semantics: 'inherited',
				value: 8000,
				unit: 'tokens',
			},
			{
				name: 'proposals',
				semantics: 'dedicated',
				value: 18000,
				unit: 'tokens',
			},
		],
		warnings: [
			{
				severity: 'warning',
				code: 'budget-near-threshold',
				message: 'proposals budget at 85% of cap',
				source: 'proposals',
			},
		],
	};
};

describe('startup-report/renderer (q00009 / f00258)', () => {
	describe('shouldUseAnsiColors', () => {
		it('returns false when NO_COLOR is set', () => {
			expect(shouldUseAnsiColors({ NO_COLOR: '1' })).toBe(false);
		});

		it('returns true when FORCE_COLOR=1', () => {
			expect(shouldUseAnsiColors({ FORCE_COLOR: '1' })).toBe(true);
		});

		it('returns true when DELENDAI_COLOR=always', () => {
			expect(shouldUseAnsiColors({ DELENDAI_COLOR: 'always' })).toBe(
				true,
			);
		});

		it('returns false when DELENDAI_COLOR=never', () => {
			expect(shouldUseAnsiColors({ DELENDAI_COLOR: 'never' })).toBe(
				false,
			);
		});

		it('returns false by default when stderr is not a TTY', () => {
			expect(shouldUseAnsiColors({})).toBe(false);
		});
	});

	describe('renderStartupReportPlain', () => {
		it('returns the empty string when level is off', () => {
			const report = buildStartupReport(baseInput(), 'off');
			expect(renderStartupReportPlain(report)).toBe('');
		});

		it('includes the plugin loading lists for `compact`', () => {
			const report = buildStartupReport(baseInput(), 'compact');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('Plugin loading');
			expect(out).toContain('loaded at startup (3)');
			expect(out).toContain('lazy loaded on demand (0)');
		});

		it('lists loaded plugins without exposing per-plugin cost for `medium`', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('Plugin loading');
			expect(out).toContain('loaded at startup (3)');
			expect(out).toContain(
				'loaded at startup (3): core, git, proposals',
			);
			expect(out).toContain('lazy loaded on demand (0): none');
			expect(out).not.toContain('    - ');
			expect(out).not.toContain(
				'plugin                 status    available  visible  schemas  tokens  budget',
			);
		});

		it('explains each visible medium-level section', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const out = renderStartupReportPlain(report);
			expect(out).toContain(
				'What is running, which surface is exposed, and how tools are loaded.',
			);
			expect(out).toContain(
				'The skills and resources that can be requested when needed.',
			);
			expect(out).toContain(
				'The schema tokens sent to the model for the visible tool surface.',
			);
			expect(out).toContain(
				'Plugins loaded now and plugins waiting for their first use.',
			);
			expect(out).toContain(
				'Runtime policies for lazy activation, eviction, and MCP surface refreshes.',
			);
		});

		it('marks (default) next to the medium level', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('medium (default)');
		});

		it('does NOT mark (default) for `high`', () => {
			const report = buildStartupReport(baseInput(), 'high');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('report         high');
			expect(out).not.toContain('high (default)');
		});

		it('adds plugin detail at `high` and `full`', () => {
			const report = buildStartupReport(baseInput(), 'high');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('Plugins (detail)');
		});

		it('adds the configuration snapshot at `full`', () => {
			const report = buildStartupReport(baseInput(), 'full');
			const out = renderStartupReportPlain(report);
			expect(out).toContain('Configuration (sanitised)');
			expect(out).toContain('baseline.tokens/request');
			expect(out).toContain('redactions                1');
			expect(out).toContain('permissions=git-read');
			expect(out).toContain(
				'capabilities=tools:10,prompts:0,resources:1,knowledge:0,skills:1',
			);
			expect(out).toContain('dependencies=core');
			expect(out).toContain('"token":"[REDACTED]"');
		});

		it('never emits ANSI codes', () => {
			const report = buildStartupReport(baseInput(), 'full');
			const out = renderStartupReportPlain(report);
			expect(out).not.toContain('\u001B[');
		});

		it('does not duplicate the title — single `DelendAI ready`', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const out = renderStartupReportPlain(report);
			const occurrences = out.split('DelendAI ready').length - 1;
			expect(occurrences).toBe(1);
		});
	});

	describe('renderStartupReportAnsi', () => {
		it('emits ANSI codes only when the channel opts in', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const plain = renderStartupReportAnsi(report, {
				DELENDAI_COLOR: 'never',
			});
			expect(plain).not.toContain('\u001B[');
			const colour = renderStartupReportAnsi(report, {
				DELENDAI_COLOR: 'always',
			});
			expect(colour).toContain('\u001B[');
			expect(colour).toContain('\u001B[32m=== Server summary ===');
			expect(colour).toContain(
				'\u001B[34m=== Available capabilities ===',
			);
			expect(colour).toContain(
				'\u001B[35m=== Context cost per request ===',
			);
		});

		it('keeps the same content shape as the plain renderer when colour is forced off', () => {
			const report = buildStartupReport(baseInput(), 'medium');
			const off = renderStartupReportAnsi(report, {
				DELENDAI_COLOR: 'never',
			});
			const plain = renderStartupReportPlain(report);
			expect(off).toBe(plain);
		});
	});
});
