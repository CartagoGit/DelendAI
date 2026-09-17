/**
 * slice-replay.plugin.spec.ts — a slice committed before this cache
 * existed is not replayed.
 *
 * An adopter project with an empty processed-events store got checkpoints
 * for ten slices committed two days earlier, all in the same minute. The
 * first poll asked only the store, which had never seen them. Driven
 * through the real plugin over a real repository: the contrast case, where
 * the same slice has an uncommitted change, proves the observation would
 * see an emission if one happened.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import plugin from '@delendai/commit-policy';
import type { IMcpPluginContext } from '@delendai/core/public';

import { createTempGitRepo } from '../integration/_fixtures/git-tmp';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
	vi.restoreAllMocks();
});

const contextFor = (root: string): IMcpPluginContext => ({
	workspace: { root, resolve: (p: string) => join(root, p) },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/commit-policy',
	pluginDocsDir: 'docs/delendai/commit-policy',
	namespacePrefix: 'commit-policy',
	options: {
		commit: { enabled: false },
		cadence: { triggers: [{ kind: 'slice', onStatuses: ['done'] }] },
	},
	args: {},
});

/** A repository whose history already holds the slice's file. */
const repoWithDoneSlice = async () => {
	const repo = await createTempGitRepo({ branch: 'develop' });
	await writeFile(join(repo.cwd, 'a.ts'), 'export const a = 1;\n');
	await repo.git('add', '--', 'a.ts');
	await repo.git('commit', '-q', '-m', 'feat(x00001): slice S1');
	// The index lives in the cache, which git ignores in real projects.
	await writeFile(join(repo.cwd, '.gitignore'), '.cache/\n');
	await repo.git('add', '--', '.gitignore');
	await repo.git('commit', '-q', '-m', 'chore: ignore cache');
	const indexDir = join(repo.cwd, '.cache/delendai/proposals');
	await mkdir(indexDir, { recursive: true });
	await writeFile(
		join(indexDir, 'index.json'),
		JSON.stringify({
			proposals: [
				{
					id: 'x00001',
					slices: [{ id: 'S1', status: 'done', files: ['a.ts'] }],
				},
			],
		}),
	);
	return repo;
};

/** Register, let the first poll run, and report the slices it handed on. */
const detectedSlices = async (root: string): Promise<string[]> => {
	const lines: string[] = [];
	const capture = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	vi.spyOn(console, 'warn').mockImplementation(capture);
	vi.spyOn(console, 'debug').mockImplementation(capture);
	const registered = await plugin.register(contextFor(root));
	await new Promise((resolve) => setTimeout(resolve, 400));
	if ('dispose' in registered && typeof registered.dispose === 'function') {
		await registered.dispose();
	}
	return lines.filter((line) => line.includes('"slice.detected"'));
};

describe('first poll with an empty processed-events store', () => {
	it('does not replay a slice whose files are already committed', async () => {
		const repo = await repoWithDoneSlice();
		cleanups.push(repo.cleanup);
		expect(await detectedSlices(repo.cwd)).toEqual([]);
	});

	it('still hands on a done slice that has uncommitted work', async () => {
		const repo = await repoWithDoneSlice();
		cleanups.push(repo.cleanup);
		await writeFile(join(repo.cwd, 'a.ts'), 'export const a = 2;\n');
		const detected = await detectedSlices(repo.cwd);
		expect(detected.length).toBeGreaterThan(0);
		expect(detected[0]).toContain('x00001');
	});
});
