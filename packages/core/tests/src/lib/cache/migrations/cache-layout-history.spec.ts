import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetCacheLayoutEpochMemo } from '@delendai/core/lib/cache/run-pending-cache-layout-migrations.service';
import { createFileLifecycleStateStore } from '@delendai/core/lib/cache/file-lifecycle-state-store.service';
import { CACHE_LAYOUT_EPOCH } from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import { runCacheLayoutStep } from '@delendai/core/lib/workspace-migration/cache-layout-step.service';
import { createTestWorkspace, removeTestWorkspace } from '../../test-workspace';

const workspaces: string[] = [];

const put = async (path: string, content: string): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, 'utf8');
};

const setup = async (cacheDir = '.cache/delendai') => {
	const root = createTestWorkspace('delendai-history-');
	workspaces.push(root);
	await put(join(root, 'delendai.config.json'), JSON.stringify({ cacheDir }));
	return { root, cache: join(root, cacheDir) };
};

const listing = async (dir: string): Promise<readonly string[]> =>
	(await readdir(dir, { recursive: true })).sort();

beforeEach(() => resetCacheLayoutEpochMemo());
afterEach(() => {
	for (const root of workspaces.splice(0)) removeTestWorkspace(root);
});

describe('the shipped cache layout history', () => {
	it('moves every pre-results record and keeps its content', async () => {
		const { root, cache } = await setup();
		await put(join(cache, 'memory', 'notes.json'), 'notes');
		await put(join(cache, 'logs', '2026-01-01.jsonl'), 'log');
		await put(join(cache, 'logs-errors', 'e.jsonl'), 'err');
		await put(join(cache, 'usage-tracking', 'u.jsonl'), 'use');
		const result = await runCacheLayoutStep(root, false);
		expect(result.status).toBe('migrated');
		for (const [path, body] of [
			['results/memory/notes.json', 'notes'],
			['results/logs/2026-01-01.jsonl', 'log'],
			['results/logs-errors/e.jsonl', 'err'],
			['results/usage-tracking/u.jsonl', 'use'],
		] as const)
			expect(await readFile(join(cache, path), 'utf8')).toBe(body);
		expect((await readdir(cache)).sort()).toEqual(['results']);
		expect(
			await createFileLifecycleStateStore(root).getAppliedEpoch(
				'cache-layout',
			),
		).toBe(CACHE_LAYOUT_EPOCH);
	});

	it('merges into an existing results tree without overwriting a record', async () => {
		const { root, cache } = await setup();
		await put(join(cache, 'memory', 'old.json'), 'old');
		await put(join(cache, 'memory', 'same.json'), 'legacy copy');
		await put(
			join(cache, 'results', 'memory', 'same.json'),
			'current copy',
		);
		await runCacheLayoutStep(root, false);
		expect(
			await readFile(join(cache, 'results/memory/old.json'), 'utf8'),
		).toBe('old');
		expect(
			await readFile(join(cache, 'results/memory/same.json'), 'utf8'),
		).toBe('current copy');
		// The conflicting legacy copy is kept, not discarded.
		expect(await readFile(join(cache, 'memory/same.json'), 'utf8')).toBe(
			'legacy copy',
		);
	});

	it('keeps everything it does not know', async () => {
		const { root, cache } = await setup();
		await put(join(cache, 'memory', 'notes.json'), 'n');
		await put(join(cache, 'third-party-plugin', 'data.bin'), 'mine');
		await put(join(cache, 'results', 'auto-agent-selector', 's.json'), 's');
		await put(join(cache, 'agents.lock.json'), '{}');
		await runCacheLayoutStep(root, false);
		expect(
			await readFile(join(cache, 'third-party-plugin/data.bin'), 'utf8'),
		).toBe('mine');
		expect(
			await readFile(
				join(cache, 'results/auto-agent-selector/s.json'),
				'utf8',
			),
		).toBe('s');
		expect(await readFile(join(cache, 'agents.lock.json'), 'utf8')).toBe(
			'{}',
		);
	});

	it('renames leftover dotted scratch and operational directories', async () => {
		const { root, cache } = await setup();
		await put(join(cache, '.verify-tmp', 'x'), 'x');
		await put(join(cache, '.commit-policy', 'state.json'), 's');
		await runCacheLayoutStep(root, false);
		expect(await readFile(join(cache, 'verify-tmp/x'), 'utf8')).toBe('x');
		expect(
			await readFile(join(cache, 'commit-policy/state.json'), 'utf8'),
		).toBe('s');
	});

	it('a dry run plans the moves and changes nothing', async () => {
		const { root, cache } = await setup();
		await put(join(cache, 'memory', 'notes.json'), 'n');
		const before = await listing(root);
		const result = await runCacheLayoutStep(root, true);
		expect(result.status).toBe('planned');
		if (result.status !== 'planned') return;
		expect(
			result.pending.flatMap((s) => s.steps.map((x) => x.detail)),
		).toEqual(['memory -> results/memory']);
		expect(await listing(root)).toEqual(before);
	});

	it('works on a custom cacheDir and leaves the default one alone', async () => {
		const { root, cache } = await setup('.foo/bar');
		await put(join(cache, 'memory', 'n.json'), 'custom');
		await put(join(root, '.cache/delendai/memory/n.json'), 'default');
		await runCacheLayoutStep(root, false);
		expect(
			await readFile(join(cache, 'results/memory/n.json'), 'utf8'),
		).toBe('custom');
		expect(
			await readFile(join(root, '.cache/delendai/memory/n.json'), 'utf8'),
		).toBe('default');
	});

	it('is a no-op on the second run', async () => {
		const { root, cache } = await setup();
		await put(join(cache, 'memory', 'n.json'), 'n');
		await runCacheLayoutStep(root, false);
		const after = await listing(root);
		resetCacheLayoutEpochMemo();
		expect(await runCacheLayoutStep(root, false)).toEqual({
			status: 'current',
		});
		expect(await listing(root)).toEqual(after);
	});

	it('a records directory that is a symlink out of the cache is not followed', async () => {
		const { root, cache } = await setup();
		const outside = join(root, 'outside');
		await put(join(outside, 'precious.txt'), 'keep');
		await mkdir(cache, { recursive: true });
		const { symlink } = await import('node:fs/promises');
		await symlink(outside, join(cache, 'memory'));
		const result = await runCacheLayoutStep(root, false);
		expect(result.status === 'migrated' || result.status === 'failed').toBe(
			true,
		);
		expect(await readFile(join(outside, 'precious.txt'), 'utf8')).toBe(
			'keep',
		);
	});
});
