import {
	lstat,
	mkdir,
	readFile,
	readdir,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCacheLayoutHelpers } from '@delendai/core/lib/cache/cache-layout-helpers.service';
import { CACHE_LAYOUT_MANIFEST } from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const workspaces: string[] = [];

afterEach(() => {
	for (const root of workspaces.splice(0)) removeTestWorkspace(root);
});

const setup = async (dryRun = false) => {
	const root = createTestWorkspace('delendai-helpers-');
	workspaces.push(root);
	const cacheDirAbs = join(root, '.cache', 'delendai');
	await mkdir(cacheDirAbs, { recursive: true });
	const helpers = createCacheLayoutHelpers({
		cacheDirAbs,
		manifest: CACHE_LAYOUT_MANIFEST,
		dryRun,
	});
	return { root, cacheDirAbs, helpers };
};

const put = async (path: string, content: string): Promise<void> => {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, content, 'utf8');
};

describe('dropDerived', () => {
	it('removes a legacy path and keeps what is not legacy beside it', async () => {
		const { cacheDirAbs, helpers } = await setup();
		await put(join(cacheDirAbs, 'old-index', 'index.json'), '{}');
		await put(join(cacheDirAbs, 'results', 'memory', 'notes.json'), 'keep');
		await put(join(cacheDirAbs, 'unknown-plugin', 'data.json'), 'keep');
		await helpers.dropDerived('old-index');
		expect(await helpers.pathExists('old-index')).toBe(false);
		expect(
			await readFile(
				join(cacheDirAbs, 'results', 'memory', 'notes.json'),
				'utf8',
			),
		).toBe('keep');
		expect(
			await readFile(
				join(cacheDirAbs, 'unknown-plugin', 'data.json'),
				'utf8',
			),
		).toBe('keep');
	});

	it.each([
		'results/memory',
		'results/memory/notes.json',
		'results',
		'commit-policy',
	])('hard-fails on %s and leaves it intact', async (target) => {
		const { cacheDirAbs, helpers } = await setup();
		await put(join(cacheDirAbs, 'results', 'memory', 'notes.json'), 'keep');
		await put(join(cacheDirAbs, 'commit-policy', 'state.json'), 'keep');
		await expect(helpers.dropDerived(target)).rejects.toThrow(
			/refusing to drop/,
		);
		expect(
			await readFile(
				join(cacheDirAbs, 'results', 'memory', 'notes.json'),
				'utf8',
			),
		).toBe('keep');
		expect(
			await readFile(
				join(cacheDirAbs, 'commit-policy', 'state.json'),
				'utf8',
			),
		).toBe('keep');
	});

	it('does not follow a symlink out of the cache', async () => {
		const { root, cacheDirAbs, helpers } = await setup();
		const outside = join(root, 'outside');
		await put(join(outside, 'precious.txt'), 'keep');
		await symlink(outside, join(cacheDirAbs, 'escape'));
		await expect(
			helpers.dropDerived('escape/precious.txt'),
		).rejects.toThrow(/outside the cache directory/);
		expect(await readFile(join(outside, 'precious.txt'), 'utf8')).toBe(
			'keep',
		);
	});

	it('removes a symlink that is itself the target, not what it points to', async () => {
		const { root, cacheDirAbs, helpers } = await setup();
		const outside = join(root, 'outside');
		await put(join(outside, 'precious.txt'), 'keep');
		await symlink(outside, join(cacheDirAbs, 'old-link'));
		await helpers.dropDerived('old-link');
		await expect(lstat(join(cacheDirAbs, 'old-link'))).rejects.toThrow();
		expect(await readFile(join(outside, 'precious.txt'), 'utf8')).toBe(
			'keep',
		);
	});

	it('rejects a path that climbs out', async () => {
		const { helpers } = await setup();
		await expect(helpers.dropDerived('../outside')).rejects.toThrow(
			/not contained/,
		);
	});
});

describe('moveIfDestinationMissing', () => {
	it('moves into a free destination', async () => {
		const { cacheDirAbs, helpers } = await setup();
		await put(join(cacheDirAbs, 'memory', 'notes.json'), 'old');
		expect(
			await helpers.moveIfDestinationMissing('memory', 'results/memory'),
		).toBe('moved');
		expect(
			await readFile(
				join(cacheDirAbs, 'results', 'memory', 'notes.json'),
				'utf8',
			),
		).toBe('old');
		expect(await helpers.pathExists('memory')).toBe(false);
	});

	it('never overwrites: a present destination is a conflict and both survive', async () => {
		const { cacheDirAbs, helpers } = await setup();
		await put(join(cacheDirAbs, 'memory', 'notes.json'), 'old');
		await put(join(cacheDirAbs, 'results', 'memory', 'notes.json'), 'new');
		expect(
			await helpers.moveIfDestinationMissing('memory', 'results/memory'),
		).toBe('skipped-conflict');
		expect(
			await readFile(join(cacheDirAbs, 'memory', 'notes.json'), 'utf8'),
		).toBe('old');
		expect(
			await readFile(
				join(cacheDirAbs, 'results', 'memory', 'notes.json'),
				'utf8',
			),
		).toBe('new');
	});

	it('reports a missing source without creating the destination', async () => {
		const { helpers } = await setup();
		expect(
			await helpers.moveIfDestinationMissing('memory', 'results/memory'),
		).toBe('skipped-missing-source');
		expect(await helpers.pathExists('results')).toBe(false);
	});
});

describe('removeEmptyDirectory', () => {
	it('removes an empty directory and keeps a non-empty one', async () => {
		const { cacheDirAbs, helpers } = await setup();
		await mkdir(join(cacheDirAbs, 'empty'));
		await put(join(cacheDirAbs, 'full', 'a.txt'), 'x');
		await helpers.removeEmptyDirectory('empty');
		await helpers.removeEmptyDirectory('full');
		await helpers.removeEmptyDirectory('absent');
		expect(await readdir(cacheDirAbs)).toEqual(['full']);
	});
});

describe('in a dry run', () => {
	it('lets a migration look and refuses every change', async () => {
		const { cacheDirAbs, helpers } = await setup(true);
		await put(join(cacheDirAbs, 'old', 'a.txt'), 'x');
		expect(await helpers.pathExists('old')).toBe(true);
		await expect(helpers.dropDerived('old')).rejects.toThrow(/dry run/);
		await expect(
			helpers.moveIfDestinationMissing('old', 'new'),
		).rejects.toThrow(/dry run/);
		await expect(helpers.removeEmptyDirectory('old')).rejects.toThrow(
			/dry run/,
		);
		expect(await helpers.pathExists('old')).toBe(true);
	});
});
