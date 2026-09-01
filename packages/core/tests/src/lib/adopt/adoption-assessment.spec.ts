import { describe, expect, it } from 'vitest';

import { buildAdoptProjectWriteEstimate } from '@mcp-vertex/core/lib/adopt/adopt-project-write-estimate';
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
		const estimate = buildAdoptProjectWriteEstimate({
			hostOptions: {
				projectName: '@acme/platform',
				namespacePrefix: 'mcp-vertex',
				projectPackageName: '@mcp-vertex/adopted',
				mcpServerName: 'mcp-vertex',
				existingMcpVertex: true,
			},
			docsDir: 'docs/mcp-vertex',
		});
		const assessment = buildAdoptionAssessment(
			baseAnalysis(),
			[
				'packages',
				'apps',
				'docs',
				'.github',
				'Dockerfile',
				'prisma',
				'locales',
				'.env.example',
			],
			{
				projectName: '@acme/platform',
				namespacePrefix: 'mcp-vertex',
				mcpServerName: 'mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
		);

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
		expect(assessment.cost.surfaceMode).toBe('native');
		expect(assessment.cost.runtimeSurface).toBe('managed');
		expect(assessment.conflicts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ summary: 'script:validate' }),
				expect.objectContaining({
					kind: 'write-estimate',
					count: estimate.count,
					exact: true,
					breakdown: expect.arrayContaining([
						expect.objectContaining({ kind: 'config', count: 1 }),
						expect.objectContaining({
							kind: 'generated',
							exact: true,
						}),
						expect.objectContaining({
							kind: 'proposal-store',
							exact: true,
						}),
					]),
				}),
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
			expect.objectContaining({ kind: 'write-estimate', count: 17 }),
		]);
	});

	it('marks the write estimate as inexact when docsDir is unavailable', () => {
		const assessment = buildAdoptionAssessment(
			baseAnalysis(),
			['packages'],
			{
				projectName: '@acme/platform',
				namespacePrefix: 'mcp-vertex',
				mcpServerName: 'mcp-vertex',
			},
		);

		expect(assessment.conflicts).toEqual([
			expect.objectContaining({ summary: 'script:validate' }),
			expect.objectContaining({ summary: 'config:.vscode/mcp.json' }),
			expect.objectContaining({
				kind: 'write-estimate',
				exact: false,
				count: 17,
				breakdown: expect.arrayContaining([
					expect.objectContaining({
						kind: 'proposal-store',
						exact: false,
					}),
				]),
			}),
		]);
	});
});
