import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listDeps, checkDeps } from '@cartago-git/mcp-deps/lib/engine';
import plugin from '@cartago-git/mcp-deps';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@cartago-git/mcp-core/public';

describe('deps engine', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deps-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const manifest = (obj: unknown): void =>
		writeFileSync(join(root, 'package.json'), JSON.stringify(obj), 'utf8');

	it('lists deps across sections with ranges and counts', () => {
		manifest({
			dependencies: { zod: '^4.0.0', a: '1.2.3' },
			devDependencies: { vitest: '^4.0.0' },
		});
		const inv = listDeps(root);
		expect(inv.found).toBe(true);
		expect(inv.counts.dependencies).toBe(2);
		expect(inv.counts.devDependencies).toBe(1);
		expect(inv.deps.find((d) => d.name === 'zod')?.range).toBe('^4.0.0');
		// sorted by name
		expect(inv.deps[0]?.name).toBe('a');
	});

	it('reports found:false for a missing/torn manifest', () => {
		expect(listDeps(root).found).toBe(false);
		writeFileSync(join(root, 'package.json'), '{ not json', 'utf8');
		expect(listDeps(root).found).toBe(false);
	});

	it('checkDeps flags a missing lockfile', () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		const h = checkDeps(root);
		expect(h.lockfile.present).toBe(false);
		expect(h.findings.some((f) => f.kind === 'no-lockfile')).toBe(true);
		expect(h.healthy).toBe(false);
	});

	it('checkDeps is healthy with a lockfile and pinned ranges', () => {
		manifest({ dependencies: { zod: '^4.0.0' } });
		writeFileSync(join(root, 'bun.lock'), '');
		const h = checkDeps(root);
		expect(h.lockfile).toEqual({ present: true, kind: 'bun' });
		expect(h.healthy).toBe(true);
		expect(h.findings).toEqual([]);
	});

	it('flags unpinned ranges and cross-section duplicates', () => {
		manifest({
			dependencies: { a: '*', b: 'latest', shared: '^1.0.0' },
			devDependencies: { shared: '^1.0.0' },
		});
		writeFileSync(join(root, 'package-lock.json'), '{}');
		const h = checkDeps(root);
		const kinds = h.findings.map((f) => f.kind);
		expect(kinds).toContain('loose-range'); // a:* and b:latest
		expect(kinds).toContain('duplicate-section'); // shared
		expect(h.findings.filter((f) => f.kind === 'loose-range')).toHaveLength(2);
	});

	it('reports no-manifest when absent', () => {
		const h = checkDeps(root);
		expect(h.findings[0]?.kind).toBe('no-manifest');
		expect(h.healthy).toBe(false);
	});
});

describe('deps plugin', () => {
	it('registers deps_list + deps_check + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: { cacheDir: '.cache/mcp-core', docsDir: 'docs/mcp-core' },
			cacheDir: '.cache/mcp-core',
			docsDir: 'docs/mcp-core',
			pluginCacheDir: '.cache/mcp-core/deps',
			pluginDocsDir: 'docs/mcp-core/deps',
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
