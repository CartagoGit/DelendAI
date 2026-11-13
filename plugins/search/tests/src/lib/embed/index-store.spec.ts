import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createEmbedIndexStore,
	resolveEmbedIndexPath,
} from '../../../../src/lib/embed/index-store';
import { runEmbedPipeline } from '../../../../src/lib/embed/embed-pipeline';
import type { IEmbedder } from '../../../../src/lib/embed/embedder';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('embed index store', async () => {
	let root = '';
	let pluginCacheDir = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'embed-store-'));
		pluginCacheDir = join(root, '.cache', 'search');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('round-trips the on-disk JSON index', async () => {
		const store = createEmbedIndexStore({
			workspaceRootAbs: root,
			pluginCacheDir,
		});
		await store.save({
			abc: {
				path: 'src/a.ts',
				mtimeMs: 123,
				vector: [1, 0, 0],
			},
		});

		const loaded = await store.load();
		const raw = readFileSync(
			resolveEmbedIndexPath({ workspaceRootAbs: root, pluginCacheDir }),
			'utf8',
		);

		expect(loaded).toEqual({
			abc: {
				path: 'src/a.ts',
				mtimeMs: 123,
				vector: [1, 0, 0],
			},
		});
		expect(raw).toContain('src/a.ts');
	});

	it('re-embeds only changed files when the content hash changes', async () => {
		write(root, 'src/a.ts', 'alpha');
		write(root, 'src/b.ts', 'beta');
		const calls: string[] = [];
		const embedder: IEmbedder = {
			id: 'mock',
			isAvailable: async () => true,
			embed: async (text: string) => {
				calls.push(text);
				return [text.length, 1];
			},
		};

		await runEmbedPipeline({
			workspaceRootAbs: root,
			pluginCacheDir,
			embedder,
		});
		expect(calls).toEqual(['alpha', 'beta']);

		calls.length = 0;
		write(root, 'src/a.ts', 'alpha changed');
		await runEmbedPipeline({
			workspaceRootAbs: root,
			pluginCacheDir,
			embedder,
		});

		expect(calls).toEqual(['alpha changed']);
	});
});
