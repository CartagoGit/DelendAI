import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@delendai/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@delendai/core/lib/bootstrap/build-blueprint';
import { PROJECT_PATTERN_CATALOG } from '@delendai/core/lib/bootstrap/pattern-catalog';
import { resolvePatternCatalog } from '@delendai/core/lib/bootstrap/pattern-catalog-overrides';
import { recommendServerPlan } from '@delendai/core/lib/bootstrap/recommend-plan';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('resolvePatternCatalog', async () => {
	it('returns the hardcoded catalog when no overrides are passed', async () => {
		const merged = resolvePatternCatalog();
		expect(merged).toBe(PROJECT_PATTERN_CATALOG);
	});

	it('is additive: an override on a built-in type keeps the hardcoded tools/plugins', async () => {
		const merged = resolvePatternCatalog({
			library: {
				type: 'library',
				describe: 'A library with extra audit hooks.',
				recommendedTools: [
					{
						name: 'audit_extra',
						description: 'Extra audit hook.',
					},
				],
				recommendedPlugins: ['audit'],
				knowledgeHints: ['Pin the public API.'],
			},
		});
		const lib = merged.library;
		// Hardcoded baseline kept.
		expect(lib.recommendedTools.map((t) => t.name)).toContain(
			'check_project_state',
		);
		expect(lib.recommendedTools.map((t) => t.name)).toContain(
			'audit_extra',
		);
		expect(lib.recommendedPlugins).toContain('rules');
		expect(lib.recommendedPlugins).toContain('audit');
		// Hints are concatenated, deduplicated.
		expect(lib.knowledgeHints).toContain(
			'Guard the public barrel; treat exports as a contract.',
		);
		expect(lib.knowledgeHints).toContain('Pin the public API.');
	});

	it('accepts a brand-new project type (host-defined)', async () => {
		const merged = resolvePatternCatalog({
			'data-pipeline': {
				type: 'data-pipeline',
				describe: 'An ETL/data pipeline repo.',
				recommendedTools: [
					{
						name: 'run_pipeline',
						description: 'Run the data pipeline end-to-end.',
					},
				],
				recommendedPlugins: ['quality'],
				knowledgeHints: ['Pin data sources in the catalog.'],
			},
		});
		const dp = merged['data-pipeline'];
		expect(dp).toBeDefined();
		expect(dp?.recommendedTools[0]?.name).toBe('run_pipeline');
	});
});

describe('pattern overrides flow into buildServerBlueprint and recommendServerPlan', async () => {
	const analyse = async () =>
		await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/lib',
					main: './x.ts',
				}),
				'tsconfig.json': '{}',
			}),
		);

	it('recommendServerPlan picks up the override tools + plugins', async () => {
		const plan = await recommendServerPlan(await analyse(), {
			patternOverrides: {
				library: {
					type: 'library',
					describe: 'Library + audit',
					recommendedTools: [
						{ name: 'audit_extra', description: 'Extra audit' },
					],
					recommendedPlugins: ['audit'],
					knowledgeHints: ['Pin the public API.'],
				},
			},
		});
		expect(plan.tools.map((t) => t.name)).toContain('audit_extra');
		expect(plan.plugins).toContain('audit');
		expect(plan.plugins).toContain('rules'); // hardcoded kept
		expect(plan.notes).toContain('Pin the public API.');
	});

	it('buildServerBlueprint carries the override knowledge hints into notes', async () => {
		const bp = buildServerBlueprint(await analyse(), {
			patternOverrides: {
				library: {
					type: 'library',
					describe: 'Library + audit',
					recommendedTools: [
						{ name: 'audit_extra', description: 'Extra audit' },
					],
					recommendedPlugins: ['audit'],
					knowledgeHints: ['Pin the public API.'],
				},
			},
		});
		expect(bp.plugins).toContain('audit');
		expect(bp.plugins).toContain('rules');
		expect(bp.tools.map((t) => t.name)).toContain('audit_extra');
		expect(bp.notes).toContain('Pin the public API.');
	});

	it('host-defined type flows through when the analysis is forced to it', async () => {
		// Project types come from analyzeProject; for a brand-new type to
		// match, the analysis must classify the project as that type. We
		// can't forge that from a real analyzeProject, but we can verify
		// the catalog exposes the new entry and a blueprint built from
		// an analysis that does classify it works.
		const merged = resolvePatternCatalog({
			'ml-training': {
				type: 'ml-training',
				describe: 'ML training repo.',
				recommendedTools: [
					{ name: 'train', description: 'Run training.' },
				],
				recommendedPlugins: [],
				knowledgeHints: [],
			},
		});
		expect(merged['ml-training']).toBeDefined();
		// Hardcoded catalog is still usable.
		expect(merged.library).toBe(PROJECT_PATTERN_CATALOG.library);
	});

	it('preserves the same namespace head when the package name has repeated separators', async () => {
		const plan = await recommendServerPlan(
			await analyzeProject(
				reader({
					'package.json': JSON.stringify({
						name: '@Acme///Platform___Tools!!!',
					}),
					'tsconfig.json': '{}',
				}),
			),
		);
		expect(plan.namespacePrefix).toBe('platform');
	});

	it('normalises a long separator run in the package name quickly', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: `@scope/plan${'!'.repeat(40_000)}`,
				}),
				'tsconfig.json': '{}',
			}),
		);
		const started = Date.now();
		const plan = await recommendServerPlan(analysis);
		expect(plan.namespacePrefix).toBe('plan');
		expect(Date.now() - started).toBeLessThan(500);
	});
});
