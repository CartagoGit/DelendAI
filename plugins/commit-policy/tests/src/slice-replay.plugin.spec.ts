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
 *
 * The same holds after the first poll: a slice that turns `done` because
 * a merge brought in someone else's finished work is a change in the
 * projection, not an act of this host, and must not be persisted as one.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitUntil } from '@delendai/test-kit';

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

const writeIndex = async (
	root: string,
	status: string,
	extra: readonly { id: string; status: string; files: string[] }[] = [],
): Promise<void> => {
	const indexDir = join(root, '.cache/delendai/proposals');
	await mkdir(indexDir, { recursive: true });
	await writeFile(
		join(indexDir, 'index.json'),
		JSON.stringify({
			proposals: [
				{
					id: 'x00001',
					slices: [{ id: 'S1', status, files: ['a.ts'] }, ...extra],
				},
			],
		}),
	);
};

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
	await writeIndex(repo.cwd, 'done');
	return repo;
};

/** Register, let the first poll run, and report the slices it handed on. */
const detectedSlices = async (
	root: string,
	expectDetection = true,
): Promise<string[]> => {
	const lines: string[] = [];
	const capture = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	vi.spyOn(console, 'warn').mockImplementation(capture);
	vi.spyOn(console, 'debug').mockImplementation(capture);
	const registered = await plugin.register(contextFor(root));
	const detected = () =>
		lines.filter((line) => line.includes('"slice.detected"'));
	// Wait for the POLL, not for 400ms. The fixed sleep passed five times
	// out of five locally and failed in CI with `expected 0 to be greater
	// than 0` — the runner was loaded, the poll had not emitted yet, and
	// the assertion read an empty list as a defect.
	//
	// `expectDetection` says which outcome this call is waiting for: a
	// caller expecting NOTHING must not wait ten seconds to find out.
	if (expectDetection) {
		await waitUntil(
			'the first poll reported a detected slice',
			() => detected().length > 0,
		);
	} else {
		await waitUntil('the first poll completed', () => lines.length > 0, {
			timeoutMs: 2_000,
		}).catch(() => {
			// A poll that reported nothing at all is the expected shape
			// here; the assertion below is what judges it.
		});
	}
	if ('dispose' in registered && typeof registered.dispose === 'function') {
		await registered.dispose();
	}
	return detected();
};

describe('first poll with an empty processed-events store', () => {
	it('does not replay a slice whose files are already committed', async () => {
		const repo = await repoWithDoneSlice();
		cleanups.push(repo.cleanup);
		expect(await detectedSlices(repo.cwd, false)).toEqual([]);
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

describe('a slice that turns done after the first poll', () => {
	/**
	 * Register over a `ready` slice, wait for the first poll, then flip it
	 * to `done` the way `prepare` does, and collect what the next polls
	 * report until `until` holds. S0, done with an untracked file, is how
	 * the test knows the first poll has happened: flipping before it would
	 * make the flip part of the baseline, a different path.
	 */
	const afterFlip = async (
		prepare: (root: string) => Promise<void>,
		until: (lines: readonly string[]) => boolean,
	): Promise<string[]> => {
		const repo = await repoWithDoneSlice();
		cleanups.push(repo.cleanup);
		const marker = [{ id: 'S0', status: 'done', files: ['b.ts'] }];
		await writeFile(join(repo.cwd, 'b.ts'), 'export const b = 1;\n');
		await writeIndex(repo.cwd, 'ready', marker);
		const lines: string[] = [];
		const capture = (...args: unknown[]) => {
			lines.push(args.map(String).join(' '));
		};
		vi.spyOn(console, 'warn').mockImplementation(capture);
		vi.spyOn(console, 'debug').mockImplementation(capture);
		const registered = await plugin.register(contextFor(repo.cwd));
		await waitUntil('the first poll handed on S0', () =>
			lines.some((line) => line.includes('"sliceId":"S0"')),
		);
		await prepare(repo.cwd);
		await writeIndex(repo.cwd, 'done', marker);
		await waitUntil('a later poll judged the flipped slice', () =>
			until(lines),
		);
		if (
			'dispose' in registered &&
			typeof registered.dispose === 'function'
		) {
			await registered.dispose();
		}
		return lines;
	};
	const has = (lines: readonly string[], event: string) =>
		lines.some(
			(line) =>
				line.includes(`"${event}"`) && line.includes('"sliceId":"S1"'),
		);

	it('is not persisted when a merge brought it in already committed', async () => {
		const lines = await afterFlip(
			async () => undefined,
			(seen) => has(seen, 'slice.skipped') || has(seen, 'slice.detected'),
		);
		expect(has(lines, 'slice.skipped')).toBe(true);
		expect(has(lines, 'slice.detected')).toBe(false);
	});

	it('is still persisted when its change is uncommitted', async () => {
		const lines = await afterFlip(
			(root) => writeFile(join(root, 'a.ts'), 'export const a = 2;\n'),
			(seen) => has(seen, 'slice.skipped') || has(seen, 'slice.detected'),
		);
		expect(has(lines, 'slice.detected')).toBe(true);
		expect(has(lines, 'slice.skipped')).toBe(false);
	});
});
