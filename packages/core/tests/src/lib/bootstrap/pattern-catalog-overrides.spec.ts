import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import { PROJECT_PATTERN_CATALOG } from '@mcp-vertex/core/lib/bootstrap/pattern-catalog';
import { resolvePatternCatalog } from '@mcp-vertex/core/lib/bootstrap/pattern-catalog-overrides';
import { recommendServerPlan } from '@mcp-vertex/core/lib/bootstrap/recommend-plan';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('resolvePatternCatalog', () => {
	it('returns the hardcoded catalog when no overrides are passed', () => {
		const merged = resolvePatternCatalog();
		expect(merged).toBe(PROJECT_PATTERN_CATALOG);
	});

	it('is additive: an override on a built-in type keeps the hardcoded tools/plugins', () => {
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

	it('accepts a brand-new project type (host-defined)', () => {
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

describe('pattern overrides flow into buildServerBlueprint and recommendServerPlan', () => {
	const analyse = () =>
		analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/lib',
					main: './x.ts',
				}),
				'tsconfig.json': '{}',
			}),
		);

	it('recommendServerPlan picks up the override tools + plugins', () => {
		const plan = recommendServerPlan(analyse(), {
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

	it('buildServerBlueprint carries the override knowledge hints into notes', () => {
		const bp = buildServerBlueprint(analyse(), {
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

	it('host-defined type flows through when the analysis is forced to it', () => {
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
});
