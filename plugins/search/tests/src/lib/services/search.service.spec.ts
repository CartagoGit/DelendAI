import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchWorkspace } from '@delendai/search/lib/services/search-engine.service';
import { buildSearchToolRegistrations } from '@delendai/search/lib/tools/search.tool';
import plugin from '@delendai/search';
import type { IMcpPluginContext } from '@delendai/core/public';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('searchWorkspace', async () => {
	let root = '';
	let outsideRoot = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-'));
		outsideRoot = mkdtempSync(join(tmpdir(), 'search-outside-'));
		write(
			root,
			'src/a.ts',
			'export const foo = 1;\nconst bar = foo + 2;\n',
		);
		write(root, 'src/b.md', '# Title\nmentions foo in prose\n');
		write(root, 'node_modules/dep/index.js', 'foo everywhere foo\n');
		write(root, 'data.bin.png', 'foo binary not matched by ext\n');
		write(outsideRoot, 'secret.ts', 'export const foo = 99;\n');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(outsideRoot, { recursive: true, force: true });
	});

	it('finds matches with file (relative) and 1-based line numbers', async () => {
		const res = await searchWorkspace(root, 'foo');
		const files = res.hits.map((h) => h.file);
		expect(files).toContain('src/a.ts');
		expect(files).toContain('src/b.md');
		const first = res.hits.find((h) => h.file === 'src/a.ts');
		expect(first?.line).toBe(1);
		expect(first?.text).toContain('foo');
	});

	it('skips node_modules and non-text extensions by default', async () => {
		const res = await searchWorkspace(root, 'foo');
		const files = res.hits.map((h) => h.file);
		expect(files.some((f) => f.includes('node_modules'))).toBe(false);
		expect(files).not.toContain('data.bin.png');
	});

	it('is case-insensitive by default and case-sensitive on request', async () => {
		expect(
			(await searchWorkspace(root, 'FOO')).hits.length,
		).toBeGreaterThan(0);
		expect(
			(await searchWorkspace(root, 'FOO', { caseSensitive: true })).hits,
		).toEqual([]);
	});

	it('a00063: scanned:0 from nonexistent roots returns a diagnostic naming them', async () => {
		const res = await searchWorkspace(root, 'foo', {
			roots: ['packages', 'plugins', 'apps'],
		});
		expect(res.scanned).toBe(0);
		expect(res.diagnostic).toBeDefined();
		expect(res.diagnostic).toContain('packages');
		expect(res.diagnostic).toContain('do not exist');
	});

	it('a00063: scanned:0 from absolute/escaping roots returns a diagnostic naming the rejection', async () => {
		const res = await searchWorkspace(root, 'foo', {
			roots: ['/some/other/repo', '../outside'],
		});
		expect(res.scanned).toBe(0);
		expect(res.diagnostic).toBeDefined();
		expect(res.diagnostic).toContain('stay inside the workspace');
	});

	it('rejects roots that lexically stay inside the workspace but resolve outside via symlink', async () => {
		symlinkSync(outsideRoot, join(root, 'linked-outside'));
		const res = await searchWorkspace(root, 'foo', {
			roots: ['linked-outside'],
		});
		expect(res.scanned).toBe(0);
		expect(res.hits).toEqual([]);
		expect(res.diagnostic).toContain('linked-outside');
		expect(res.diagnostic).toContain('stay inside the workspace');
	});

	it('a00063: no diagnostic when files were actually scanned', async () => {
		const res = await searchWorkspace(root, 'zzz-no-match-zzz');
		expect(res.scanned).toBeGreaterThan(0);
		expect(res.hits).toEqual([]);
		expect(res.diagnostic).toBeUndefined();
	});

	it('a00062: matches when options.extensions is dot-prefixed (the config authoring convention)', async () => {
		const res = await searchWorkspace(root, 'foo', {
			extensions: ['.ts', '.md'],
		});
		const files = res.hits.map((h) => h.file);
		expect(files).toContain('src/a.ts');
		expect(files).toContain('src/b.md');
	});

	it('returns empty for a blank query without scanning', async () => {
		const res = await searchWorkspace(root, '   ');
		expect(res.hits).toEqual([]);
		expect(res.scanned).toBe(0);
	});

	it('caps results and flags truncated', async () => {
		write(
			root,
			'many.txt',
			Array.from({ length: 10 }, () => 'foo').join('\n'),
		);
		const res = await searchWorkspace(root, 'foo', { maxResults: 3 });
		expect(res.hits).toHaveLength(3);
		expect(res.truncated).toBe(true);
	});

	it('honours injected roots', async () => {
		const res = await searchWorkspace(root, 'foo', { roots: ['src'] });
		expect(res.hits.every((h) => h.file.startsWith('src/'))).toBe(true);
	});
});

describe('search plugin', async () => {
	const ctx = (root: string): IMcpPluginContext =>
		({
			workspace: { root, resolve: (p: string) => join(root, p) },
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
			},
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: '.cache/delendai/search',
			pluginDocsDir: 'docs/delendai/search',
			namespacePrefix: 'search',
			options: {},
			args: {},
		}) satisfies IMcpPluginContext;

	it('registers the search tool + knowledge', async () => {
		const reg = await plugin.register(ctx('/ws'));
		expect(reg.tools?.map((t) => t.id)).toEqual(['search']);
		expect(reg.knowledge?.[0]?.id).toBe('search-usage');
	});

	it('search tool returns structured hits via the handler', async () => {
		const root = mkdtempSync(join(tmpdir(), 'search-tool-'));
		write(root, 'x.ts', 'needle here\n');
		try {
			const regs = buildSearchToolRegistrations({
				namespacePrefix: 'search',
				workspaceRootAbs: root,
			});
			let handler: (a: unknown) => Promise<{
				content: Array<{ text: string }>;
				structuredContent?: Record<string, unknown>;
			}>;
			await regs[0]!.register({
				registerTool: (_n: string, _d: unknown, h: typeof handler) => {
					handler = h;
				},
			} as never);
			const res = await handler!({ query: 'needle' });
			const body = JSON.parse(res.content[0]!.text) as {
				count: number;
				hits: Array<{ file: string }>;
			};
			expect(body.count).toBe(1);
			expect(body.hits[0]?.file).toBe('x.ts');
			// MCP modern structuredContent mirror.
			expect(res.structuredContent?.count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
