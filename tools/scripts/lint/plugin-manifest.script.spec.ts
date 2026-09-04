import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintPluginManifests } from './plugin-manifest.script.ts';

const writeJson = async (path: string, value: unknown): Promise<void> => {
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
	options?: { readonly includeSearchManifest?: boolean },
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'plugin-manifest-lint-'));
	try {
		await mkdir(join(root, 'plugins/search'), { recursive: true });
		await mkdir(join(root, 'plugins/docs'), { recursive: true });
		await writeJson(join(root, 'plugins/search/package.json'), {
			name: '@delendai/search',
			version: '0.1.1',
		});
		await writeJson(join(root, 'plugins/docs/package.json'), {
			name: '@delendai/docs',
			version: '0.1.1',
		});
		await mkdir(join(root, 'plugins/context-for-change'), {
			recursive: true,
		});
		await writeJson(join(root, 'plugins/context-for-change/package.json'), {
			name: '@delendai/context-for-change',
			version: '0.1.0',
		});
		await mkdir(join(root, 'plugins/impact-analysis'), { recursive: true });
		await writeJson(join(root, 'plugins/impact-analysis/package.json'), {
			name: '@delendai/impact-analysis',
			version: '0.1.0',
		});
		await mkdir(join(root, 'plugins/adaptive-optimizer'), {
			recursive: true,
		});
		await writeJson(join(root, 'plugins/adaptive-optimizer/package.json'), {
			name: '@delendai/adaptive-optimizer',
			version: '0.1.0',
		});
		await mkdir(join(root, 'plugins/project-health'), { recursive: true });
		await writeJson(join(root, 'plugins/project-health/package.json'), {
			name: '@delendai/project-health',
			version: '0.1.0',
		});
		await mkdir(join(root, 'plugins/quality-policy'), { recursive: true });
		await writeJson(join(root, 'plugins/quality-policy/package.json'), {
			name: '@delendai/quality-policy',
			version: '0.1.0',
		});
		await writeFile(
			join(root, 'plugins/context-for-change/plugin.manifest.ts'),
			[
				'export const CONTEXT_FOR_CHANGE_PLUGIN_MANIFEST = {',
				"\tid: 'context-for-change',",
				"\tpackage: '@delendai/context-for-change',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Compact task-oriented change context orchestration.',",
				"\ttags: ['context', 'orchestration', 'compact', 'f00165'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core', 'zod'],",
				"\tcapabilities: ['context-orchestration'],",
				'};\n',
			].join('\n'),
		);
		await writeFile(
			join(root, 'plugins/impact-analysis/plugin.manifest.ts'),
			[
				'export const IMPACT_ANALYSIS_PLUGIN_MANIFEST = {',
				"\tid: 'impact-analysis',",
				"\tpackage: '@delendai/impact-analysis',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Bounded impact analysis and test selection.',",
				"\ttags: ['impact', 'tests', 'f00169'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core', 'zod'],",
				"\tcapabilities: ['impact-analysis', 'test-selection'],",
				'};\n',
			].join('\n'),
		);
		await writeFile(
			join(root, 'plugins/adaptive-optimizer/plugin.manifest.ts'),
			[
				'export const ADAPTIVE_OPTIMIZER_PLUGIN_MANIFEST = {',
				"\tid: 'adaptive-optimizer',",
				"\tpackage: '@delendai/adaptive-optimizer',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Adaptive optimizer for cheap candidate ranking.',",
				"\ttags: ['optimizer', 'adaptive', 'f00168'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core', 'zod'],",
				"\tcapabilities: ['adaptive-optimization'],",
				'};\n',
			].join('\n'),
		);
		await writeFile(
			join(root, 'plugins/project-health/plugin.manifest.ts'),
			[
				'export const PROJECT_HEALTH_PLUGIN_MANIFEST = {',
				"\tid: 'project-health',",
				"\tpackage: '@delendai/project-health',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Compact project-health aggregator.',",
				"\ttags: ['health', 'aggregation', 'f00166'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core', 'zod'],",
				"\tcapabilities: ['health-aggregation'],",
				'};\n',
			].join('\n'),
		);
		await writeFile(
			join(root, 'plugins/quality-policy/plugin.manifest.ts'),
			[
				'export const QUALITY_POLICY_PLUGIN_MANIFEST = {',
				"\tid: 'quality-policy',",
				"\tpackage: '@delendai/quality-policy',",
				"\tversion: '0.1.0',",
				"\tvisibility: 'public',",
				"\tsummary: 'Unified quality policy surface.',",
				"\ttags: ['quality', 'policy', 'f00167'],",
				"\tmaturity: 'experimental',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['vertex'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core', 'zod'],",
				"\tcapabilities: ['quality-policy'],",
				'};\n',
			].join('\n'),
		);
		if (options?.includeSearchManifest !== false) {
			await writeFile(
				join(root, 'plugins/search/plugin.manifest.ts'),
				[
					'export const SEARCH_PLUGIN_MANIFEST = {',
					"\tid: 'search',",
					"\tpackage: '@delendai/search',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'public',",
					"\tsummary: 'Code search (semantic + symbol + references).',",
					"\ttags: ['search', 'symbol', 'f00136'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['minimal', 'lean', 'standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api', 'cli-tool'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core', 'zod'],",
					"\tcapabilities: ['lexical-search', 'regex-search'],",
					'};\n',
				].join('\n'),
			);
		}
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('plugin-manifest lint', () => {
	it('passes when every public plugin has a manifest', async () => {
		await withFixture(async (root) => {
			await writeFile(
				join(root, 'plugins/docs/plugin.manifest.ts'),
				[
					'export const DOCS_PLUGIN_MANIFEST = {',
					"\tid: 'docs',",
					"\tpackage: '@delendai/docs',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'public',",
					"\tsummary: 'Doc generation, search, and rendered catalog.',",
					"\ttags: ['docs', 'catalog'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['lean', 'standard', 'vertex'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core', 'zod'],",
					"\tcapabilities: ['docs-catalog'],",
					'};\n',
				].join('\n'),
			);
			const report = await lintPluginManifests(root);
			expect(report.ok).toBe(true);
			expect(report.findings).toHaveLength(0);
		});
	});

	it('fails when a public plugin still lacks a manifest', async () => {
		await withFixture(async (root) => {
			const report = await lintPluginManifests(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.kind === 'public-package-missing-manifest',
				),
			).toBe(true);
		});
	});

	it('fails when the migrated plugin package exists but its manifest is missing', async () => {
		await withFixture(
			async (root) => {
				const report = await lintPluginManifests(root);
				expect(report.ok).toBe(false);
				expect(
					report.findings.some(
						(finding) =>
							finding.relPath === 'plugins/search/package.json',
					),
				).toBe(true);
			},
			{ includeSearchManifest: false },
		);
	});

	it('fails when manifest metadata does not match the package identity', async () => {
		await withFixture(async (root) => {
			await writeFile(
				join(root, 'plugins/docs/plugin.manifest.ts'),
				[
					'export default {',
					"\tid: 'search',",
					"\tpackage: '@delendai/docs',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'public',",
					"\tsummary: 'Doc generation, search, and rendered catalog.',",
					"\ttags: ['docs', 'catalog'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['lean'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core'],",
					"\tcapabilities: ['docs-catalog'],",
					'};\n',
				].join('\n'),
			);
			const report = await lintPluginManifests(root);
			expect(report.ok).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.kind === 'metadata-mismatch' ||
						finding.kind === 'manifest-without-package',
				),
			).toBe(true);
		});
	});
});
