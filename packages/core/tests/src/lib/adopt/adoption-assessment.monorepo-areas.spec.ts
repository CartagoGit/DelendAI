import { describe, expect, it } from 'vitest';

import { buildAdoptionAssessment } from '@delendai/core/lib/adopt/adoption-assessment.service';
import type { IProjectAnalysis } from '@delendai/core/lib/bootstrap/analyze-project';

const baseAnalysis = (
	overrides: Partial<IProjectAnalysis> = {},
): IProjectAnalysis => ({
	hasPackageJson: true,
	name: '@acme/platform',
	projectType: 'monorepo',
	language: 'typescript',
	packageManager: 'bun',
	framework: undefined,
	testRunner: 'vitest',
	monorepoTool: 'turbo',
	hasMcpProject: false,
	mcpEvidence: [],
	ci: ['github-actions'],
	ciProvider: 'github-actions',
	agentConfigs: [],
	scripts: { validate: 'bun run validate', test: 'vitest run' },
	docsConventions: [],
	conflicts: [],
	signals: [],
	...overrides,
});

const areaOf = (
	assessment: ReturnType<typeof buildAdoptionAssessment>,
	workspacePath: string,
) =>
	assessment.areaBreakdown?.find(
		(entry) => entry.workspacePath === workspacePath,
	);

describe('buildAdoptionAssessment monorepo area breakdown', () => {
	it('exposes differentiated workspace candidates for a heterogeneous monorepo', () => {
		const assessment = buildAdoptionAssessment(baseAnalysis(), [
			'apps/storefront-react',
			'apps/storefront-react/src',
			'apps/storefront-react/locales',
			'packages/api',
			'packages/api/prisma',
			'packages/api/Dockerfile',
			'packages/api/.env.example',
			'packages/shared-lib',
			'packages/shared-lib/src',
		]);

		expect(assessment.recommendedPresetId).toBe('swarm');
		expect(assessment.areaBreakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					workspacePath: 'apps/storefront-react',
					area: 'apps',
					candidatePresetId: 'web-app',
				}),
				expect.objectContaining({
					workspacePath: 'packages/api',
					area: 'packages',
					candidatePresetId: 'backend-api',
				}),
				expect.objectContaining({
					workspacePath: 'packages/shared-lib',
					area: 'packages',
					candidatePresetId: 'lean',
				}),
			]),
		);
		expect(
			areaOf(assessment, 'apps/storefront-react')?.recommendedPluginIds,
		).not.toContain('container');
		expect(
			areaOf(assessment, 'packages/api')?.recommendedPluginIds,
		).toEqual(expect.arrayContaining(['container', 'database', 'env']));
		expect(areaOf(assessment, 'packages/api')?.rationale).toContain(
			'packages/api',
		);
	});

	it('collapses back to the root recommendation for a small homogeneous monorepo', () => {
		const assessment = buildAdoptionAssessment(baseAnalysis(), [
			'apps/docs-react',
			'apps/docs-react/src',
			'apps/marketing-react',
			'apps/marketing-react/src',
		]);

		expect(assessment.recommendedPresetId).toBe('swarm');
		expect(assessment.areaBreakdown).toBeUndefined();
	});
});
