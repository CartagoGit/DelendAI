import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveEmbedIndexPath } from '../../../../src/lib/embed/index-store';
import { runEmbedPipeline } from '../../../../src/lib/embed/embed-pipeline';
import type { IEmbedder } from '../../../../src/lib/embed/embedder';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('embed pipeline', async () => {
	let root = '';
	let pluginCacheDir = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'embed-pipeline-'));
		pluginCacheDir = join(root, '.cache', 'search');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('discovers, embeds, and persists the index', async () => {
		write(root, 'src/a.ts', 'export const alpha = 1;');
		write(root, 'src/b.md', '# beta');
		const calls: string[] = [];
		const embedder: IEmbedder = {
			id: 'mock',
			isAvailable: async () => true,
			embed: async (text: string) => {
				calls.push(text);
				return [text.length, text.length / 10];
			},
		};

		const first = await runEmbedPipeline({
			workspaceRootAbs: root,
			pluginCacheDir,
			embedder,
		});

		expect(first.available).toBe(true);
		expect(first.discoveredCount).toBe(2);
		expect(first.embeddedCount).toBe(2);
		expect(first.reusedCount).toBe(0);
		expect(Object.values(first.index).map((entry) => entry.path)).toEqual([
			'src/a.ts',
			'src/b.md',
		]);
		expect(
			resolveEmbedIndexPath({ workspaceRootAbs: root, pluginCacheDir }),
		).toBeDefined();

		calls.length = 0;
		const second = await runEmbedPipeline({
			workspaceRootAbs: root,
			pluginCacheDir,
			embedder,
		});

		expect(calls).toEqual([]);
		expect(second.embeddedCount).toBe(0);
		expect(second.reusedCount).toBe(2);
	});
});
