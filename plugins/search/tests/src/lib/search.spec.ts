import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchWorkspace } from '@cartago-git/mcp-search/lib/engine';
import { buildSearchToolRegistrations } from '@cartago-git/mcp-search/lib/tools';
import plugin from '@cartago-git/mcp-search';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@cartago-git/mcp-core/public';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('searchWorkspace', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-'));
		write(root, 'src/a.ts', 'export const foo = 1;\nconst bar = foo + 2;\n');
		write(root, 'src/b.md', '# Title\nmentions foo in prose\n');
		write(root, 'node_modules/dep/index.js', 'foo everywhere foo\n');
		write(root, 'data.bin.png', 'foo binary not matched by ext\n');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('finds matches with file (relative) and 1-based line numbers', () => {
		const res = searchWorkspace(root, 'foo');
		const files = res.hits.map((h) => h.file);
		expect(files).toContain('src/a.ts');
		expect(files).toContain('src/b.md');
		const first = res.hits.find((h) => h.file === 'src/a.ts');
		expect(first?.line).toBe(1);
		expect(first?.text).toContain('foo');
	});

	it('skips node_modules and non-text extensions by default', () => {
		const res = searchWorkspace(root, 'foo');
		const files = res.hits.map((h) => h.file);
		expect(files.some((f) => f.includes('node_modules'))).toBe(false);
		expect(files).not.toContain('data.bin.png');
	});

	it('is case-insensitive by default and case-sensitive on request', () => {
		expect(searchWorkspace(root, 'FOO').hits.length).toBeGreaterThan(0);
		expect(searchWorkspace(root, 'FOO', { caseSensitive: true }).hits).toEqual(
			[]
		);
	});

	it('returns empty for a blank query without scanning', () => {
		const res = searchWorkspace(root, '   ');
		expect(res.hits).toEqual([]);
		expect(res.scanned).toBe(0);
	});

	it('caps results and flags truncated', () => {
		write(root, 'many.txt', Array.from({ length: 10 }, () => 'foo').join('\n'));
		const res = searchWorkspace(root, 'foo', { maxResults: 3 });
		expect(res.hits).toHaveLength(3);
		expect(res.truncated).toBe(true);
	});

	it('honours injected roots', () => {
		const res = searchWorkspace(root, 'foo', { roots: ['src'] });
		expect(res.hits.every((h) => h.file.startsWith('src/'))).toBe(true);
	});
});

describe('search plugin', () => {
	const ctx = (root: string): IMcpPluginContext =>
		({
			workspace: { root, resolve: (p: string) => join(root, p) },
			corePaths: { cacheDir: '.cache/mcp-core', docsDir: 'docs/mcp-core' },
			cacheDir: '.cache/mcp-core',
			docsDir: 'docs/mcp-core',
			pluginCacheDir: '.cache/mcp-core/search',
			pluginDocsDir: 'docs/mcp-core/search',
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
