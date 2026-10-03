import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	discoverPluginManifests,
	loadAllPluginManifests,
	validatePluginManifest,
} from '@delendai/core/public';

const withFixture = async (
	callback: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'manifest-discovery-'));
	try {
		await mkdir(join(root, 'plugins/search'), { recursive: true });
		await mkdir(join(root, 'plugins/docs'), { recursive: true });
		await writeFile(
			join(root, 'plugins/search/plugin.manifest.ts'),
			[
				'export default {',
				"\tid: 'search',",
				"\tpackage: '@delendai/search',",
				"\tversion: '0.1.1',",
				"\tvisibility: 'public',",
				"\tsummary: 'Code search with low-token result windows.',",
				"\ttags: ['search'],",
				"\tmaturity: 'stable',",
				"\tpermissions: ['filesystem-read'],",
				"\tpresets: ['minimal'],",
				'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
				"\tdependencies: ['@delendai/core'],",
				"\tcapabilities: ['lexical-search'],",
				'};\n',
			].join('\n'),
		);
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('manifest discovery', () => {
	it('discovers plugin manifests under plugins/*/plugin.manifest.ts', async () => {
		await withFixture(async (root) => {
			const manifests = await discoverPluginManifests(root);
			expect(manifests).toEqual([
				join(root, 'plugins/search/plugin.manifest.ts'),
			]);
		});
	});

	it('loads every discovered plugin manifest', async () => {
		await withFixture(async (root) => {
			const manifests = await loadAllPluginManifests(root);
			expect(manifests).toHaveLength(1);
			expect(manifests[0]?.id).toBe('search');
		});
	});

	it('rejects invalid manifests with typed zod errors', () => {
		expect(() =>
			validatePluginManifest({
				id: 'Search',
				package: '@delendai/search',
				version: '0.1.1',
				visibility: 'public',
				summary: 'Code search with low-token result windows.',
				tags: ['search'],
				maturity: 'stable',
				permissions: ['filesystem-read'],
				presets: ['minimal'],
				tokenBudget: {
					warning: 2200,
					hard: 2500,
					releaseRelativePercent: 20,
				},
				dependencies: ['@delendai/core'],
				capabilities: ['lexical-search'],
			}),
		).toThrow(/kebab-case/u);
	});
});
