/**
 * index-identity.spec.ts — the embed index keeps one entry per path and
 * content, and a cached vector is reused only for the embedder and
 * dimension that produced it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IEmbedder } from '../../../../src/lib/embed/embedder';
import { runEmbedPipeline } from '../../../../src/lib/embed/embed-pipeline';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

const project = (files: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), 'embed-identity-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
};

const embedderOf = (id: string, dimension: number): IEmbedder => ({
	id,
	isAvailable: async () => true,
	embed: async () => Array.from({ length: dimension }, () => 1),
});

describe('embed index identity', () => {
	it('keeps both paths that hold identical contents', async () => {
		const root = project({ 'src/a.ts': 'same', 'src/b.ts': 'same' });
		const result = await runEmbedPipeline({
			workspaceRootAbs: root,
			pluginCacheDir: join(root, '.cache', 'search'),
			embedder: embedderOf('mock', 2),
		});
		expect(Object.values(result.index).map((e) => e.path)).toEqual([
			'src/a.ts',
			'src/b.ts',
		]);
	});

	it('re-embeds when the embedder or its dimension changes', async () => {
		const root = project({ 'src/a.ts': 'alpha' });
		const options = {
			workspaceRootAbs: root,
			pluginCacheDir: join(root, '.cache', 'search'),
		};
		await runEmbedPipeline({ ...options, embedder: embedderOf('one', 2) });
		const same = await runEmbedPipeline({
			...options,
			embedder: embedderOf('one', 2),
		});
		expect(same.reusedCount).toBe(1);
		const otherId = await runEmbedPipeline({
			...options,
			embedder: embedderOf('two', 2),
		});
		expect(otherId.embeddedCount).toBe(1);
		const otherDim = await runEmbedPipeline({
			...options,
			embedder: embedderOf('two', 3),
			expectedDimension: 3,
		});
		expect(otherDim.embeddedCount).toBe(1);
		expect(Object.values(otherDim.index)[0]?.vector).toHaveLength(3);
	});
});
