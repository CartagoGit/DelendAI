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
	toolPermissions = '',
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
			...(toolPermissions
				? [`\ttoolPermissions: ${toolPermissions},`]
				: []),
			"\tpresets: ['minimal'],",
			'\ttokenBudget: { warning: 2200, hard: 2500, releaseRelativePercent: 20 },',
			"\tdependencies: ['@mcp-vertex/core'],",
			"\tcapabilities: ['fixture'],",
			'};\n',
		].join('\n'),
		'utf8',
	);
};

const writeRuntimeIndex = async (
	root: string,
	pluginId: string,
	version = '0.1.0',
): Promise<void> => {
	await mkdir(join(root, 'plugins', pluginId, 'src'), { recursive: true });
	await writeFile(
		join(root, 'plugins', pluginId, 'src', 'index.ts'),
		[
			'export default {',
			`\tname: '${pluginId}',`,
			`\tversion: '${version}',`,
			'};',
			'',
		].join('\n'),
		'utf8',
	);
};

const writeImportedRuntimeIndex = async (
	root: string,
	pluginId: string,
): Promise<void> => {
	await mkdir(join(root, 'plugins', pluginId, 'src'), { recursive: true });
	await writeFile(
		join(root, 'plugins', pluginId, 'src', 'index.ts'),
		[
			"import pluginPackageJson from '../package.json';",
			'',
			'export default {',
			`\tname: '${pluginId}',`,
			'\tversion: pluginPackageJson.version,',
			'};',
			'',
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
		await writeRuntimeIndex(root, 'foo');
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
			expect(violations).toContainEqual(
				expect.objectContaining({
					plugin: 'foo',
					rule: 'MANIFEST-VER-001',
					message: expect.stringContaining('src/index.ts'),
				}),
			);
		});
	});

	it('flags runtime version mismatch even when package and manifest agree', async () => {
		await withFixture(async (root) => {
			await writeRuntimeIndex(root, 'foo', '0.1.1');
			const violations = await lintManifestVsPackage(root);
			expect(violations).toContainEqual(
				expect.objectContaining({
					plugin: 'foo',
					rule: 'MANIFEST-VER-001',
					message: expect.stringContaining(
						'plugin.manifest.ts#version "0.1.0"',
					),
				}),
			);
		});
	});

	it('resolves runtime versions imported from package.json (x00293 spike pattern)', async () => {
		await withFixture(async (root) => {
			// Bump package.json so only the (hardcoded 0.1.0) manifest drifts.
			// The runtime version is imported from package.json and must be
			// resolved to 0.1.1 — never left as an empty/unknown string.
			await writeJson(join(root, 'plugins/foo/package.json'), {
				name: '@mcp-vertex/foo',
				version: '0.1.1',
				publishConfig: { access: 'public' },
			});
			await writeImportedRuntimeIndex(root, 'foo');
			const violations = await lintManifestVsPackage(root);
			const fooViolations = violations.filter(
				(violation) => violation.plugin === 'foo',
			);
			expect(fooViolations.length).toBe(1);
			expect(fooViolations[0]?.rule).toBe('MANIFEST-VER-001');
			expect(fooViolations[0]?.message).toContain(
				'src/index.ts#version "0.1.1"',
			);
			expect(fooViolations[0]?.message).not.toContain(
				'src/index.ts#version ""',
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

	it('flags unknown per-tool permissions for commit-policy', async () => {
		await withFixture(async (root) => {
			await mkdir(join(root, 'plugins/commit-policy'), {
				recursive: true,
			});
			await writeJson(join(root, 'plugins/commit-policy/package.json'), {
				name: '@mcp-vertex/commit-policy',
				version: '0.1.0',
				publishConfig: { access: 'public' },
			});
			await writeManifest(
				root,
				'commit-policy',
				'',
				`{ commit_policy_status: ['filesystem-read'], unknown_tool: ['filesystem-read'] }`,
			);
			await writeRuntimeIndex(root, 'commit-policy');
			const violations = await lintManifestVsPackage(root);
			expect(violations).toContainEqual(
				expect.objectContaining({
					plugin: 'commit-policy',
					rule: 'MANIFEST-TOOL-001',
				}),
			);
		});
	});

	it('flags missing and incorrect per-tool permissions for commit-policy', async () => {
		await withFixture(async (root) => {
			await mkdir(join(root, 'plugins/commit-policy'), {
				recursive: true,
			});
			await writeJson(join(root, 'plugins/commit-policy/package.json'), {
				name: '@mcp-vertex/commit-policy',
				version: '0.1.0',
				publishConfig: { access: 'public' },
			});
			await writeManifest(
				root,
				'commit-policy',
				'',
				`{ commit_policy_status: ['git-write'], commit_policy_commit: ['git-write'], commit_policy_push: ['git-write'], commit_policy_run: ['git-write'] }`,
			);
			await writeRuntimeIndex(root, 'commit-policy');
			const violations = await lintManifestVsPackage(root);
			expect(violations).toContainEqual(
				expect.objectContaining({ rule: 'MANIFEST-TOOL-002' }),
			);
			expect(violations).toContainEqual(
				expect.objectContaining({ rule: 'MANIFEST-TOOL-003' }),
			);
		});
	});

	it('flags a completely missing toolPermissions map for commit-policy', async () => {
		await withFixture(async (root) => {
			await mkdir(join(root, 'plugins/commit-policy'), {
				recursive: true,
			});
			await writeJson(join(root, 'plugins/commit-policy/package.json'), {
				name: '@mcp-vertex/commit-policy',
				version: '0.1.0',
				publishConfig: { access: 'public' },
			});
			await writeManifest(root, 'commit-policy');
			await writeRuntimeIndex(root, 'commit-policy');
			const violations = await lintManifestVsPackage(root);
			expect(
				violations.filter(
					(violation) => violation.rule === 'MANIFEST-TOOL-002',
				),
			).toHaveLength(5);
		});
	});
});
