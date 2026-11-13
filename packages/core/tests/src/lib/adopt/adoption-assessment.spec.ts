import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAdoptProjectWriteEstimate } from '@delendai/core/lib/adopt/adopt-project-write-estimate';
import { buildAdoptionAssessment } from '@delendai/core/lib/adopt/adoption-assessment.service';
import {
	registerAdoptionExtensions,
	resetAdoptionExtensionsForTests,
	type IAdoptionPlanExtension,
} from '@delendai/core/lib/adopt/adoption-extension-registry';
import * as adoptProjectWriteEstimate from '@delendai/core/lib/adopt/adopt-project-write-estimate';
import type { IProjectAnalysis } from '@delendai/core/lib/bootstrap/analyze-project';

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

/** An extension that adds `count` files under docsDir, as a plugin would. */
const addingFiles = (title: string, count: number): IAdoptionPlanExtension => ({
	title,
	steps: [],
	applyAdoptionPlan: (input) => ({
		...input.plan,
		files: [
			...input.plan.files,
			...Array.from({ length: count }, (_, index) => ({
				path: `${input.request.docsDir}/${title}/${index}.md`,
				content: '',
			})),
		],
	}),
});

describe('buildAdoptionAssessment', () => {
	afterEach(() => {
		resetAdoptionExtensionsForTests();
	});

	it('builds a coherent matrix for a mature monorepo', () => {
		const estimate = buildAdoptProjectWriteEstimate({
			hostOptions: {
				projectName: '@acme/platform',
				namespacePrefix: 'delendai',
				projectPackageName: '@delendai/adopted',
				mcpServerName: 'delendai',
				existingDelendai: true,
			},
			contributions: [],
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
				namespacePrefix: 'delendai',
				mcpServerName: 'delendai',
				docsDir: 'docs/delendai',
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

	it('counts the files a loaded plugin adds, and nothing for a plugin that is not loaded', () => {
		const withoutPlugins = buildAdoptionAssessment(
			baseAnalysis(),
			['packages'],
			{
				docsDir: 'docs/delendai',
			},
		).conflicts.find((conflict) => conflict.kind === 'write-estimate');
		registerAdoptionExtensions('fake', [addingFiles('Fake adoption', 3)]);

		const withPlugin = buildAdoptionAssessment(
			baseAnalysis(),
			['packages'],
			{
				docsDir: 'docs/delendai',
			},
		).conflicts.find((conflict) => conflict.kind === 'write-estimate');

		expect(withoutPlugins).toMatchObject({ count: 17, exact: true });
		expect(
			withoutPlugins?.breakdown?.some((entry) => entry.kind === 'plugin'),
		).toBe(false);
		expect(withPlugin).toMatchObject({ count: 20, exact: true });
		expect(withPlugin?.breakdown).toContainEqual({
			kind: 'plugin',
			description: 'Fake adoption: files the plugin adds.',
			count: 3,
			exact: true,
		});
	});

	it('marks the write estimate as inexact when a loaded plugin contributes and docsDir is unavailable', () => {
		registerAdoptionExtensions('fake', [addingFiles('Fake adoption', 3)]);
		const assessment = buildAdoptionAssessment(
			baseAnalysis(),
			['packages'],
			{
				projectName: '@acme/platform',
				namespacePrefix: 'delendai',
				mcpServerName: 'delendai',
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
						kind: 'plugin',
						exact: false,
					}),
				]),
			}),
		]);
	});

	it('forwards namespacePrefix and alternate mcpServerName to the write estimate host options', () => {
		const estimateSpy = vi.spyOn(
			adoptProjectWriteEstimate,
			'buildAdoptProjectWriteEstimate',
		);

		buildAdoptionAssessment(baseAnalysis(), ['packages'], {
			projectName: '@acme/platform',
			namespacePrefix: 'acme',
			mcpServerName: 'acme-tools',
			docsDir: 'docs/acme',
		});

		expect(estimateSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				hostOptions: expect.objectContaining({
					namespacePrefix: 'acme',
					mcpServerName: 'acme-tools',
				}),
			}),
		);
		estimateSpy.mockRestore();
	});
});
