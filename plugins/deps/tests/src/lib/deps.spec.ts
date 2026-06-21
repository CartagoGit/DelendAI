import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	listDeps,
	checkDeps,
	checkOutdated,
} from '@mcp-vertex/deps/lib/engine';
import { buildDepsToolRegistrations } from '@mcp-vertex/deps/lib/tools';
import plugin from '@mcp-vertex/deps';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

describe('deps engine', () => {
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

describe('checkOutdated (M11, injected fetcher — no real network)', () => {
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

describe('deps_outdated tool registration (M11, opt-in)', () => {
	it('is absent by default (offline by design)', () => {
		const tools = buildDepsToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: '/ws',
		});
		expect(tools.map((t) => t.id)).toEqual(['deps_list', 'deps_check']);
	});

	it('is added with effects:["network"] when allowNetwork is true', () => {
		const tools = buildDepsToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: '/ws',
			allowNetwork: true,
		});
		expect(tools.map((t) => t.id)).toEqual([
			'deps_list',
			'deps_check',
			'deps_outdated',
		]);
		expect(tools.find((t) => t.id === 'deps_outdated')?.effects).toEqual([
			'network',
		]);
	});
});

describe('deps plugin', () => {
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
		]);
		expect(reg.knowledge?.[0]?.id).toBe('deps-usage');
	});
});
