import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	formatPluginManifestLintReport,
	lintPluginManifests,
} from './plugin-manifest.script.ts';

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
			name: '@mcp-vertex/search',
			version: '0.1.1',
		});
		await writeJson(join(root, 'plugins/docs/package.json'), {
			name: '@mcp-vertex/docs',
			version: '0.1.1',
		});
		if (options?.includeSearchManifest !== false) {
			await writeFile(
				join(root, 'plugins/search/plugin.manifest.ts'),
				[
					'export const SEARCH_PLUGIN_MANIFEST = {',
					"\tid: 'search',",
					"\tpackage: '@mcp-vertex/search',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'public',",
					"\tsummary: 'Code search (semantic + symbol + references).',",
					"\ttags: ['search', 'symbol', 'f00136'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['minimal', 'lean', 'standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api', 'cli-tool'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@mcp-vertex/core', 'zod'],",
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
	it('coexists with incremental migration in migrated-only mode', async () => {
		await withFixture(async (root) => {
			const report = await lintPluginManifests(root, 'migrated-only');
			expect(report.ok).toBe(true);
			expect(report.pending).toBe(1);
			expect(formatPluginManifestLintReport(report)).toContain(
				'pending migration',
			);
		});
	});

	it('fails in strict-all mode when a public plugin still lacks a manifest', async () => {
		await withFixture(async (root) => {
			const report = await lintPluginManifests(root, 'strict-all');
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
				const report = await lintPluginManifests(root, 'migrated-only');
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
});
