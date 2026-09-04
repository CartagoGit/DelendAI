import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintManifestVsPresets } from './manifest-vs-presets.script.ts';

const writeManifest = async (
	root: string,
	presets: readonly string[],
): Promise<void> => {
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
			`\tpresets: ${JSON.stringify(presets)},`,
			'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
			"\tdependencies: ['@delendai/core'],",
			"\tcapabilities: ['search'],",
			'};\n',
		].join('\n'),
		'utf8',
	);
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'manifest-vs-presets-'));
	try {
		await mkdir(join(root, 'plugins/search'), { recursive: true });
		await writeManifest(root, [
			'minimal',
			'lean',
			'standard',
			'swarm',
			'full',
			'vertex',
			'web-app',
			'backend-api',
			'cli-tool',
		]);
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('manifest-vs-presets lint', () => {
	it('passes for coherent manifest preset membership', async () => {
		await withFixture(async (root) => {
			expect(await lintManifestVsPresets(root)).toEqual([]);
		});
	});

	it('flags unknown preset ids', async () => {
		await withFixture(async (root) => {
			await writeManifest(root, ['unknown-preset']);
			const violations = await lintManifestVsPresets(root);
			expect(
				violations.some((v) => v.rule === 'MANIFEST-PRESET-001'),
			).toBe(true);
		});
	});

	it('flags declared preset memberships missing from the preset catalog', async () => {
		await withFixture(async (root) => {
			await writeManifest(root, ['vertex']);
			const violations = await lintManifestVsPresets(root);
			expect(
				violations.some((v) => v.rule === 'MANIFEST-PRESET-003'),
			).toBe(true);
		});
	});

	it('flags a private-visibility manifest that lists any preset (f00177 / MAN-001)', async () => {
		await withFixture(async (root) => {
			await writeFile(
				join(root, 'plugins/search/plugin.manifest.ts'),
				[
					'export default {',
					"\tid: 'search',",
					"\tpackage: '@delendai/search',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'private',",
					"\tsummary: 'Code search with low-token result windows.',",
					"\ttags: ['search'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['minimal'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core'],",
					"\tcapabilities: ['search'],",
					'};\n',
				].join('\n'),
				'utf8',
			);
			const violations = await lintManifestVsPresets(root);
			expect(
				violations.some((v) => v.rule === 'MANIFEST-PRESET-004'),
			).toBe(true);
		});
	});

	it('passes for a private-visibility manifest with an empty presets array', async () => {
		await withFixture(async (root) => {
			await writeFile(
				join(root, 'plugins/search/plugin.manifest.ts'),
				[
					'export default {',
					"\tid: 'search',",
					"\tpackage: '@delendai/search',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'private',",
					"\tsummary: 'Code search with low-token result windows.',",
					"\ttags: ['search'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					'\tpresets: [],',
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core'],",
					"\tcapabilities: ['search'],",
					'};\n',
				].join('\n'),
				'utf8',
			);
			const violations = await lintManifestVsPresets(root);
			expect(
				violations.some((v) => v.rule === 'MANIFEST-PRESET-004'),
			).toBe(false);
		});
	});

	it('flags presets listed in the manifest but absent from resolved catalog membership', async () => {
		await withFixture(async (root) => {
			await mkdir(join(root, 'plugins/docs'), { recursive: true });
			await writeFile(
				join(root, 'plugins/docs/plugin.manifest.ts'),
				[
					'export default {',
					"\tid: 'docs',",
					"\tpackage: '@delendai/docs',",
					"\tversion: '0.1.1',",
					"\tvisibility: 'public',",
					"\tsummary: 'Doc generation, search, and rendered catalog.',",
					"\ttags: ['docs', 'catalog'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['minimal'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@delendai/core'],",
					"\tcapabilities: ['docs-catalog'],",
					'};\n',
				].join('\n'),
			);
			const violations = await lintManifestVsPresets(root);
			expect(
				violations.some((v) => v.rule === 'MANIFEST-PRESET-002'),
			).toBe(true);
		});
	});
});
