import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	listDeps,
	checkDeps,
	checkOutdated,
} from '@mcp-vertex/deps/lib/services/engine';
import {
	listPolyglotDeps,
	parseCargoToml,
	parseGoMod,
	parsePyprojectToml,
} from '@mcp-vertex/deps/lib/services/polyglot';
import { buildDepsToolRegistrations } from '@mcp-vertex/deps/lib/tools/tools';
import plugin from '@mcp-vertex/deps';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

describe('deps engine', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deps-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const manifest = (obj: unknown): void =>
		writeFileSync(join(root, 'package.json'), JSON.stringify(obj), 'utf8');

	it('lists deps across sections with ranges and counts', async () => {
		manifest({
			dependencies: { zod: '^4.0.0', a: '1.2.3' },
			devDependencies: { vitest: '^4.0.0' },
		});
		const inv = await listDeps(root);
		expect(inv.found).toBe(true);
		expect(inv.counts.dependencies).toBe(2);
		expect(inv.counts.devDependencies).toBe(1);
		expect(inv.deps.find((d) => d.name === 'zod')?.range).toBe('^4.0.0');
		// sorted by name
		expect(inv.deps[0]?.name).toBe('a');
	});

	it('reports found:false for a missing/torn manifest', async () => {
		expect((await listDeps(root)).found).toBe(false);
		writeFileSync(join(root, 'package.json'), '{ not json', 'utf8');
		expect((await listDeps(root)).found).toBe(false);
	});

	it('checkDeps flags a missing lockfile', async () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		const h = await checkDeps(root);
		expect(h.lockfile.present).toBe(false);
		expect(h.findings.some((f) => f.kind === 'no-lockfile')).toBe(true);
		expect(h.healthy).toBe(false);
	});

	it('checkDeps is healthy with a lockfile and pinned ranges', async () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		writeFileSync(join(root, 'bun.lock'), '');
		const h = await checkDeps(root);
		expect(h.lockfile).toEqual({ present: true, kind: 'bun' });
		expect(h.healthy).toBe(true);
		expect(h.findings).toEqual([]);
	});

	it('flags unpinned ranges and cross-section duplicates', async () => {
		manifest({
			dependencies: { a: '*', b: 'latest', shared: '^1.0.0' },
			devDependencies: { shared: '^1.0.0' },
		});
		writeFileSync(join(root, 'package-lock.json'), '{}');
		const h = await checkDeps(root);
		const kinds = h.findings.map((f) => f.kind);
		expect(kinds).toContain('loose-range'); // a:* and b:latest
		expect(kinds).toContain('duplicate-section'); // shared
		expect(h.findings.filter((f) => f.kind === 'loose-range')).toHaveLength(
			2,
		);
	});

	it('reports no-manifest when absent', async () => {
		const h = await checkDeps(root);
		expect(h.findings[0]?.kind).toBe('no-manifest');
		expect(h.healthy).toBe(false);
	});
});

describe('checkOutdated (M11, injected fetcher — no real network)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deps-outdated-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const manifest = (obj: unknown): void =>
		writeFileSync(join(root, 'package.json'), JSON.stringify(obj), 'utf8');

	it('flags a dep whose latest is newer than the pinned baseline', async () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		const report = await checkOutdated(
			root,
			'package.json',
			async (name) => (name === 'zod' ? '4.5.0' : null),
		);
		expect(report.checked).toBe(1);
		expect(report.outdatedCount).toBe(1);
		expect(report.entries[0]).toMatchObject({
			name: 'zod',
			wanted: '4.0.0',
			latest: '4.5.0',
			outdated: true,
		});
	});

	it('does not flag a dep that is already current', async () => {
		manifest({ dependencies: { zod: '4.5.0' } });
		const report = await checkOutdated(
			root,
			'package.json',
			async () => '4.5.0',
		);
		expect(report.outdatedCount).toBe(0);
		expect(report.entries[0]?.outdated).toBe(false);
	});

	it('skips ranges without a comparable baseline (no error, wanted:null)', async () => {
		manifest({ dependencies: { a: '*', shared: 'workspace:*' } });
		const report = await checkOutdated(
			root,
			'package.json',
			async () => '9.9.9',
		);
		expect(report.entries.every((e) => e.wanted === null)).toBe(true);
		expect(report.outdatedCount).toBe(0);
	});

	it('records a per-package error without failing the whole report', async () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		const report = await checkOutdated(root, 'package.json', async () => {
			throw new Error('registry unreachable');
		});
		expect(report.entries[0]?.error).toContain('registry unreachable');
		expect(report.entries[0]?.outdated).toBe(false);
	});

	it('caps at maxPackages and reports truncated:true', async () => {
		manifest({
			dependencies: { a: '1.0.0', b: '1.0.0', c: '1.0.0' },
		});
		const report = await checkOutdated(
			root,
			'package.json',
			async () => '1.0.0',
			2,
		);
		expect(report.checked).toBe(2);
		expect(report.truncated).toBe(true);
	});
});

describe('deps_outdated tool registration (M11, opt-in)', async () => {
	it('is absent by default (offline by design)', async () => {
		const tools = buildDepsToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: '/ws',
		});
		expect(tools.map((t) => t.id)).toEqual([
			'deps_list',
			'deps_check',
			'deps_polyglot',
		]);
	});

	it('is added with effects:["network"] when allowNetwork is true', async () => {
		const tools = buildDepsToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: '/ws',
			allowNetwork: true,
		});
		expect(tools.map((t) => t.id)).toEqual([
			'deps_list',
			'deps_check',
			'deps_outdated',
			'deps_polyglot',
		]);
		expect(tools.find((t) => t.id === 'deps_outdated')?.effects).toEqual([
			'network',
		]);
	});
});

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
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/deps',
			pluginDocsDir: 'docs/mcp-vertex/deps',
			namespacePrefix: 'deps',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect((reg.tools as IToolRegistration[]).map((t) => t.id)).toEqual([
			'deps_list',
			'deps_check',
			'deps_polyglot',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('deps-usage');
	});
});
