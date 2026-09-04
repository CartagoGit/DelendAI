import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import plugin from '@delendai/deps';
import {
	listPolyglotDeps,
	parseCargoToml,
	parseGoMod,
	parsePyprojectToml,
} from '@delendai/deps/lib/services/polyglot';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@delendai/core/public';

describe('polyglot manifests (M33)', async () => {
	it('parses PEP 621 dependencies + Poetry groups from pyproject.toml', async () => {
		const toml = [
			'[project]',
			'name = "demo"',
			'dependencies = ["requests>=2.0", "click"]',
			'',
			'[tool.poetry.dependencies]',
			'python = "^3.11"',
			'fastapi = "^0.110"',
			'',
			'[tool.poetry.group.dev.dependencies]',
			'pytest = "^8.0"',
		].join('\n');
		expect(parsePyprojectToml(toml)).toEqual([
			{
				ecosystem: 'python',
				name: 'requests',
				range: '>=2.0',
				section: 'dependencies',
			},
			{
				ecosystem: 'python',
				name: 'click',
				range: '*',
				section: 'dependencies',
			},
			{
				ecosystem: 'python',
				name: 'fastapi',
				range: '^0.110',
				section: 'dependencies',
			},
			{
				ecosystem: 'python',
				name: 'pytest',
				range: '^8.0',
				section: 'group.dev',
			},
		]);
	});

	it('parses PEP 621 multi-line dependencies from pyproject.toml', async () => {
		const toml = [
			'[project]',
			'name = "demo"',
			'dependencies = [',
			'  "requests>=2.0",',
			'  "click"',
			']',
		].join('\n');
		expect(parsePyprojectToml(toml)).toEqual([
			{
				ecosystem: 'python',
				name: 'requests',
				range: '>=2.0',
				section: 'dependencies',
			},
			{
				ecosystem: 'python',
				name: 'click',
				range: '*',
				section: 'dependencies',
			},
		]);
	});

	it('parses Cargo.toml across dependency sections, extracting version from inline tables', async () => {
		const toml = [
			'[package]',
			'name = "demo"',
			'',
			'[dependencies]',
			'serde = "1.0"',
			'tokio = { version = "1", features = ["full"] }',
			'',
			'[dev-dependencies]',
			'proptest = "1.0"',
		].join('\n');
		expect(parseCargoToml(toml)).toEqual([
			{
				ecosystem: 'rust',
				name: 'serde',
				range: '1.0',
				section: 'dependencies',
			},
			{
				ecosystem: 'rust',
				name: 'tokio',
				range: '1',
				section: 'dependencies',
			},
			{
				ecosystem: 'rust',
				name: 'proptest',
				range: '1.0',
				section: 'dev-dependencies',
			},
		]);
	});

	it('parses go.mod single-line and block require statements, flagging indirect', async () => {
		const mod = [
			'module example.com/demo',
			'',
			'go 1.21',
			'',
			'require (',
			'\tgithub.com/pkg/errors v0.9.1',
			'\tgolang.org/x/sync v0.5.0 // indirect',
			')',
			'',
			'require github.com/single/dep v1.2.3',
		].join('\n');
		expect(parseGoMod(mod)).toEqual([
			{
				ecosystem: 'go',
				name: 'github.com/pkg/errors',
				range: 'v0.9.1',
				section: 'require',
			},
			{
				ecosystem: 'go',
				name: 'golang.org/x/sync',
				range: 'v0.5.0',
				section: 'require (indirect)',
			},
			{
				ecosystem: 'go',
				name: 'github.com/single/dep',
				range: 'v1.2.3',
				section: 'require',
			},
		]);
	});

	it('keeps the exact parsed output for quoted TOML keys and indirect go.mod entries', async () => {
		expect(
			parseCargoToml(
				['[dependencies]', '"serde-json" = "1.0"'].join('\n'),
			),
		).toEqual([
			{
				ecosystem: 'rust',
				name: 'serde-json',
				range: '1.0',
				section: 'dependencies',
			},
		]);
		expect(
			parseGoMod('require github.com/acme/lib v1.2.3 // indirect'),
		).toEqual([
			{
				ecosystem: 'go',
				name: 'github.com/acme/lib',
				range: 'v1.2.3',
				section: 'require (indirect)',
			},
		]);
	});

	it('handles long go.mod require comments without pathological slowdown', async () => {
		const startedAt = performance.now();
		const commentPadding = ' '.repeat(20_000);
		expect(
			parseGoMod(
				`require github.com/acme/lib v1.2.3 //${commentPadding}indirect`,
			),
		).toEqual([
			{
				ecosystem: 'go',
				name: 'github.com/acme/lib',
				range: 'v1.2.3',
				section: 'require (indirect)',
			},
		]);
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});

	it('listPolyglotDeps only reads whichever manifests exist', async () => {
		const root = mkdtempSync(join(tmpdir(), 'deps-polyglot-'));
		try {
			writeFileSync(
				join(root, 'go.mod'),
				'module demo\n\nrequire github.com/x/y v1.0.0\n',
				'utf8',
			);
			const manifests = await listPolyglotDeps(root);
			expect(manifests).toEqual([
				{
					ecosystem: 'go',
					manifest: 'go.mod',
					deps: [
						{
							ecosystem: 'go',
							name: 'github.com/x/y',
							range: 'v1.0.0',
							section: 'require',
						},
					],
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('deps plugin', async () => {
	it('registers deps_list + deps_check + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
			},
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: '.cache/delendai/deps',
			pluginDocsDir: 'docs/delendai/deps',
			namespacePrefix: 'deps',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect((reg.tools as IToolRegistration[]).map((t) => t.id)).toEqual([
			'deps_list',
			'deps_check',
			'deps_licenses',
			'deps_polyglot',
			'deps_tree',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('deps-usage');
	});
});
