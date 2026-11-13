import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { buildSearchToolRegistrations } from '../../../../src/lib/tools/search.tool';
import type { IEmbedder } from '../../../../src/lib/embed/embedder';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

const vectorFor = (text: string): readonly number[] => {
	if (text === 'needle') {
		return [1, 0, 0];
	}
	if (text.includes('needle beta doc')) {
		return [1, 0, 0];
	}
	if (text.includes('gamma doc semantic')) {
		return [0.8, 0, 0];
	}
	return [0, 1, 0];
};

describe('search semantic tool', async () => {
	it('fuses lexical and vector hits in hybrid mode', async () => {
		const root = mkdtempSync(join(tmpdir(), 'search-semantic-'));
		const pluginCacheDir = join(root, '.cache', 'search');
		write(root, 'src/alpha.ts', 'needle alpha doc');
		write(root, 'src/beta.ts', 'needle beta doc');
		write(root, 'src/gamma.ts', 'gamma doc semantic');
		const embedder: IEmbedder = {
			id: 'mock',
			isAvailable: async () => true,
			embed: async (text: string) => vectorFor(text),
		};

		try {
			const regs = buildSearchToolRegistrations({
				namespacePrefix: 'search',
				workspaceRootAbs: root,
				pluginCacheDir,
				embedder,
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

			const res = await handler!({ query: 'needle', mode: 'hybrid' });
			const body = JSON.parse(res.content[0]!.text) as {
				hits: Array<{ file: string; text: string }>;
				count: number;
			};

			expect(body.count).toBe(3);
			expect(body.hits.map((hit) => hit.file)).toEqual([
				'src/beta.ts',
				'src/alpha.ts',
				'src/gamma.ts',
			]);
			expect(body.hits[2]?.text).toContain('gamma doc semantic');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
