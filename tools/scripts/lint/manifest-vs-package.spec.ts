import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintManifestVsPackage } from './manifest-vs-package.script.ts';

const writeJson = async (path: string, value: unknown): Promise<void> => {
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
};

const writeManifest = async (
	root: string,
	pluginId: string,
	override = '',
): Promise<void> => {
	await writeFile(
		join(root, 'plugins', pluginId, 'plugin.manifest.ts'),
		[
			'export default {',
			override || `\tid: '${pluginId}',`,
			`\tpackage: '@mcp-vertex/${pluginId}',`,
			"\tversion: '0.1.0',",
			"\tvisibility: 'public',",
			"\tsummary: 'Consistent manifest fixture for lint validation.',",
			"\ttags: ['fixture'],",
			"\tmaturity: 'stable',",
			"\tpermissions: ['filesystem-read'],",
			"\tpresets: ['minimal'],",
			'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
			"\tdependencies: ['@mcp-vertex/core'],",
			"\tcapabilities: ['fixture'],",
			'};\n',
		].join('\n'),
		'utf8',
	);
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'manifest-vs-package-'));
	try {
		await mkdir(join(root, 'plugins/foo'), { recursive: true });
		await writeJson(join(root, 'plugins/foo/package.json'), {
			name: '@mcp-vertex/foo',
			version: '0.1.0',
			publishConfig: { access: 'public' },
		});
		await writeManifest(root, 'foo');
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('manifest-vs-package lint', () => {
	it('passes for coherent manifest and package.json', async () => {
		await withFixture(async (root) => {
			expect(await lintManifestVsPackage(root)).toEqual([]);
		});
	});

	it('flags package mismatch', async () => {
		await withFixture(async (root) => {
			await writeJson(join(root, 'plugins/foo/package.json'), {
				name: '@mcp-vertex/bar',
				version: '0.1.0',
				publishConfig: { access: 'public' },
			});
			const violations = await lintManifestVsPackage(root);
			expect(violations.some((v) => v.rule === 'MANIFEST-PKG-001')).toBe(
				true,
			);
		});
	});

	it('flags version mismatch', async () => {
		await withFixture(async (root) => {
			await writeJson(join(root, 'plugins/foo/package.json'), {
				name: '@mcp-vertex/foo',
				version: '0.1.1',
				publishConfig: { access: 'public' },
			});
			const violations = await lintManifestVsPackage(root);
			expect(violations.some((v) => v.rule === 'MANIFEST-VER-001')).toBe(
				true,
			);
		});
	});

	it('flags private visibility drift', async () => {
		await withFixture(async (root) => {
			await writeManifest(root, 'foo', "\tid: 'foo',");
			await writeFile(
				join(root, 'plugins/foo/plugin.manifest.ts'),
				[
					'export default {',
					"\tid: 'foo',",
					"\tpackage: '@mcp-vertex/foo',",
					"\tversion: '0.1.0',",
					"\tvisibility: 'private',",
					"\tsummary: 'Consistent manifest fixture for lint validation.',",
					"\ttags: ['fixture'],",
					"\tmaturity: 'stable',",
					"\tpermissions: ['filesystem-read'],",
					"\tpresets: ['minimal'],",
					'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
					"\tdependencies: ['@mcp-vertex/core'],",
					"\tcapabilities: ['fixture'],",
					'};\n',
				].join('\n'),
			);
			const violations = await lintManifestVsPackage(root);
			expect(violations.some((v) => v.rule === 'MANIFEST-VIS-001')).toBe(
				true,
			);
		});
	});
});
