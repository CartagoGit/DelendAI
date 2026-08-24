import { describe, expect, it } from 'vitest';

import { buildAdoptionAssessment } from '@mcp-vertex/core/lib/adopt/adoption-assessment.service';
import type { IProjectAnalysis } from '@mcp-vertex/core/lib/bootstrap/analyze-project';

const baseAnalysis = (
	overrides: Partial<IProjectAnalysis> = {},
): IProjectAnalysis => ({
	hasPackageJson: true,
	name: '@acme/platform',
	projectType: 'monorepo',
	language: 'typescript',
	packageManager: 'bun',
	framework: 'astro',
	testRunner: 'vitest',
	monorepoTool: 'turbo',
	hasMcpProject: false,
	mcpEvidence: [],
	ci: ['github-actions'],
	ciProvider: 'github-actions',
	agentConfigs: [],
	scripts: { validate: 'bun run validate', test: 'vitest run' },
	docsConventions: ['README.md', 'docs/', 'docs-site:astro'],
	conflicts: ['script:validate', 'config:.vscode/mcp.json'],
	signals: [],
	...overrides,
});

const recommendationOf = (
	assessment: ReturnType<typeof buildAdoptionAssessment>,
	id: string,
) => assessment.pluginRecommendations.find((entry) => entry.id === id);

describe('buildAdoptionAssessment', () => {
	it('builds a coherent matrix for a mature monorepo', () => {
		const assessment = buildAdoptionAssessment(baseAnalysis(), [
			'packages',
			'apps',
			'docs',
			'.github',
			'Dockerfile',
			'prisma',
			'locales',
			'.env.example',
		]);

		expect(assessment.recommendedPresetId).toBe('swarm');
		expect(assessment.recommendedPluginIds).toContain('proposals');
		expect(assessment.recommendedPluginIds).toContain('forge');
		expect(assessment.recommendedPluginIds).toContain('test-convention');
		expect(recommendationOf(assessment, 'container')?.recommended).toBe(
			true,
		);
		expect(recommendationOf(assessment, 'container')?.rationale).toContain(
			'Recommended because the repo exposes container files',
		);
		expect(assessment.cost.schemaBytes).toBeGreaterThan(0);
		expect(assessment.cost.estimatedTokens).toBeGreaterThan(0);
		expect(assessment.conflicts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ summary: 'script:validate' }),
				expect.objectContaining({ kind: 'write-estimate', count: 25 }),
			]),
		);
	});

	it('degrades cleanly for a non-TS CLI repo', () => {
		const assessment = buildAdoptionAssessment(
			baseAnalysis({
				projectType: 'cli',
				language: 'go',
				packageManager: 'unknown',
				framework: undefined,
				testRunner: 'unknown',
				monorepoTool: undefined,
				ci: [],
				ciProvider: 'unknown',
				docsConventions: [],
				conflicts: [],
			}),
			['cmd', 'go.mod'],
		);

		expect(assessment.recommendedPresetId).toBe('cli-tool');
		expect(recommendationOf(assessment, 'docs')?.recommended).toBe(false);
		expect(recommendationOf(assessment, 'env')?.recommended).toBe(false);
		expect(recommendationOf(assessment, 'test-policy')?.recommended).toBe(
			false,
		);
		expect(assessment.cost.source).toBe('preset-budget');
		expect(assessment.conflicts).toEqual([
			expect.objectContaining({ kind: 'write-estimate', count: 25 }),
		]);
	});
});
