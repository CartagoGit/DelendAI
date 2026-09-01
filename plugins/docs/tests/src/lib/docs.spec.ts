import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	listDocs,
	readDoc,
	extractTitle,
} from '@mcp-vertex/docs/lib/services/engine';
import plugin from '@mcp-vertex/docs';
import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('docs engine', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-'));
		write(root, 'README.md', '# The Project\nintro\n');
		write(root, 'docs/guide.md', '# Guide\nbody\n');
		write(
			root,
			'docs/sub/ref.md',
			'---\ntitle: Reference Manual\n---\n# x\n',
		);
		write(root, 'docs/notes.txt', 'not markdown\n');
		write(root, 'src/code.ts', 'const x = 1;\n');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('extractTitle prefers frontmatter title, then first heading, then fallback', async () => {
		expect(extractTitle('---\ntitle: A\n---\n# B', 'f')).toBe('A');
		expect(extractTitle('# Heading here\ntext', 'f')).toBe('Heading here');
		expect(extractTitle('no title at all', 'fallback.md')).toBe(
			'fallback.md',
		);
	});

	it('keeps the exact title extraction for representative frontmatter and heading input', async () => {
		expect(
			extractTitle(
				[
					'---',
					'title: "Reference Manual"',
					'owner: docs',
					'---',
					'# Ignored',
				].join('\n'),
				'fallback.md',
			),
		).toBe('Reference Manual');
		expect(
			extractTitle('preface\n# Real Heading\nbody', 'fallback.md'),
		).toBe('Real Heading');
	});

	it('handles a long unterminated frontmatter block without pathological slowdown', async () => {
		const startedAt = performance.now();
		const raw = `---\n${'owner: docs\n'.repeat(20_000)}# Real Heading\nbody`;
		expect(extractTitle(raw, 'fallback.md')).toBe('Real Heading');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});

	it('lists markdown under default roots (docs + README) with titles', async () => {
		const { docs } = await listDocs(root);
		const byPath = Object.fromEntries(docs.map((d) => [d.path, d.title]));
		expect(byPath['README.md']).toBe('The Project');
		expect(byPath['docs/guide.md']).toBe('Guide');
		expect(byPath['docs/sub/ref.md']).toBe('Reference Manual');
		expect(byPath['docs/notes.txt']).toBeUndefined(); // not markdown
		expect(byPath['src/code.ts']).toBeUndefined(); // outside default roots
	});

	it('a00063: zero docs from nonexistent roots returns a diagnostic naming them', async () => {
		const { docs, diagnostic } = await listDocs(root, {
			roots: ['handbook', 'wiki'],
		});
		expect(docs).toEqual([]);
		expect(diagnostic).toBeDefined();
		expect(diagnostic).toContain('handbook');
		expect(diagnostic).toContain('do not exist');
	});

	it('a00063: no diagnostic when docs were found', async () => {
		const { docs, diagnostic } = await listDocs(root);
		expect(docs.length).toBeGreaterThan(0);
		expect(diagnostic).toBeUndefined();
	});

	it('a00062: matches when options.extensions is dot-prefixed (the config authoring convention)', async () => {
		const { docs } = await listDocs(root, { extensions: ['.md'] });
		const paths = docs.map((d) => d.path);
		expect(paths).toContain('README.md');
		expect(paths).toContain('docs/guide.md');
	});

	it('honours injected roots', async () => {
		const { docs } = await listDocs(root, { roots: ['docs'] });
		expect(docs.every((d) => d.path.startsWith('docs/'))).toBe(true);
	});

	it('reads a doc by path and returns its title + content', async () => {
		const d = await readDoc(root, 'docs/guide.md');
		expect(d.found).toBe(true);
		expect(d.title).toBe('Guide');
		expect(d.content).toContain('body');
	});

	it('refuses path traversal outside the workspace', async () => {
		const d = await readDoc(root, '../../../etc/passwd');
		expect(d.found).toBe(false);
		expect(d.content).toBe('');
	});

	it('reports found:false for a missing doc', async () => {
		expect((await readDoc(root, 'docs/nope.md')).found).toBe(false);
	});

	// x00185 (F14): readDoc never enforced the same .md/.mdx filter
	// listDocs applies — a caller who knew a relative path could read
	// ANY workspace file, widening the surface from "read documentation"
	// to "read any file the workspace can see".
	it('refuses a non-markdown file even though it exists and is contained', async () => {
		const notes = await readDoc(root, 'docs/notes.txt');
		expect(notes.found).toBe(false);
		expect(notes.content).toBe('');
		expect(notes.reason).toBe('not-a-markdown-file');

		const source = await readDoc(root, 'src/code.ts');
		expect(source.found).toBe(false);
		expect(source.content).toBe('');
		expect(source.reason).toBe('not-a-markdown-file');
	});
});

describe('docs plugin', async () => {
	it('registers docs_list + docs_read + docs_search + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/docs',
			pluginDocsDir: 'docs/mcp-vertex/docs',
			namespacePrefix: 'docs',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect((reg.tools as IToolRegistration[]).map((t) => t.id)).toEqual([
			'docs_list',
			'docs_read',
			'docs_search',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('docs-usage');
	});
});
